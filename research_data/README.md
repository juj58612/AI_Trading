# 研究資料存放區

這個資料夾存放策略研究過程中產出的原始資料檔（CSV/JSON 等），供之後回頭查證或重新分析用。跟 `case_studies.html`（結論摘要）和 `STRATEGY_ANALYSIS_NOTES.md`（完整討論脈絡）搭配看：這裡是「數字從哪來」的原始憑證。

## 檔案清單

- **`case3_staged_vs_lumpsum_trades.csv`**（2,351 筆，255KB）
  對應 [case_studies.html 個案③「3:3:4分批 vs 一次買完」](../case_studies.html#case3) 的完整逐筆交易明細。
  涵蓋三組獨立回測：全期間 2021-2026（839 筆一次買完 + 895 筆分批）、2022 空頭年（116 + 164 筆）、2024 多頭年（146 + 191 筆）。
  欄位：期間／進場方式／股票代號／名稱／買進日／賣出日／買進價／賣出價／損益%／損益金額／持有天數／出場原因。
  產生腳本：`/private/tmp/.../scratchpad/staged_vs_lumpsum_full_backtest_v2.py`（一次買完，直接呼叫正式 `backtest_engine.run_backtest`）+ `staged_vs_lumpsum_2022only_v2.py` / `staged_vs_lumpsum_2024only_v2.py`（分批進場的研究腳本），2026-08-10。

## 新增檔案時請比照

存進來的檔案請在這份清單補一筆說明：對應哪個個案研究、涵蓋範圍、產生方式，避免以後看到檔案不知道是什麼。
