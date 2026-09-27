"""
個案研究⑳：VWMA（成交量加權均線）濾網是否能改善方案 E？（2026-09-27）

背景：strategy_core.py 自 8/2 起就有計算 VWMA5/VWMA20，白皮書也曾宣稱「站上 VWMA5 且量增才算真突破」，
但選股／進場邏輯從未實際使用。本研究在「只改一個條件」的前提下驗證它值不值得接進正式系統。

設計：
  - 方案 E（系統預設），持倉檔數 3 / 5 × 持倉天數 30 / 60
  - 三種模式：off（現況）、above（收盤 > VWMA5）、above_vol（收盤 > VWMA5 且 成交量 > 20日均量）
  - 三個期間：全期間、訓練期 2021-01-01~2024-12-31、樣本外 2025-01-01~資料最後一日
  - 研究試驗不寫入 SQLite（save_to_db=False），不會混進分析中心排行榜
採用標準：全期間與樣本外都要同時優於 off（報酬較高且最大回撤不惡化）才建議接進正式程式。

執行方式：在 AI_Trading 資料夾打開終端機，輸入  python3 research_case20_vwma.py
輸出：research_data/case20_vwma_filter.csv
"""
import asyncio, csv, json, os, time
import backtest_engine as be

DIR = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(DIR, "backtest_database.json"), encoding="utf-8") as f:
    _db = json.load(f)
LAST_DATE = max(v[-1]["date"] for v in _db["prices"].values() if v)
del _db

PERIODS = [
    ("全期間", "2021-01-01", LAST_DATE),
    ("訓練期", "2021-01-01", "2024-12-31"),
    ("樣本外", "2025-01-01", LAST_DATE),
]
POSITIONS = [3, 5]
HOLD_DAYS = [30, 60]
MODES = ["off", "above", "above_vol"]
MODE_LABEL = {"off": "不使用（現況）", "above": "收盤>VWMA5", "above_vol": "收盤>VWMA5且量增"}

async def main():
    rows = []
    total = len(PERIODS) * len(POSITIONS) * len(HOLD_DAYS) * len(MODES)
    n = 0
    t0 = time.time()
    for pname, sd, ed in PERIODS:
        for pos in POSITIONS:
            for hd in HOLD_DAYS:
                for mode in MODES:
                    n += 1
                    req = be.BacktestRequest(capital=1000000, max_positions=pos, fee_rate=0.003,
                                             start_date=sd, end_date=ed, max_hold_days=hd,
                                             exit_strategy="E", vwma_mode=mode, save_to_db=False)
                    res = await be.run_backtest(req)
                    m = res["metrics"]; yr = res.get("yearly_returns", {})
                    rows.append({
                        "period": pname, "start": sd, "end": ed, "positions": pos, "hold_days": hd,
                        "mode": mode, "mode_label": MODE_LABEL[mode],
                        "total_return": m["total_return"], "cagr": m["cagr"], "mdd": m["mdd"],
                        "win_rate": m["win_rate"], "profit_factor": m["profit_factor"],
                        "total_trades": m["total_trades"], "sharpe": m["sharpe_ratio"], "sortino": m["sortino_ratio"],
                        **{f"return_{y}": yr.get(y, "") for y in (2021, 2022, 2023, 2024, 2025, 2026)},
                    })
                    print(f"[{n}/{total}] {pname} {pos}檔 {hd}天 {MODE_LABEL[mode]}: 報酬 {m['total_return']}% / MDD {m['mdd']}% / 交易 {m['total_trades']} 筆  ({time.time()-t0:.0f}s)")
    out = os.path.join(DIR, "research_data", "case20_vwma_filter.csv")
    with open(out, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    print(f"\n✅ 完成，共 {len(rows)} 組，結果已存到 {out}")

if __name__ == "__main__":
    asyncio.run(main())
