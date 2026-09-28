"""
個案研究㉔：系統預設出場方案要不要從 E 換成 D？（2026-09-28）

判定標準（在計算任何比較結果「之前」訂定並 commit）：
  資料：research_data/case22_macro_grid.csv 中 macro_mode=on（＝正式系統現況：修正後引擎、現行參數）
        方案 D 與方案 E 在相同「持股檔數 × 持倉天數」下配對比較（3/5/8/10 檔 × 5~120 天，共 36 對），
        期間：全期間（2021-01-01~）與樣本外（2025-01-01~）。
  評分：Calmar 比率＝年化報酬 ÷ 最大回撤。
  換成 D 的條件（三項都要成立）：
    1. 36 對中，D 在全期間與樣本外「兩段 Calmar 都較高」的比例過半；
    2. 實戰常用範圍（3~8 檔、持倉 20~90 天，15 對）中，同樣過半；
    3. 2022 空頭年報酬的配對差（D − E）中位數不低於 −5 個百分點（E 的主要優勢是空頭年抗跌，不可明顯犧牲）。
  否則維持 E 為預設。
不需要重跑回測（沿用個案㉒已算好的數據）。
執行：python3 research_case24_D_vs_E.py
"""
import csv, os, statistics as st

DIR = os.path.dirname(os.path.abspath(__file__))
rows = [r for r in csv.DictReader(open(os.path.join(DIR, "research_data", "case22_macro_grid.csv"), encoding="utf-8-sig")) if r["mode"] == "on"]
R = {(r["period"], r["plan"], int(r["positions"]), int(r["hold_days"])): r for r in rows}
cal = lambda r: float(r["cagr"]) / float(r["mdd"]) if float(r["mdd"]) > 0 else float("-inf")
pairs = sorted({(k[2], k[3]) for k in R})
out = []
for pos, hd in pairs:
    d_f, e_f = R[("全期間", "D", pos, hd)], R[("全期間", "E", pos, hd)]
    d_o, e_o = R[("樣本外", "D", pos, hd)], R[("樣本外", "E", pos, hd)]
    out.append({"positions": pos, "hold_days": hd,
                "D_calmar_full": round(cal(d_f), 3), "E_calmar_full": round(cal(e_f), 3),
                "D_calmar_oos": round(cal(d_o), 3), "E_calmar_oos": round(cal(e_o), 3),
                "D_return_full": d_f["total_return"], "E_return_full": e_f["total_return"],
                "D_mdd_full": d_f["mdd"], "E_mdd_full": e_f["mdd"],
                "D_return_oos": d_o["total_return"], "E_return_oos": e_o["total_return"],
                "D_2022": d_f["return_2022"], "E_2022": e_f["return_2022"],
                "D_wins_both": cal(d_f) > cal(e_f) and cal(d_o) > cal(e_o)})
with open(os.path.join(DIR, "research_data", "case24_D_vs_E.csv"), "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=list(out[0].keys())); w.writeheader(); w.writerows(out)

def summary(sel, label):
    n = len(sel); both = sum(o["D_wins_both"] for o in sel)
    wf = sum(o["D_calmar_full"] > o["E_calmar_full"] for o in sel); wo = sum(o["D_calmar_oos"] > o["E_calmar_oos"] for o in sel)
    print(f"{label}: {n} 對｜D 全期間勝 {wf}｜D 樣本外勝 {wo}｜D 兩段皆勝 {both}（{both/n*100:.0f}%）")
    return both / n
p1 = summary(out, "① 全部")
p2 = summary([o for o in out if 3 <= o["positions"] <= 8 and 20 <= o["hold_days"] <= 90], "② 實戰範圍")
d22 = st.median(float(o["D_2022"]) - float(o["E_2022"]) for o in out)
print(f"③ 2022 報酬差（D−E）中位數：{d22:+.1f} 個百分點")
ok = p1 > 0.5 and p2 > 0.5 and d22 >= -5
print("\n判定：" + ("✅ 三項成立，建議預設改為方案 D" if ok else "❌ 未全部成立，維持方案 E 為預設"))
