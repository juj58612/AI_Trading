"""
個案研究⑳-2：VWMA5 濾網完整網格驗證（2026-09-28）

背景：個案⑳在修正巨觀快取判斷後重跑，「收盤 > VWMA5」12 組全勝，但額外 5 組設定中有輸有贏。
本研究把它放到排行榜同一套網格上，決定要不要接進正式系統。

設計：方案 A~E × 持股 3/5/8/10 檔 × 持倉 5/10/15/20/30/45/60/90/120 天（120 天以上結果幾乎相同，省略）
      ＝180 組，每組跑 4 次：全期間／樣本外(2025-01-01~) × 不使用／收盤>VWMA5
採用標準（事先訂好）：
  1. 全期間與樣本外「兩段都勝出」的組合比例要過半；
  2. 實戰常用範圍（方案 E、持股 3~8 檔、持倉 20~90 天）也要過半兩段都勝出；
  3. 兩段勝出時最大回撤不可明顯惡化。
研究試驗不寫入排行榜資料庫。可中斷後重新執行，已完成的組合會自動跳過。

執行：python3 research_case20b_vwma_grid.py
輸出：research_data/case20b_vwma_grid.csv
"""
import asyncio, csv, json, os, time
import backtest_engine as be

DIR = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(DIR, "research_data", "case20b_vwma_grid.csv")
with open(os.path.join(DIR, "backtest_database.json"), encoding="utf-8") as f:
    _db = json.load(f)
LAST_DATE = max(v[-1]["date"] for v in _db["prices"].values() if v)
del _db
PERIODS = [("全期間", "2021-01-01", LAST_DATE), ("樣本外", "2025-01-01", LAST_DATE)]
PLANS = ["A", "B", "C", "D", "E"]
POSITIONS = [3, 5, 8, 10]
HOLDS = [5, 10, 15, 20, 30, 45, 60, 90, 120]
MODES = ["off", "above"]
FIELDS = ["period", "plan", "positions", "hold_days", "mode", "total_return", "mdd", "cagr",
          "win_rate", "profit_factor", "total_trades", "sharpe"]

async def main():
    done = set()
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                done.add((r["period"], r["plan"], r["positions"], r["hold_days"], r["mode"]))
    new_file = not os.path.exists(OUT)
    fh = open(OUT, "a", newline="", encoding="utf-8-sig")
    w = csv.DictWriter(fh, fieldnames=FIELDS)
    if new_file:
        w.writeheader()
    jobs = [(p, sd, ed, pl, pos, hd, m) for (p, sd, ed) in PERIODS for pl in PLANS
            for pos in POSITIONS for hd in HOLDS for m in MODES]
    t0 = time.time(); n = 0
    for (p, sd, ed, pl, pos, hd, m) in jobs:
        n += 1
        if (p, pl, str(pos), str(hd), m) in done:
            continue
        req = be.BacktestRequest(capital=1000000, max_positions=pos, fee_rate=0.003, start_date=sd,
                                 end_date=ed, max_hold_days=hd, exit_strategy=pl, save_to_db=False, vwma_mode=m)
        r = await be.run_backtest(req)
        mt = r["metrics"]
        w.writerow({"period": p, "plan": pl, "positions": pos, "hold_days": hd, "mode": m,
                    "total_return": round(float(mt["total_return"]), 2), "mdd": round(float(mt["mdd"]), 2),
                    "cagr": round(float(mt.get("cagr", 0) or 0), 2), "win_rate": round(float(mt.get("win_rate", 0) or 0), 2),
                    "profit_factor": round(float(mt.get("profit_factor", 0) or 0), 2),
                    "total_trades": mt.get("total_trades", 0), "sharpe": round(float(mt.get("sharpe_ratio", 0) or 0), 2)})
        fh.flush()
        print(f"[{n}/{len(jobs)}] {p} 方案{pl} {pos}檔 {hd}天 {m}: {float(mt['total_return']):.1f}% / MDD {float(mt['mdd']):.1f}%  ({time.time()-t0:.0f}s)", flush=True)
    fh.close()
    print(f"\n✅ 完成，共 {len(jobs)} 組，結果已存到 {OUT}")

if __name__ == "__main__":
    asyncio.run(main())
