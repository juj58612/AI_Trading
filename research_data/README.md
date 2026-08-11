# 研究資料存放區

這個資料夾存放策略研究過程中產出的原始資料檔（CSV/JSON 等），供之後回頭查證或重新分析用。跟 `case_studies.html`（結論摘要）和 `STRATEGY_ANALYSIS_NOTES.md`（完整討論脈絡）搭配看：這裡是「數字從哪來」的原始憑證。

## 檔案清單

- **`case1_bias_momentum_trades.csv`**（4,217 筆，177KB）
  對應 [個案①「乖離率／動能過熱指標」](../case_studies.html#case1)。A/D兩方案各4組表現前段的回測實驗合併（2218/2516/2501/2517、2055/2403/2417/1873），逐筆重算進場當下的乖離率、距60日低點漲幅、進場前連續漲停天數。
  欄位：exp_id／strategy／ticker／buy_date／pnl_pct／bias_pct／runup60_pct／limitup_streak。
  產生腳本：`momentum_bucket_analysis_multi.py`，2026-08-10。

- **`case2_6213_entry_timing.csv`**（10 列，3.6KB）
  對應 [個案②「6213聯茂進場時機示範」](../case_studies.html#case2)。單一標的示範，不是通用結論。5個滿分（5分）進場點×一次買完/3:3:4分批兩種方式，含逐日模擬過程的文字紀錄（log欄位）。
  產生腳本：`case_study_6213_entry_timing.py`，2026-08-10。

- **`case3_staged_vs_lumpsum_trades.csv`**（2,351 筆，255KB）
  對應 [個案③「3:3:4分批 vs 一次買完」](../case_studies.html#case3) 的完整逐筆交易明細。
  涵蓋三組獨立回測：全期間 2021-2026（839 筆一次買完 + 895 筆分批）、2022 空頭年（116 + 164 筆）、2024 多頭年（146 + 191 筆）。
  欄位：期間／進場方式／股票代號／名稱／買進日／賣出日／買進價／賣出價／損益%／損益金額／持有天數／出場原因。
  產生腳本：`staged_vs_lumpsum_full_backtest_v2.py`（一次買完，直接呼叫正式 `backtest_engine.run_backtest`）+ `staged_vs_lumpsum_2022only_v2.py` / `staged_vs_lumpsum_2024only_v2.py`（分批進場的研究腳本），2026-08-10。

- **`case4_exit_mechanism_summary.csv`**（23 列，1.7KB，彙總指標，非逐筆交易）
  對應 [個案④「出場機制對照」](../case_studies.html#case4)。8組全期間配置對照（卡片四防線 vs Scale-out 等）+ 5組配置×3個期間（全期間/2022/2024）的regime隔離結果。
  產生腳本：`exit_mechanism_comparison_v2.py` + `exit_mechanism_regime_and_combo.py`，2026-08-10。

- **`case5_regime_v1_trades.csv`**（273 筆，24KB）
  對應 [個案⑤「Regime自動切換」](../case_studies.html#case5) 原版的完整逐筆交易明細，已用本地固定快取重跑確認可重現（522.18%分毫不差）。
  產生腳本：`regime_adaptive_v3_add_dualsell.py` 的 `mode='adaptive'`（純規則，未疊加土洋雙賣），2026-08-10。

- **`case6_all_strategies_summary.csv`**（15 列，851B，彙總指標，非逐筆交易）
  對應 [個案⑥「A/B/C/D/E五方案全面對照」](../case_studies.html#case6)。直接呼叫正式 `backtest_engine.run_backtest`，同步存入SQLite，逐筆交易明細可在回測實驗室查對應實驗ID查詢。
  產生腳本：`all_strategies_comparison.py`，2026-08-10。

- **`case7_strategyB_fullswap_failed_trades.csv`**（891 筆，92KB）
  對應 [個案⑦「用方案B重新設計空頭端」](../case_studies.html#case7) 的失敗嘗試（整套換成方案B原生邏輯，162.67% vs 個案⑤原版522.18%）。
  產生腳本：`regime_adaptive_v2_A_bull_B_bear.py`，2026-08-10。

- **`case7_strategyB_dualsell_overlay_trades.csv`**（465 筆，56KB）
  對應 [個案⑦](../case_studies.html#case7) 後續修正版：只把方案B的「土洋雙賣」規則疊加進個案⑤的card-line組合（不是整套換掉）。468.71% / MDD 17.48%，是報酬換防守的取捨，不是單純勝出。
  產生腳本：`regime_adaptive_v3_add_dualsell.py` 的 `mode='adaptive_dualsell'`，2026-08-10。

- **`case7_bear_exhaustive_48combos.csv`**（48 列，彙總指標，非逐筆交易）
  對應 [個案⑦](../case_studies.html#case7) 系統化窮舉版：空頭端5個開關（防線A／防線B／高點打折鎖利／保本停利／土洋雙賣）全部排列組合，找到目前測過最佳設定（防線A/B/高點鎖利全關，只留保本停利adjust+土洋雙賣，692.64%），打贏先前手動挑選的版本。此結果是在巨觀風控fail-open狀態下跑出來的，快取修好後尚未重跑confirm。
  產生腳本：`regime_bear_exhaustive_search.py`，2026-08-11。

- **`case7_bear_exhaustive_48combos_macroON.csv`**（48 列，彙總指標，非逐筆交易）
  對應 [個案⑦](../case_studies.html#case7) 交叉驗證版：用「巨觀風控真正生效」（修好本地快取後）重跑同樣48組。冠軍配置跟fail-open版完全相同，總報酬488.17%（降低是風控生效的預期效果），MDD進一步降到19.98%。
  產生腳本：`regime_bear_exhaustive_search.py`（同一支，加上`fetch_macro_3in1_series`與veto/pos_scale邏輯後重跑），2026-08-11。

## 新增檔案時請比照

存進來的檔案請在這份清單補一筆說明：對應哪個個案研究、涵蓋範圍、產生方式，避免以後看到檔案不知道是什麼。
