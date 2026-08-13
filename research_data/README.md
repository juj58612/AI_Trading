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

- **`case5_regime_v1_trades.csv`**（297 筆，2026-08-13已依個案⑬未來函數修正重新產生，取代原本273筆的修正前版本）
  對應 [個案⑤「Regime自動切換」](../case_studies.html#case5) 修正後的完整逐筆交易明細。修正後總報酬409.67%（原522.18%），且已被靜態最佳單一改動（425.17%）反超，核心結論反轉，詳見個案⑤。
  產生腳本：`regime_adaptive_backtest.py`（entry端chip lookup已修正為`[idx-2,idx-1]`），2026-08-13。

- **`case6_all_strategies_summary.csv`**（15 列，851B，彙總指標，非逐筆交易）
  對應 [個案⑥「A/B/C/D/E五方案全面對照」](../case_studies.html#case6)。直接呼叫正式 `backtest_engine.run_backtest`，同步存入SQLite，逐筆交易明細可在回測實驗室查對應實驗ID查詢。
  產生腳本：`all_strategies_comparison.py`，2026-08-10。

- **`case7_strategyB_fullswap_failed_trades.csv`**（891 筆，92KB）
  對應 [個案⑦「用方案B重新設計空頭端」](../case_studies.html#case7) 的失敗嘗試（整套換成方案B原生邏輯，162.67% vs 個案⑤原版522.18%）。
  產生腳本：`regime_adaptive_v2_A_bull_B_bear.py`，2026-08-10。

- **`case7_strategyB_dualsell_overlay_trades.csv`**（2026-08-13已依個案⑬未來函數修正重新產生，取代原本465筆的修正前版本）
  對應 [個案⑦](../case_studies.html#case7) 後續修正版：只把方案B的「土洋雙賣」規則疊加進個案⑤的card-line組合（不是整套換掉）。修正後359.34% / MDD 27.59%（原468.71%/17.48%）——總報酬與MDD雙雙變差，不再是取捨，而是全面劣化，詳見個案⑦。
  產生腳本：`regime_adaptive_v3_add_dualsell.py` 的 `mode='adaptive_dualsell'`（entry端chip lookup已修正），2026-08-13。

- **`case7_bear_exhaustive_48combos.csv`**（48 列，彙總指標，非逐筆交易，2026-08-13已依個案⑬修正重新產生）
  對應 [個案⑦](../case_studies.html#case7) 系統化窮舉版（fail-open）：空頭端5個開關全部排列組合。修正後新冠軍（防線A/B/高點鎖利/保本停利/土洋雙賣全關，671.27%/MDD47.84%）與修正前冠軍（含土洋雙賣，692.64%）完全不同——舊冠軍配置修正後只排第46名（262.67%）。MDD 47.84%極高，不建議直接採用，詳見個案⑦。
  產生腳本：`regime_bear_exhaustive_search_failopen.py`（`regime_bear_exhaustive_search.py`的fail-open變體，強制關閉巨觀風控否決），2026-08-13。

- **`case7_bear_exhaustive_48combos_macroON.csv`**（48 列，彙總指標，非逐筆交易，2026-08-13已依個案⑬修正重新產生）
  對應 [個案⑦](../case_studies.html#case7) 交叉驗證版：用「巨觀風控真正生效」重跑同樣48組。修正後新冠軍651.37%/MDD38.26%（原488.17%/19.98%），配置為防線A/B/高點鎖利全關、保本停利adjust、<strong>土洋雙賣關閉</strong>（原冠軍含土洋雙賣，修正後降到第8名407.30%）——「兩種風控狀態冠軍配置完全相同」這個修正前的核心穩健性論證需要重新解讀，詳見個案⑦⑧。
  產生腳本：`regime_bear_exhaustive_search.py`（entry/exit端chip lookup已修正），2026-08-13。

- **`case9_cobuy_pooled_flawed.csv`**（6列，彙總指標）
  對應 [個案⑨](../case_studies.html#case9)「連續同買天數」研究的**第一版（有方法論瑕疵，僅供對照）**：把677組實驗（含grid trial）的514,881筆交易全部pool在一起，依進場當下「連續同買天數」分桶。看起來同買第1天報酬最高，但這是同一訊號被幾百組參數組合重複計入的假象，正確結論見下一個檔案。
  產生腳本：`cobuy_streak_rigorous.py`，2026-08-12。

- **`case9_cobuy_dedup_corrected.csv`**（6列，彙總指標）
  對應 [個案⑨](../case_studies.html#case9)「連續同買天數」研究的**修正版**：用唯一`(ticker, buy_date)`去重，只留3,459筆真正獨立的訊號（去重前後放大倍數約148倍）。去重後同買第2天報酬反而最高，第1天沒有特別突出。
  產生腳本：`cobuy_streak_rigorous.py`，2026-08-12。

- **`case9_cobuy_by_year.csv`**（36列，依年度×天數分桶）
  對應 [個案⑨](../case_studies.html#case9)：依買進年度拆開看「連續同買天數」效應是否穩健。2022空頭年方向完全反轉（同買第6天以上表現最好），證明「越早越好」不是穩定規律。
  產生腳本：`cobuy_streak_rigorous.py`，2026-08-12。

- **`case9_cobuy_backtest_4way.csv`**（4列，彙總指標）
  對應 [個案⑨](../case_studies.html#case9) 決定性驗證（2026-08-13依個案⑬未來函數修正後更新）：把「限定連續同買天數才進場」真的寫成濾網，用strategy A、8檔持股、5.5年全期間跑完整投資組合回測（不限制 / 只准第1~2天 / 只准第1天 / 反向對照只准第3天以上）。結果：不限制的現行系統行為總報酬215.49%、獲利因子1.54，是四組裡最好的；加上任何進場天數限制，總報酬都變差；反向對照組（只准第3天以上）修正後從+97.81%反轉為-10.12%。
  產生腳本：`cobuy_streak_backtest_filter.py`，2026-08-13。

- **`case9_cobuy_dedup_by_year.csv`**（3,459列，逐筆去重後訊號，含年度/天數分桶標籤）
  對應 [個案⑨](../case_studies.html#case9) 補充驗證：使用者提出「連續同買天數的最佳解可能隨regime(多空)而不同」的假設，重新用**去重後**的唯一訊號依年度拆解檢查。結果：原本未去重版本顯示「2022年同買第6天以上表現最好(+0.76%/勝率55.8%)」，去重後2022年同買第6天以上只剩9筆真實訊號、報酬轉為-0.28%，跟其他天數一樣糟——原本的「規律」也是重複計數的假象。去重後每年每個天數分桶樣本量降到個位數~數十筆，樣本量不足以支撐任何regime-conditional的細分規則，此方向暫不建議繼續，需要更長歷史/更大股票池累積更多獨立訊號後才適合重新檢驗。
  產生腳本：`cobuy_year_dedup_check.py`，2026-08-12。

- **`case10_bigbuy_dedup_strict.csv`** / **`case10_bigbuy_dedup_loose.csv`**（各4列，彙總指標）
  對應 [個案⑩](../case_studies.html#case10)「大買」（同買+買超金額夠大）研究：去重後per-trade分析，嚴格版(前10%/90th百分位)與寬鬆版(前25%/75th百分位)兩種門檻交叉比對。
  產生腳本：`bigbuy_analysis.py`，2026-08-12。

- **`case10_bigbuy_backtest_4way.csv`**（4列，彙總指標）
  對應 [個案⑩](../case_studies.html#case10) 第一輪決定性驗證：baseline / 硬性濾網寬鬆版 / 硬性濾網嚴格版 / 軟性加權版，四組完整投資組合回測。
  產生腳本：`bigbuy_backtest_filter.py`，2026-08-12。

- **`case10_bigbuy_weighting_screen.csv`**（5列，彙總指標）
  對應 [個案⑩](../case_studies.html#case10) 外資/投信權重篩選：5種權重組合（等權重／只看投信／只看外資／投信加重／外資加重）的per-trade快篩結果，找出`foreign_only`分離度最好。
  產生腳本：`bigbuy_weighting_screen.py`，2026-08-12。

- **`case10_bigbuy_streak_cross.csv`**（10列，交叉表）
  對應 [個案⑩](../case_studies.html#case10)：連買天數（個案⑨的變數）× 是否大買 的交叉分析，發現第1~2天+大買是最強的交互作用格。
  產生腳本：`bigbuy_streak_cross.py`，2026-08-12。

- **`case10_bigbuy_final_backtest.csv`**（3列，彙總指標）
  對應 [個案⑩](../case_studies.html#case10) 最終決定性驗證：baseline / 外資買超前25%濾網 / (大買+限定第1~2天)組合濾網，三組完整投資組合回測，確認即使是篩選出來最有希望的候選條件，portfolio層級依然不如不設限的現行系統。
  產生腳本：`bigbuy_final_backtest.py`，2026-08-12。

- **`case11_bigsell_event_summary.csv`**（3列，事件研究彙總）
  對應 [個案⑪](../case_studies.html#case11)「大賣」研究：事件研究法，每個同賣日往後看5/10/20日實際股價報酬，比較大賣(前10%/25%)vs一般同賣。發現賣超金額大小跟後續股價表現沒有清楚的單調關係。
  產生腳本：`bigsell_event_study.py`，2026-08-12。

- **`case11_bigsell_weighting_screen.csv`**（5列，彙總指標）
  對應 [個案⑪](../case_studies.html#case11) 外資/投信權重篩選（賣出版）：5種權重組合，10日後續報酬差距全部在±0.2%以內，沒有一種權重顯示明確訊號。
  產生腳本：`bigsell_weighting_and_streak.py`，2026-08-12。

- **`case11_bigsell_streak_cross.csv`**（10列，交叉表）
  對應 [個案⑪](../case_studies.html#case11)：連賣天數 × 是否大賣的交叉分析，發現佔85%以上樣本的第1~2天完全看不出大賣的額外影響。
  產生腳本：`bigsell_weighting_and_streak.py`，2026-08-12。

- **`case11_bigsell_backtest_5.5yr.csv`**（3列，彙總指標）
  對應 [個案⑪](../case_studies.html#case11) 決定性驗證（5.5年完整期間，2026-08-13依個案⑬未來函數修正後更新）：把方案B「土洋雙賣」改成要求大賣才觸發，5.5年總報酬246.52%優於baseline 168.71%——但這個結果經逐年穩健性檢查後證據混雜，見下一個檔案。
  產生腳本：`bigsell_backtest_filter.py`，2026-08-13。

- **`case11_bigsell_year_robustness.csv`**（10列，逐年獨立回測，2021~2025全5年 × baseline/濾網2組）
  對應 [個案⑪](../case_studies.html#case11) 逐年穩健性檢查（2026-08-13更新為全5年）：5年裡3年（2021、2023、2024）「大賣濾網」版本較好，2年（2022空頭年、2025）較差——證據混雜，而非最初只查3年時得出的「清楚推翻」；也示範了穩健性檢查本身若取樣不全，同樣會產生誤導性結論。
  產生腳本：`bigsell_year_robustness_v2.py`，2026-08-13。

- **`case12_trust_foreign_streak_summary.csv`**（2列，彙總指標）
  對應 [個案⑫](../case_studies.html#case12)：投信 vs 外資連續買超天數分布統計，驗證「投信因法規限制不能大買大賣當沖、買超較持久」的市場傳言——投信平均streak 2.94天，外資2.20天。
  產生腳本：`trust_vs_foreign_persistence.py`，2026-08-12。

- **`case12_trust_foreign_reversal_summary.csv`**（2列，彙總指標）
  對應 [個案⑫](../case_studies.html#case12)：買超後幾天內首次出現反手賣超，最戲劇性的發現——外資99.6%會在20天內反手賣出（平均2.53天），投信只有94.4%（平均4.92天）。
  產生腳本：`trust_vs_foreign_persistence.py`，2026-08-12。

- **`case12_trust_fwdreturns.csv`** / **`case12_foreign_fwdreturns.csv`**（58,056列／82,406列，逐筆買超事件的後續5/10/20/60日報酬）
  對應 [個案⑫](../case_studies.html#case12) 事件研究逐筆明細：投信、外資買超事件各自的後續報酬，兩者其實相差不大（外資甚至略高），代表「反手快」不等於「訊號差」。
  產生腳本：`trust_vs_foreign_persistence.py`，2026-08-12。

- **`case13_before_after_comparison.csv`**（4列，修正前後對照）
  對應 [個案⑬](../case_studies.html#case13)：三大法人資料未來函數bug修正前後的關鍵數字對照，案例⑤⑦的regime研究全部重跑確認。
  來源：`regime_adaptive_v3_add_dualsell.py`、`regime_bear_exhaustive_search.py`（皆已修正未來函數後重跑），2026-08-12。

- **`case13_48combo_lookahead_fixed.csv`**（48列，彙總指標）
  對應 [個案⑬](../case_studies.html#case13)：修正未來函數後重跑的48組窮舉搜尋完整結果，冠軍配置從「含土洋雙賣」變成「不含土洋雙賣」，證實原冠軍的優勢部分來自未來函數。
  產生腳本：`regime_bear_exhaustive_search.py`（已修正未來函數），2026-08-12。

- **`case14_leaderboard_top10.csv`**（10列，彙總指標）
  對應 [個案⑭](../case_studies.html#case14)：方案E補齊199組正式參數網格後的排行榜前10名，前5名全部是方案E（388.58%~406.11%），原冠軍方案D（384.18%）退到第6名。
  資料來源：`/api/analysis/experiments`，2026-08-13。

- **`case14_strategyE_year_isolation.csv`**（18列，方案E/D/A三方案×2021~2026逐年獨立回測）
  對應 [個案⑭](../case_studies.html#case14) 逐年拆解：比照個案⑥方法論，用8檔持股／方案E各自最佳持有天數，鎖定每個年度獨立回測。方案E不是每年都最好——2021、2024兩個多頭年反而是三組裡最差，2022空頭年、2023最好，6年裡A/D/E各贏2年。
  產生腳本：`strategyE_year_isolation.py`（直接呼叫正式`run_backtest`，同步存入SQLite），2026-08-13。

- **`case14_strategyE_exit_reason_breakdown.csv`**（6列，出場原因統計）
  對應 [個案⑭](../case_studies.html#case14)：方案E（8檔/30天，836筆交易）依出場原因拆解的筆數/平均報酬/平均持有天數。方案E的招牌機制「雙賣後鎖利出場」（獲利中收緊停損而非直接出清）只佔0.6%（5筆），實際差異化主因是「土洋雙賣（虧損中）」比其他方案的停損更快出場（平均8.3天 vs 觸發停損的12.3天）。
  產生腳本：對`backtest_logs.db`的trades表直接SQL查詢（experiment_id=3645），2026-08-13。

- **`case15_regime_strategy_selector.csv`**（42列，6組配置×7個期間）
  對應 [個案⑮](../case_studies.html#case15) Part 1：用原始20日均線regime訊號，在進場當下選用整包方案（不自創組合規則），全期間+逐年獨立回測。結果：三種切換版本全部輸給「全程只用方案E」（286.64%），因為訊號本身5.5年翻轉141次、中位數只維持4天，太容易把部位誤配到錯誤方案。
  產生腳本：`regime_strategy_selector.py`（直接呼叫`strategy_core.evaluate_entry/evaluate_exit`，look-ahead安全），2026-08-13。

- **`case15_regime_strategy_selector_smoothed.csv`**（63列，3種平滑方式×3組配置×7個期間）
  對應 [個案⑮](../case_studies.html#case15) Part 2：拉長平滑regime訊號（60日均線／連續5天確認／連續10天確認）後重測，9組全部依然輸給「全程只用方案E」，加重平滑反而讓部分配置更差（確認延遲放大誤配傷害）。
  產生腳本：`regime_strategy_selector_v2_smoothed.py`，2026-08-13。

## 新增檔案時請比照

存進來的檔案請在這份清單補一筆說明：對應哪個個案研究、涵蓋範圍、產生方式，避免以後看到檔案不知道是什麼。
