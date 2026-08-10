# 修改紀錄

用來記錄每次跨機器（Mac / Windows）作業時做的重要調整，方便日後查找原因，不用每次都翻 `git log`。

---

## 2026-08-04 — Mac 端環境整理：修復跨平台換行符號問題

**背景**：這台 Mac 上 `git status` 顯示 `app.js`、`main.py`、`backtest_engine.py` 等十幾個檔案「整檔修改」，比對後發現內容其實完全沒變，純粹是檔案在 Windows 端被存成 CRLF 換行，`start.command` / `start_backtest.command` 也同時被拔掉了可執行權限（100755 → 100644）。

**處理**：
- 捨棄工作目錄裡這些純換行符號差異，還原成與 GitHub 一致的內容。
- 新增 `.gitattributes`，強制所有文字檔統一用 LF 換行，`.command` 腳本強制保留可執行權限 — 之後不論在 Mac 或 Windows 編輯都不會再整檔誤判成修改。
- 把 `.DS_Store`、`backtest_engine.log`、`server.log` 從 git 追蹤中移除（本機檔案保留，只是不再進版控），讓既有的 `.gitignore` 規則真正生效。
- `.gitignore` 新增規則忽略 `.app` 內的 `_CodeSignature/`（macOS 第一次執行未簽章 App 會自動重新簽章，每台機器都會產生差異，不需要進版控）。

Commit：[`36ce91e`](https://github.com/juj58612/AI_Trading/commit/36ce91e)

---

## 2026-08-04 — 接上閒置的「三合一巨觀風控」，回測與實戰下單建議都套用

**背景**：`strategy_core.py` 裡的 `evaluate_macro_3in1_status()`（外資期貨淨空單/台幣急貶/外資現貨大賣，觸發時否決新建倉或砍半資金）雖然 `doc.html` 文件宣稱已經在保護策略，但實際上程式碼裡從未被任何地方呼叫過，回測跟實戰都是死碼。追查「2025-2026 樣本外測試普遍虧損」的原因時發現：83% 的交易都是進場後很快停損，時間點跟這個風控本該亮燈的期間有重疊。

**處理**：
- `backtest_engine.py` 新增 `fetch_macro_3in1_series()`，從 FinMind 抓歷史台指期外資未平倉、USD/TWD 匯率、全市場外資買賣超，逐日算出風控訊號，套用在回測進場邏輯（否決新建倉 / 資金砍半）。
- 實測 Strategy D 樣本外 2025-01~2026-08：總報酬 -20.39% → **-5.25%**，MDD 48.57% → 39.72%，獲利因子 0.81 → 0.96（十九個月裡風控否決了 16 週）。
- `main.py` 的 `/api/planner/recommendations`（下單執行中心的即時建議）比照套用同一套風控，紅燈否決新買單/加碼，黃燈砍半可用資金，賣出訊號不受影響；抓取失敗時 fail-open（不套用風控，不阻擋原本流程）。
- 順便把 `backtest_logs.db`、`backtest_database.json` 從 git 追蹤移除（早於 `.gitignore` 規則的舊帳，每次跑回測都會被 git 偵測成幾十 MB 的異動）。

Commit：[`418ead7`](https://github.com/juj58612/AI_Trading/commit/418ead7)（回測引擎接線）、[`ae457b7`](https://github.com/juj58612/AI_Trading/commit/ae457b7)（實戰下單建議接線 + DB 清理）

---

## 2026-08-04 — 修正市況文字跟三合一風控互相矛盾的問題

**背景**：上面那次接線只讓「買進建議清單」聽三合一風控的話，但畫面上的「市況判斷」文字（穩定多頭/全面進攻…）是另一套獨立邏輯，只看大盤廣度。實測發現黃燈風控觸發時，畫面會同時出現「全面進攻，買滿排名前三」的文字，跟實際被砍半/清空的建議清單互相矛盾，容易誤導判斷。

**處理**：`main.py` 的 `/api/planner/recommendations` 在風控觸發時，讓 `market_status`/`market_advice`/`market_color` 一併改口說明風控狀態，沿用系統既有的「觀望＝綠、築底＝黃橘」配色語意，不新增配色規則。

Commit：[`1ab864f`](https://github.com/juj58612/AI_Trading/commit/1ab864f)

---

## 2026-08-10 — Windows 端資安總清查 + 使用者帳號改用 Firebase 永久保存

**背景**：這台 Windows 電腦這次對話發現整個公開 repo 有嚴重的機密外洩問題（管理者密碼、FinMind token 直接寫死在 `main.py` 跟前端 JS 裡，任何人看原始碼都找得到），順帶清查出好幾個既有 bug。

**處理（資安）**：
- 密碼/token/邀請碼全部改讀環境變數，不寫死在程式碼；用 `git filter-repo` 改寫過 git 歷史清掉舊機密的 commit 紀錄（**Mac 端如果 `git pull` 失敗，要改用 `git fetch && git reset --hard origin/main`**）。
- 修掉 `history.js`/`order_planner.js` 的認證繞過漏洞（沒登入卻被當管理者）。
- 管理者密碼目前設定為使用者知情狀況下選定的舊密碼，之後如果又要換，直接改 Render 環境變數即可。

**處理（穩定性）**：
- Render 上 `yfinance` 被 Yahoo 官方封鎖雲端 IP 的問題（改用 `curl_cffi` 偽裝瀏覽器連線）。
- FinMind API 逾時從 5 秒延長到 8 秒 + 失敗重試一次。
- 修掉下單執行中心跟首頁掃描資料「顯示不同天資料」的一致性 bug（下單頁改成快取沒命中時自己即時掃描，不再依賴使用者先去首頁掃過）。

**處理（回測實驗室 UI）**：
- `backtest.html` 雲端版跟本機版畫面改成完全一致，雲端版操作元件用 `disabled` 鎖住而不是整塊隱藏，避免同一個網址在兩邊看到完全不同內容。
- 新增「個股買賣交易明細」表格（可查看/匯出頂尖策略組合的逐筆股票買賣紀錄，跟排行榜的方案層級統計是不同東西）。

**處理（使用者帳號持久化）**：
- 發現 `registered_users.json`（自助註冊帳密）因為正確地被排除在 git 之外（避免明碼密碼外洩），導致每次 Render 重新部署都會被清空，所有自助註冊帳號都會消失。
- 改成存進 **Firebase Firestore**（新的免費雲端資料庫，環境變數 `FIREBASE_SERVICE_ACCOUNT_JSON`），本機測試確認：重啟伺服器後帳號依然存在，證明真的持久化了。
- 順便把密碼存放方式改成 `bcrypt` 雜湊，不再存明碼（就算 Firestore 資料外流，密碼本身也不會直接洩漏）。
- **注意**：這次只完成本機測試 + 程式碼 push，**Render 上的 `FIREBASE_SERVICE_ACCOUNT_JSON` 環境變數還沒設定**，正式站的自助註冊/登入在那之前應該還是壞的，細節見 `NEXT_SESSION_HANDOFF.md`。

Commit：[`3d62917`](https://github.com/juj58612/AI_Trading/commit/3d62917)（Firestore + bcrypt，最後一個 commit，之前還有一長串資安/穩定性 commit）
