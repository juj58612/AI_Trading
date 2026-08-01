import requests
import json

payload = {
    "capital": 300000,
    "max_positions": 3,
    "fee_rate": 0.002,
    "start_date": "2022-01-01",
    "end_date": "2026-08-01",
    "max_hold_days": 30,
    "exit_strategy": "C"
}

try:
    res = requests.post("http://127.0.0.1:58889/api/backtest/run", json=payload)
    data = res.json()
    metrics = data.get("metrics", {})
    trades = data.get("trades", [])
    
    print(f"Total Return: {metrics.get('total_return')}%")
    print(f"MDD: {metrics.get('mdd')}%")
    print(f"Win Rate: {metrics.get('win_rate')}%")
    print(f"Total Trades: {len(trades)}")
    
    # Analyze worst trades
    trades.sort(key=lambda x: x['pnl'])
    print("\nWorst 3 Trades:")
    for t in trades[:3]:
        print(f"{t['ticker']} {t['name']}: {t['pnl_pct']}% (Reason: {t['reason']})")
        
    print("\nBest 3 Trades:")
    trades.sort(key=lambda x: x['pnl'], reverse=True)
    for t in trades[:3]:
        print(f"{t['ticker']} {t['name']}: {t['pnl_pct']}% (Reason: {t['reason']})")
except Exception as e:
    print(e)
