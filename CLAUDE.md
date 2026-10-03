# AI_Trading — Claude Code 專案指引

台股 AI 概念股量化交易策略控制台。這份檔案會被 git 推上**公開** repo，**不准寫入任何密碼、API 金鑰、邀請碼、token**，只寫「值放在哪裡」。

## 開工第一步（每次新對話）

1. `git fetch` 並比對 `origin/main` 與 `HEAD`。使用者在 Mac mini + 兩台 Windows（`D:\AI_Trading`，其中一台叫 WIN2）平行開發，本機常常落後；落後就先 pull 再動手。
2. 如果 `git status` 出現一大堆整檔修改，先用 `git diff --ignore-space-at-eol --stat` 確認是不是 CRLF 雜訊；是的話用 `git add --renormalize .` 修，不要當成真的修改。
3. 動到策略或模型之前，**一定要先讀 `STRATEGY_ANALYSIS_NOTES.md`**（活文件，跟舊報告 `big_data_attribution_report.md` 衝突時以它為準）。

## 架構

| 元件 | 檔案 | Port | 啟動方式 |
|---|---|---|---|
| 主控台後端（FastAPI，同時提供靜態頁面） | `main.py` | 58888 | `start.command`／`start_windows.bat`，或 preview `main` |
| 回測引擎（FastAPI） | `backtest_engine.py` | 58889 | `start_backtest.command`／`start_backtest_windows.bat`，或 preview `backtest_engine` |
| 共用策略邏輯 | `strategy_core.py` | — | 進場 `evaluate_entry()`、出場 `evaluate_exit()`、巨觀風控 `evaluate_macro_3in1_status()` |

- 環境變數放在本機 `.env`（已 gitignore），正式站的放在 Render 後台。帳號存在 Firebase Firestore（`firebase-admin`），密碼用 bcrypt。
- 部署：push 到 `origin/main` 後 Render 會自動部署（`https://ai-trading-console-wf88.onrender.com`）。Render 免費方案**沒有永久硬碟**。
- **分工原則**：重運算（回測、網格、Mega Grid）只在本機跑，結果透過 `/api/backtest/publish_snapshot` 匯出成 `published_snapshot.json`／`published_leaderboard.csv` 推上 git，正式站只負責顯示。雲端版 `backtest.html` 的控制項是 disabled，不是隱藏。
- `daily_scan_cache.json`、`latest_scan_results.json` 是**刻意進版控**的（Render 重啟時的備援快照），不要加進 `.gitignore`。

### 主要頁面
`index.html`（實戰控制台）／`order_planner.html`（下單規劃）／`history.html`、`pnl_ledger.html`（紀錄、損益）／`backtest.html`（回測實驗室，用來操作）／`analysis.html`（分析中心，用來顯示結果）／`data_hub.html`／`doc.html`（策略白皮書）／`case_studies.html`（研究個案）／`guide.html`。共用導覽列在 `top_nav.js`，樣式在 `style.css`。

### 出場方案（`strategy_core.py`）
A 積分反轉／B 土洋雙賣／C 動態防線收縮／D 自適應吊燈鎖利／E 快穩雙軌（目前預設，個案㉔驗證後維持）／R regime 自適應。細節和實測表現看 `STRATEGY_ANALYSIS_NOTES.md`。

## 規則

- **UI 配色採台股習慣：紅＝漲／買／獲利，綠＝跌／賣／虧損。** CSS 變數名稱是反過來的（`--accent-green` 實際上是紅色），改樣式時要特別注意。
- **yfinance 不能每次查詢都即時抓。** 現價一天最多抓一次並存進本機快取；新功能請沿用 `backtest_database*.json` 的模式（同步一次，之後讀快取）。
- **Commit 時機**：程式還在改的時候不要 commit／push，等使用者明確表示「這段告一段落」再做。不確定就先問。
- **研究方法要先確認**：程式碼裡沒有精確定義的機制（例如「3:4:3 分批出場」），先跟使用者確認規則，或提出市場通用定義並取得同意，再寫模擬程式。方法上有走捷徑或可能有干擾因子的地方，要在報告結論**之前**先講清楚。
- **研究產出流程**：`research_caseNN_*.py` → 原始資料放 `research_data/`（同時更新它的 `README.md`）→ 結論寫進 `case_studies.html` → 完整脈絡用帶日期的新小節加進 `STRATEGY_ANALYSIS_NOTES.md`（不覆蓋舊結論）。有證據支持、長期成立的發現，要主動**提議**加進 `doc.html`，但要先告知，不要悄悄修改；具體數字寫成「某日期的實驗結果」，不要寫成即時數據。
- regime-adaptive 等研究結論不要主動寫進 `strategy_core.py`，研究夠完整後提醒使用者討論。
- 跨機器的環境修正要在 `CHANGELOG.md` 補一筆（日期、做了什麼、原因、commit hash）。
- 在本機打開網頁時用 Chrome（`open -a "Google Chrome" ...`）。
- 一鍵同步腳本（`一鍵同步GitHub_Mac.command`、`sync_windows.bat`）會執行 `git add -A`，所以新增含個資或機密的檔案前，要先確認 `.gitignore` 已經涵蓋。

## 常用指令

```bash
git fetch && git status -sb                      # 開工檢查
pip3 install -r requirements.txt                 # 安裝相依套件
python3 -m uvicorn main:app --port 58888         # 主控台（需先載入 .env）
python3 -m uvicorn backtest_engine:app --port 58889
python3 test_full_scan.py                        # 全掃描測試
python3 test_backtest_loss.py
```
