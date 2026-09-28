"""
個案研究㉓：個案⑯⑱採用的新出場參數，在修正後引擎上是否仍勝過舊參數？（2026-09-28）

背景：2026-09-28 發現回測引擎的巨觀快取判斷錯誤，FinMind 配額用完時會靜默關閉巨觀風控。
個案⑯⑱（2026-08-13）的新舊參數驗證可能也受影響。本研究用修正後引擎重新比較。
  新參數＝正式系統現況（各方案鎖利門檻/倍數/停利%、C/D籌碼轉弱天數與倍數、A 3天、E 1.6226x）
  舊參數＝採用前（12%/1.25x/15%、C/D 2天/1.0x、A 2天、E 1.0x）
設計：方案 A~E × 持股 3/5/8/10 × 持倉 5~120 天＝180 組 × 全期間/樣本外(2025-01-01~)；
      新參數結果沿用 research_data/case22_macro_grid.csv 的 macro_mode=on（同一引擎、同一資料），這裡只跑舊參數。
採用標準（事先訂好，逐方案判定；評分原訂「報酬 − 2×最大回撤」，於結果產出前改為業界標準 Calmar 比率＝年化報酬 ÷ 最大回撤）：
  該方案 36 組中「舊參數在全期間與樣本外兩段評分都較好」過半 → 建議改回舊參數；否則維持新參數。
執行：python3 research_case23_params.py
輸出：research_data/case23_params_old.csv
"""
import asyncio, csv, json, os, time
import backtest_engine as be

DIR = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(DIR, "research_data", "case23_params_old.csv")
with open(os.path.join(DIR, "backtest_database.json"), encoding="utf-8") as f:
    _db = json.load(f)
LAST_DATE = max(v[-1]["date"] for v in _db["prices"].values() if v)
del _db
PERIODS = [("全期間", "2021-01-01", LAST_DATE), ("樣本外", "2025-01-01", LAST_DATE)]
PLANS = ["A", "B", "C", "D", "E"]
POSITIONS = [3, 5, 8, 10]
HOLDS = [5, 10, 15, 20, 30, 45, 60, 90, 120]
MODES = ["old"]
FIELDS = ["period", "plan", "positions", "hold_days", "mode", "total_return", "mdd", "cagr",
          "win_rate", "profit_factor", "total_trades", "sharpe", "macro_veto_weeks",
          "return_2021", "return_2022", "return_2023", "return_2024", "return_2025", "return_2026"]

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
                                 end_date=ed, max_hold_days=hd, exit_strategy=pl, save_to_db=False, exit_params=m)
        r = await be.run_backtest(req)
        mt = r["metrics"]
        w.writerow({"period": p, "plan": pl, "positions": pos, "hold_days": hd, "mode": m,
                    "total_return": round(float(mt["total_return"]), 2), "mdd": round(float(mt["mdd"]), 2),
                    "cagr": round(float(mt.get("cagr", 0) or 0), 2), "win_rate": round(float(mt.get("win_rate", 0) or 0), 2),
                    "profit_factor": round(float(mt.get("profit_factor", 0) or 0), 2),
                    "total_trades": mt.get("total_trades", 0), "sharpe": round(float(mt.get("sharpe_ratio", 0) or 0), 2),
                    "macro_veto_weeks": r.get("macro_veto_weeks", mt.get("macro_veto_weeks", "")),
                    **{f"return_{y}": round(float((r.get("yearly_returns") or {}).get(y, 0) or 0), 2) for y in range(2021, 2027)}})
        fh.flush()
        print(f"[{n}/{len(jobs)}] {p} 方案{pl} {pos}檔 {hd}天 {m}: {float(mt['total_return']):.1f}% / MDD {float(mt['mdd']):.1f}%  ({time.time()-t0:.0f}s)", flush=True)
    fh.close()
    print(f"\n✅ 完成，共 {len(jobs)} 組，結果已存到 {OUT}")

if __name__ == "__main__":
    asyncio.run(main())
