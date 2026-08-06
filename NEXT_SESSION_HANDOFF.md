# 新對話接續摘要

> 這是一份「工作階段交接」筆記，開新對話時把整段複製貼到第一則訊息即可接續。
> 內容會隨進度變動，過時後可以直接覆寫或刪除，不是永久文件。

## 1.【核心目標與背景】

專案：`AI_Trading`（台股 AI 概念股量化交易策略控制台），路徑 `/Volumes/1T 01/AI_Trading`。這台 Mac 叫 **Mac mini**，是本地端；另外還有一台 Windows 機器會平行開發，兩邊靠 GitHub（`https://github.com/juj58612/AI_Trading`）同步，Render（`ai-trading-console-wf88.onrender.com`）自動部署正式站。

架構原則：**本機負責重運算（回測/大數據網格），正式站只負責展示已發布的結果**，因為 Render 免費方案沒有永久硬碟。本機跑 `backtest_engine.py`（port 58889）＋`main.py`（port 58888）兩個服務。

這輪對話核心工作分兩大塊：
- **(A) 大數據回測系統的完整性/穩定性修正**（股票池擴充、多個真實 bug 修正、UI 功能擴充）
- **(B) 用嚴謹統計方法分析「為什麼四個出場方案表現不同」，並嘗試設計新方案（方案E，已驗證失敗）**
- **(C, 進行中未完成) 打通「回測驗證出的出場邏輯」與「實戰持倉的賣出提醒」之間的斷層**——這是使用者認定「沒做到這個，整套系統就沒意義」的關鍵需求。

## 2.【已採用的決策與變更】

**已 commit + push（GitHub 最新 commit：`ae54b44`）：**
- 股票池從 60 擴充到 70 檔（新增矽光子/CPO 供應鏈 10 檔）
- 修正 Mega Grid 重複偵測 bug（沒把股票池大小算進比對條件，導致股票池變動後重跑會被誤判為「已測試過」而略過）
- 同步歷史資料庫改成真正斷點續傳（原本股價每次都整批重抓，已修正為只補尾端）+ 加上「一天最多完整同步一次」機制
- 排行榜加分頁（`leaderboard_full.html`）、`data_hub.html`（數據總匯）拆成獨立頁面並精簡成只發布排行榜摘要（不含逐筆交易明細，避免檔案過大）
- 新增「📤 發布快照到正式站」機制（`published_snapshot.json` + `published_leaderboard.csv`），正式站讀這份靜態檔案顯示排行榜
- **修正兩個真正的 NaN 崩潰 bug**：`/api/scan_all` 和 `/api/stock/{ticker}` 都會因為 yfinance 回傳「今天/昨天的佔位列（有成交量但收盤價還沒回填，是NaN）」而 500 壞掉，已修正為過濾掉未回填的列
- 修正 `main.py` 的靜態檔案白名單漏掉新頁面導致 404（這個 bug 重複發生過，**新增任何 .html/.json/.csv 檔案時務必記得把檔名加進 `main.py` 的 `serve_static()` 白名單**，否則正式站會顯示空白頁）
- `data_hub.html` 新增「自訂條件匯出」：可從 504+ 筆結果中任選一筆，即時查詢完整交易明細＋權益曲線＋回撤圖＋統計卡片＋出場原因分布＋個股損益貢獻，且**明確要求：一律即時查資料庫，絕不用快取，避免資料庫更新後還顯示舊結果**
- 交易明細表格與 CSV 匯出，全部統一改成依「損益金額(TWD)」由高到低排序

**尚未 commit（工作目錄有異動）：**
- `strategy_core.py`：新增實驗性「方案E」出場邏輯（`strategy == 'E'` 分支），已測試但**沒有打敗現有A/B/C/D方案**（誠實記錄，不是要藏起來的失敗）
- `backtest.html`：新增方案E選項（標示🧪實驗性）
- `analysis.html`：新增「🧭 策略討論」導覽按鈕
- `doc.html`：**全面清查修正**——移除十幾處寫死的過期數字（如「+122.14%」「537組」「MDD 14.11%」等），改成連結到即時計算頁面；修正「方案D統治級」這種跟今天分析結果矛盾的說法；修正吊燈停損機制描述不精確處；順便修掉一個舊有的 `<strong>` 標籤沒關閉的 HTML bug
- `main.py`：白名單加入 `strategy_discussion.html`；在 `commit_planner_orders()` 新增部位時加上 `"exit_strategy": "D"` 欄位（這是為了下面「未完成工作」鋪路，目前只加了欄位，後續邏輯還沒寫）
- 新檔案（未加入 git）：`STRATEGY_ANALYSIS_NOTES.md`（根目錄，記錄嚴謹的方案A/B/C/D交互作用分析＋方案E失敗紀錄，是持續更新的活文件）、`strategy_discussion.html`（同內容的網頁版，已串接 analysis.html 導覽列）

