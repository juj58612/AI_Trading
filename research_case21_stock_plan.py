"""
個案研究㉑：依個股籌碼／特性分組，給不同出場方案，會不會比「全部用方案 E」更好？（2026-09-28）

設計（沿用個案⑯⑱⑳的訓練／樣本外切分）：
  1. 分組特徵只用「訓練期」資料計算（避免偷看未來）：
       - 籌碼主導：投信買賣超絕對值 ÷（投信＋外資）絕對值，前半＝投信主導、後半＝外資主導
       - 波動度：ATR14 ÷ 股價 的平均，前半＝高波動、後半＝低波動
       - 規模：平均日成交值（收盤×成交量），前半＝大型股、後半＝中小型股
  2. 訓練期（2021-01-01～2024-12-31）：每個分組維度的每一組，逐一把該組股票改用 A/B/C/D（其他股票仍用 E），
     找出讓整體訓練期績效（報酬－2×最大回撤）最好的方案；若沒有任何方案贏過 E，該組維持 E。
  3. 樣本外（2025-01-01～資料最後一日）與全期間：用訓練期選出的「個股別方案表」回測，與「全部用 E」比較。
  4. 兩種持倉設定都要做：5 檔／45 天（新排行榜冠軍設定）、3 檔／30 天。
採用標準：三個分組維度中，至少有一個在「兩種持倉設定 × 樣本外與全期間」都穩定優於全部用 E，才考慮實作。

執行：cd "/Volumes/1T  01/AI_Trading" && python3 research_case21_stock_plan.py
輸出：research_data/case21_stock_groups.csv（每檔分組）、research_data/case21_stock_plan_results.csv（所有回測結果）
研究試驗不寫入排行榜資料庫。
"""
import asyncio, csv, json, os, time
import pandas as pd
import backtest_engine as be

DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(DIR, "research_data")
TRAIN = ("2021-01-01", "2024-12-31")

with open(os.path.join(DIR, "backtest_database.json"), encoding="utf-8") as f:
    DB = json.load(f)
LAST_DATE = max(v[-1]["date"] for v in DB["prices"].values() if v)
OOS = ("2025-01-01", LAST_DATE)
FULL = ("2021-01-01", LAST_DATE)
CONFIGS = [(5, 45), (3, 30)]
ALT_PLANS = ["A", "B", "C", "D"]

# ---------- 1. 分組特徵（只用訓練期） ----------
def build_groups():
    feats = []
    for t in be.TICKERS:
        prices = [r for r in DB["prices"].get(t, []) if TRAIN[0] <= r["date"] <= TRAIN[1]]
        chips = [r for r in DB["chips"].get(t, []) if TRAIN[0] <= r["date"] <= TRAIN[1]]
        if len(prices) < 60 or len(chips) < 60:
            continue
        df = pd.DataFrame(prices)
        tr = pd.concat([df["high"] - df["low"], (df["high"] - df["close"].shift()).abs(), (df["low"] - df["close"].shift()).abs()], axis=1).max(axis=1)
        atr_pct = (tr.rolling(14).mean() / df["close"]).mean()
        turnover = (df["close"] * df["volume"]).mean()
        trust_abs = sum(abs(r.get("trust", 0) or 0) for r in chips)
        foreign_abs = sum(abs(r.get("foreign", 0) or 0) for r in chips)
        trust_share = trust_abs / (trust_abs + foreign_abs) if (trust_abs + foreign_abs) > 0 else 0
        feats.append({"ticker": t, "name": be.STOCK_NAMES.get(t, ""), "trust_share": trust_share,
                      "atr_pct": float(atr_pct), "turnover": float(turnover)})
    fdf = pd.DataFrame(feats)
    fdf["籌碼主導"] = (fdf["trust_share"] >= fdf["trust_share"].median()).map({True: "投信主導", False: "外資主導"})
    fdf["波動度"] = (fdf["atr_pct"] >= fdf["atr_pct"].median()).map({True: "高波動", False: "低波動"})
    fdf["規模"] = (fdf["turnover"] >= fdf["turnover"].median()).map({True: "大型股", False: "中小型股"})
    return fdf

