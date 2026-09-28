"""
個案研究㉒：三合一巨觀風控值不值得保留？（2026-09-28）

背景：排行榜修正後發現，同一組設定「關掉巨觀風控」常常報酬更高；檢查程式又發現兩個問題：
  ① 台幣警報門檻單位錯誤（白皮書寫 5 日貶值 > 1.5 角，程式用 0.15 角），約一半交易日都亮；
  ② 2 項警報時「減半」用 int((空位)×0.5) 無條件捨去，只剩 1 個空位時等於完全不能買。
設計：方案 A~E × 持股 3/5/8/10 × 持倉 5~120 天＝180 組，每組跑全期間／樣本外(2025-01-01~) × 4 種模式：
  on（現況）、off（不套用）、fixed（門檻改 1.5 角＋總持股上限減半無條件進位）、fixed_veto_only（只保留 3 項全亮否決）
採用標準（事先訂好，對照組為 on）：以「報酬 − 2×最大回撤」評分，
  1. 全部組合中「全期間與樣本外兩段評分都較好」的比例要過半；
  2. 實戰常用範圍（方案 E、持股 3~8 檔、持倉 20~90 天）也要過半；
  3. 2022 空頭年報酬中位數不可明顯變差（風控的本意是防空頭）。
研究試驗不寫入排行榜資料庫。可中斷後重新執行，已完成的組合會自動跳過。

執行：python3 research_case22_macro.py
輸出：research_data/case22_macro_grid.csv
"""
import asyncio, csv, json, os, time
import backtest_engine as be

DIR = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(DIR, "research_data", "case22_macro_grid.csv")
with open(os.path.join(DIR, "backtest_database.json"), encoding="utf-8") as f:
    _db = json.load(f)
LAST_DATE = max(v[-1]["date"] for v in _db["prices"].values() if v)
del _db
PERIODS = [("全期間", "2021-01-01", LAST_DATE), ("樣本外", "2025-01-01", LAST_DATE)]
PLANS = ["A", "B", "C", "D", "E"]
POSITIONS = [3, 5, 8, 10]
HOLDS = [5, 10, 15, 20, 30, 45, 60, 90, 120]
MODES = ["on", "off", "fixed", "fixed_veto_only"]
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
                                 end_date=ed, max_hold_days=hd, exit_strategy=pl, save_to_db=False, macro_mode=m)
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