**記憶系統已設定**：以後只要討論修改模型架構，我會自動先讀 `STRATEGY_ANALYSIS_NOTES.md`（對應記憶檔 `project_strategy_analysis_notes.md`）。也記得這台是 Mac mini、另一台 Windows 機器可能平行開發、`data_hub.html`/`leaderboard_full.html`/`strategy_discussion.html` 等新頁面務必加進 `main.py` 白名單。

## 3.【當前遇到的問題/瓶頸】

**核心未解決問題（使用者明確要求「一定要想辦法做到」）**：

實戰持倉的賣出提醒，跟今天整個分析驗證出來的出場邏輯（`strategy_core.py` 的 `evaluate_exit()`）**完全脫節**。已經查證到根因：

1. `history.html`（操盤室 - 交易庫房，使用者確認網址是 `http://localhost:58888/history.html`）目前每張持股卡片上雖然有防線A/B的紅色警示框，但用的是**寫死的簡單規則**（固定-8%停損、或跌破手動設定的支撐價），完全沒有呼叫 `strategy_core.evaluate_exit()`。
2. `order_planner.html` 的下單建議會檢查 `trailing_stop`，但這個值**只在下單當下計算一次，之後永遠不會更新**（沒有任何每日重算的機制），且計算時用的 ATR 是粗略估算（`o.price * 0.04`），不是真實 ATR。
3. **持倉資料完全沒有記錄「這筆用哪個出場方案」**（`exit_strategy` 欄位剛剛才加到新建部位的程式碼裡，是這輪最後做的事，還沒經過測試）。

**已確認的技術路徑（尚未實作）**：用 `backtest_engine.py` 裡已經有的 `strategy_core.evaluate_exit()` + 本機快取的歷史股價/籌碼資料（`backtest_database.json`），從 `buy_date` 開始逐日重播到今天，算出正確的當前 trailing_stop 狀態，並判斷今天是否觸發賣出訊號——這個邏輯 `backtest_engine.py` 裡已經有現成的迴圈可以參考（第 528~560 行左右的每日出場檢查邏輯、第 672~688 行的部位初始化邏輯），只是還沒有搬到 `main.py` 做成一個給即時持倉用的版本。

**中斷時的確切進度**：剛確認完 `/api/portfolio` GET endpoint 在 `main.py` 第 581 行，準備要在附近新增一個 `/api/portfolio/sell_check` 之類的新 endpoint，還沒開始寫這個函式本體。

## 4.【下一步具體任務】

1. **優先**：在 `main.py` 實作 `/api/portfolio/sell_check`（或類似命名）endpoint：
   - 讀取使用者持股（`portfolio.json` 或 `portfolio_{username}.json`）
   - 對每一筆持股，讀取 `backtest_database.json` 裡的股價/籌碼資料，從 `buy_date` 逐日重播 `strategy_core.evaluate_exit()`（可參考 `backtest_engine.py` 第 452~504 行的技術指標計算、第 672~688 行的部位初始化、第 528~560 行的逐日出場檢查迴圈），算出正確的當前狀態並判斷今天是否該賣
   - 沒有 `exit_strategy` 欄位的舊持倉，預設用 'D'，但要在回傳訊息裡明確告知「這筆未指定策略，暫用方案D計算」
2. 把這個 endpoint 串進 `history.html`／`history.js`：在「現役部隊」區塊最上方加一個醒目的橫幅（例如「🚨 N 檔持股觸發賣出訊號」），列出哪些股票、什麼原因（觸發停損/積分轉負/土洋雙賣/時間到期等），點進去可以看到明細。可以保留現有卡片上的舊警示框，但要清楚標示新的才是「依模型驗證邏輯算出來的」。
3. 測試：至少用現有的 2330 台積電那筆持倉（`buy_date: 2026-08-06`，剛買不久）驗證跑得動、數字合理。
4. 完成後記得：**把新的商業邏輯決定（例如要不要讓使用者自己選 exit_strategy、還是永遠用系統推薦）更新進 `STRATEGY_ANALYSIS_NOTES.md`**，並檢查有沒有新增檔案需要加進 `main.py` 白名單。
5. 這輪所有未 commit 的異動（含這個賣出提醒功能做完後）要不要一次 commit + push，記得問使用者。