DIMENSIONS = ["籌碼主導", "波動度", "規模"]

async def run(sd, ed, pos, hd, smap=None):
    req = be.BacktestRequest(capital=1000000, max_positions=pos, fee_rate=0.003, start_date=sd, end_date=ed,
                             max_hold_days=hd, exit_strategy="E", save_to_db=False, strategy_map=smap)
    r = await be.run_backtest(req)
    return r["metrics"], r.get("yearly_returns", {})

def score(m):
    return float(m["total_return"]) - 2 * float(m["mdd"])

async def main():
    t0 = time.time()
    fdf = build_groups()
    fdf.to_csv(os.path.join(OUT_DIR, "case21_stock_groups.csv"), index=False, encoding="utf-8-sig")
    print(f"分組完成：{len(fdf)} 檔股票有足夠訓練期資料")
    for d in DIMENSIONS:
        print(" ", d, fdf[d].value_counts().to_dict())

    rows = []
    def log(period, pos, hd, dim, group_desc, smap_desc, m, yr):
        rows.append({"period": period, "positions": pos, "hold_days": hd, "dimension": dim, "variant": group_desc,
                     "plan_map": smap_desc, "total_return": float(m["total_return"]), "mdd": float(m["mdd"]),
                     "cagr": float(m["cagr"]), "win_rate": float(m["win_rate"]), "profit_factor": float(m["profit_factor"]),
                     "total_trades": m["total_trades"], "sharpe": float(m["sharpe_ratio"]), "score_ret_minus_2mdd": round(score(m), 2),
                     **{f"return_{y}": float(yr.get(y, 0) or 0) for y in (2021, 2022, 2023, 2024, 2025, 2026)}})
        print(f"[{len(rows)}] {period} {pos}檔{hd}天 {dim} {group_desc} → 報酬 {float(m['total_return']):.1f}% / MDD {float(m['mdd']):.1f}%  ({time.time()-t0:.0f}s)")

    for pos, hd in CONFIGS:
        base_m, base_y = await run(*TRAIN, pos, hd)
        log("訓練期", pos, hd, "基準", "全部用E", "E", base_m, base_y)
        chosen = {}  # dim -> {group: plan}
        for dim in DIMENSIONS:
            chosen[dim] = {}
            for g in sorted(fdf[dim].unique()):
                tickers = fdf.loc[fdf[dim] == g, "ticker"].tolist()
                best_plan, best_score = "E", score(base_m)
                for plan in ALT_PLANS:
                    smap = {t: plan for t in tickers}
                    m, y = await run(*TRAIN, pos, hd, smap)
                    log("訓練期", pos, hd, dim, f"{g}改用{plan}", f"{g}={plan},其他=E", m, y)
                    if score(m) > best_score:
                        best_plan, best_score = plan, score(m)
                chosen[dim][g] = best_plan
            print(f"  ➜ {pos}檔{hd}天 {dim} 訓練期選出：{chosen[dim]}")

        for pname, (sd, ed) in (("樣本外", OOS), ("全期間", FULL)):
            m, y = await run(sd, ed, pos, hd)
            log(pname, pos, hd, "基準", "全部用E", "E", m, y)
            for dim in DIMENSIONS:
                smap = {}
                for g, plan in chosen[dim].items():
                    for t in fdf.loc[fdf[dim] == g, "ticker"]:
                        smap[t] = plan
                desc = "，".join(f"{g}={p}" for g, p in chosen[dim].items())
                if all(p == "E" for p in chosen[dim].values()):
                    log(pname, pos, hd, dim, "訓練期選出＝全部E（與基準相同）", desc, m, y)
                    continue
                m2, y2 = await run(sd, ed, pos, hd, smap)
                log(pname, pos, hd, dim, "依組別選方案", desc, m2, y2)

    out = os.path.join(OUT_DIR, "case21_stock_plan_results.csv")
    with open(out, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
    print(f"\n✅ 完成，共 {len(rows)} 組，結果已存到 {out}（耗時 {time.time()-t0:.0f} 秒）")

if __name__ == "__main__":
    asyncio.run(main())
