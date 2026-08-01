import os
import json
import time
import requests
import datetime
import uvicorn
import pandas as pd
import yfinance as yf
import math
import sqlite3
import strategy_core
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DIR_PATH = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(DIR_PATH, "backtest_database.json")
SQLITE_PATH = os.path.join(DIR_PATH, "backtest_logs.db")

# Initialize SQLite Database
def init_db():
    conn = sqlite3.connect(SQLITE_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS experiments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            capital REAL,
            max_positions INTEGER,
            fee_rate REAL,
            start_date TEXT,
            end_date TEXT,
            max_hold_days INTEGER,
            exit_strategy TEXT,
            total_return REAL,
            mdd REAL,
            win_rate REAL,
            profit_factor REAL,
            total_trades INTEGER
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            experiment_id INTEGER,
            ticker TEXT,
            name TEXT,
            buy_date TEXT,
            sell_date TEXT,
            buy_price REAL,
            sell_price REAL,
            pnl_pct REAL,
            pnl REAL,
            hold_days INTEGER,
            mfe REAL,
            mae REAL,
            reason TEXT,
            FOREIGN KEY(experiment_id) REFERENCES experiments(id)
        )
    ''')
    conn.commit()
    conn.close()

init_db()

# Stock List
STOCK_NAMES = {
    "2330": "台積電",
    "2317": "鴻海",
    "2382": "廣達",
    "3231": "緯創",
    "6669": "緯穎",
    "2376": "技嘉",
    "2356": "英業達",
    "2324": "仁寶",
    "3706": "神達",
    "2357": "華碩",
    "2353": "宏碁",
    "3017": "奇鋐",
    "3324": "雙鴻",
    "2421": "建準",
    "3653": "健策",
    "3338": "泰碩",
    "8996": "高力",
    "3013": "晟銘電",
    "6117": "迎廣",
    "3693": "營邦",
    "8210": "勤誠",
    "2059": "川湖",
    "2308": "台達電",
    "6282": "康舒",
    "2345": "智邦",
    "2368": "金像電",
    "3044": "健鼎",
    "2313": "華通",
    "3037": "欣興",
    "8046": "南電",
    "3189": "景碩",
    "2383": "台光電",
    "6274": "台燿",
    "6213": "聯茂",
    "3661": "世芯-KY",
    "3443": "創意",
    "3035": "智原",
    "6643": "M31",
    "3529": "力旺",
    "6531": "愛普*",
    "2454": "聯發科",
    "3034": "聯詠",
    "8299": "群聯",
    "5269": "祥碩",
    "4966": "譜瑞-KY",
    "3711": "日月光投控",
    "2449": "京元電子",
    "3131": "弘塑",
    "3583": "辛耘",
    "6187": "萬潤",
    "6515": "穎崴",
    "2360": "致茂",
    "3533": "嘉澤",
    "2359": "所羅門",
    "6414": "樺漢",
    "2395": "研華",
    "6139": "亞翔",
    "5443": "均豪",
    "2303": "聯電",
    "6230": "尼得科超眾",
}

TICKERS = ["2330", "2317", "2382", "3231", "6669", "2376", "2356", "2324", "3706", "2357", "2353", "3017", "3324", "2421", "3653", "3338", "8996", "3013", "6117", "3693", "8210", "2059", "2308", "6282", "2345", "2368", "3044", "2313", "3037", "8046", "3189", "2383", "6274", "6213", "3661", "3443", "3035", "6643", "3529", "6531", "2454", "3034", "8299", "5269", "4966", "3711", "2449", "3131", "3583", "6187", "6515", "2360", "3533", "2359", "6414", "2395", "6139", "5443", "2303", "6230"]

def get_tw_ticker(t):
    return f"{t}.TW" if t not in ["5269", "6531", "3529", "8299", "3131", "6274", "3583", "8046", "6643", "6187", "6414", "5443", "3324", "3693"] else f"{t}.TWO"

@app.get("/api/backtest/status")
async def get_db_status():
    if os.path.exists(DB_PATH):
        mod_time = os.path.getmtime(DB_PATH)
        return {"status": "ok", "last_updated": datetime.datetime.fromtimestamp(mod_time).strftime('%Y-%m-%d %H:%M:%S')}
    return {"status": "missing", "last_updated": "無資料"}

@app.post("/api/backtest/download")
async def download_data(request: Request):
    payload = await request.json()
    start_date = payload.get("start_date", "2025-01-01")
    end_date = payload.get("end_date", "2026-12-31")
    
    # Load existing DB to support incremental download (斷點續傳)
    db = {"prices": {}, "chips": {}}
    if os.path.exists(DB_PATH):
        try:
            with open(DB_PATH, 'r', encoding='utf-8') as f:
                db = json.load(f)
        except:
            pass
            
    try:
        # 1. Bulk Download Yahoo Finance (Adjusted Close)
        # We always refresh prices because Yahoo is fast and rarely blocks
        yf_tickers = [get_tw_ticker(t) for t in TICKERS]
        data = yf.download(yf_tickers, start=start_date, end=end_date, group_by='ticker', auto_adjust=True, progress=False)
        
        for i, t in enumerate(TICKERS):
            yf_t = yf_tickers[i]
            if len(TICKERS) > 1:
                hist = data[yf_t].dropna()
            else:
                hist = data.dropna()
                
            if not hist.empty:
                db["prices"][t] = []
                for date, row in hist.iterrows():
                    db["prices"][t].append({
                        "date": date.strftime('%Y-%m-%d'),
                        "open": float(row['Open']),
                        "high": float(row['High']),
                        "low": float(row['Low']),
                        "close": float(row['Close']),
                        "volume": int(row['Volume'])
                    })
        
        # Save after Yahoo fetch
        with open(DB_PATH, 'w', encoding='utf-8') as f:
            json.dump(db, f, ensure_ascii=False)
            
        # 2. Download FinMind Chips incrementally
        for i, t in enumerate(TICKERS):
            # Check if this stock already has chips for the requested range
            existing_chips = db["chips"].get(t, [])
            needs_download = True
            
            if len(existing_chips) > 0:
                first_date = existing_chips[0]["date"]
                last_date = existing_chips[-1]["date"]
                # If existing data covers the requested range, skip!
                if first_date <= start_date and last_date >= end_date:
                    needs_download = False
                    
            if not needs_download:
                continue # Skip! We already have this data!
                
            # FinMind is strict, so we fetch missing data and add delay
            inst_url = f"https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInstitutionalInvestorsBuySell&data_id={t}&start_date={start_date}&end_date={end_date}"
            try:
                res = requests.get(inst_url, timeout=10).json()
                if res.get("msg") == "success":
                    inst_dict = {}
                    for row in res.get("data", []):
                        d = row["date"]
                        name = row["name"]
                        net = (row.get("buy", 0) - row.get("sell", 0)) // 1000
                        if d not in inst_dict:
                            inst_dict[d] = {"foreign": 0, "trust": 0}
                        if name in ["Foreign_Investor", "Foreign_Dealer_Self"]:
                            inst_dict[d]["foreign"] += net
                        elif name == "Investment_Trust":
                            inst_dict[d]["trust"] += net
                    
                    db["chips"][t] = [{"date": k, "foreign": v["foreign"], "trust": v["trust"]} for k, v in sorted(inst_dict.items())]
                    
                    # IMMEDIATELY SAVE after each stock (斷點續傳)
                    with open(DB_PATH, 'w', encoding='utf-8') as f:
                        json.dump(db, f, ensure_ascii=False)
                        
            except Exception as e:
                pass
            
            time.sleep(1.0) # Increased delay to prevent FinMind ban
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
    return {"message": "Data downloaded successfully"}

class BacktestRequest(BaseModel):
    capital: float
    max_positions: int
    fee_rate: float
    start_date: str
    end_date: str
    max_hold_days: int
    exit_strategy: str

@app.post("/api/backtest/run")
async def run_backtest(req: BacktestRequest):
    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=400, detail="請先同步歷史資料庫")
        
    with open(DB_PATH, 'r', encoding='utf-8') as f:
        db = json.load(f)
        
    # Prepare DataFrame for prices
    prices_df = {}
    chips_df = {}
    
    for t in TICKERS:
        if t in db["prices"] and len(db["prices"][t]) > 0:
            df = pd.DataFrame(db["prices"][t])
            df.set_index("date", inplace=True)
            df.index = pd.to_datetime(df.index)
            # Calculate technicals
            df['MA5'] = df['close'].rolling(5).mean()
            df['MA20'] = df['close'].rolling(20).mean()
            df['Vol_MA5'] = df['volume'].rolling(5).mean()
            df['TR'] = pd.concat([
                df['high'] - df['low'],
                (df['high'] - df['close'].shift(1)).abs(),
                (df['low'] - df['close'].shift(1)).abs()
            ], axis=1).max(axis=1)
            df['ATR'] = df['TR'].rolling(14).mean()
            prices_df[t] = df
            
        if t in db["chips"] and len(db["chips"][t]) > 0:
            cdf = pd.DataFrame(db["chips"][t])
            cdf.set_index("date", inplace=True)
            cdf.index = pd.to_datetime(cdf.index)
            chips_df[t] = cdf

    # Get trading days
    all_dates = set()
    for t, df in prices_df.items():
        all_dates.update(df.index)
    
    trading_days = sorted([d for d in list(all_dates) if pd.Timestamp(req.start_date) <= d <= pd.Timestamp(req.end_date)])
    
    if not trading_days:
        raise HTTPException(status_code=400, detail="在選擇的時間範圍內無交易資料")

    portfolio = []
    trade_history = []
    daily_equity = []
    current_cash = req.capital
    
    # Capital per position
    pos_size = req.capital / req.max_positions

    # Loop through days
    for i, current_date in enumerate(trading_days):
        day_str = current_date.strftime('%Y-%m-%d')
        is_monday = current_date.weekday() == 0
        
        # 1. Exit logic (Every day)
        for p in portfolio[:]:
            t = p['ticker']
            df = prices_df[t]
            cdf = chips_df.get(t, pd.DataFrame())
            
            if current_date not in df.index: continue
            
            today_price = df.loc[current_date]
            close = today_price['close']
            
            yesterday_idx = df.index.get_loc(current_date) - 1 if current_date in df.index and df.index.get_loc(current_date) > 0 else -1
            yesterday_close = df.iloc[yesterday_idx]['close'] if yesterday_idx >= 0 else None
            
            sell_reason, p = strategy_core.evaluate_exit(
                p, today_price, yesterday_close, 
                cdf.loc[current_date] if current_date in cdf.index else {}, 
                req.exit_strategy, req.max_hold_days, current_date
            )

            if sell_reason:
                # Sell!
                sell_price = close
                revenue = p['shares'] * sell_price * (1 - req.fee_rate)
                cost = p['shares'] * p['buy_price'] * (1 + req.fee_rate)
                pnl = revenue - cost
                pnl_pct = pnl / cost
                
                current_cash += revenue
                
                mfe = (p['highest_price'] - p['buy_price']) / p['buy_price'] * 100
                mae = (p['lowest_price'] - p['buy_price']) / p['buy_price'] * 100
                days_held = (current_date - pd.Timestamp(p['buy_date'])).days
                
                trade_history.append({
                    "ticker": t,
                    "name": STOCK_NAMES.get(t, "未知"),
                    "buy_date": p['buy_date'],
                    "buy_price": round(p['buy_price'], 2),
                    "buy_score": p.get('buy_score', 0),
                    "buy_momentum": round(p.get('buy_momentum', 0) * 100, 2),
                    "buy_atr": round(p.get('buy_atr', 0), 2),
                    "sell_date": day_str,
                    "sell_price": round(sell_price, 2),
                    "reason": sell_reason,
                    "pnl_pct": round(pnl_pct * 100, 2),
                    "pnl": round(pnl, 2),
                    "hold_days": days_held,
                    "mfe": round(mfe, 2),
                    "mae": round(mae, 2),
                    "trailing_stop_at_exit": round(p['trailing_stop'], 2)
                })
                portfolio.remove(p)

        # 2. Entry logic (Only on Mondays)
        if is_monday and len(portfolio) < req.max_positions:
            slots_available = req.max_positions - len(portfolio)
            candidates = []
            
            for t in TICKERS:
                if any(p['ticker'] == t for p in portfolio): continue
                df = prices_df.get(t)
                cdf = chips_df.get(t)
                if df is None or cdf is None or current_date not in df.index or current_date not in cdf.index:
                    continue
                
                today_price = df.loc[current_date]
                if pd.isna(today_price['MA5']): continue
                
                close = today_price['close']
                
                inst_list = []
                idx = cdf.index.get_loc(current_date) if current_date in cdf.index else -1
                if idx >= 1:
                    inst_list.append(cdf.iloc[idx-1].to_dict())
                if idx >= 0:
                    inst_list.append(cdf.iloc[idx].to_dict())
                    
                eval_res = strategy_core.evaluate_entry(today_price, inst_list, req.exit_strategy)
                
                if eval_res:
                    candidates.append({
                        "ticker": t,
                        "score": eval_res['score'],
                        "momentum": eval_res['momentum'],
                        "price": close,
                        "atr": eval_res['atr']
                    })
                    
            candidates.sort(key=lambda x: (x['score'], x['momentum']), reverse=True)
            to_buy = candidates[:slots_available]
            
            for buy_target in to_buy:
                # Buy
                if current_cash < 1000: break
                alloc = min(pos_size, current_cash)
                shares = alloc / (buy_target['price'] * (1 + req.fee_rate))
                
                cost = shares * buy_target['price'] * (1 + req.fee_rate)
                current_cash -= cost
                
                # Initial Trailing Stop Multiplier
                mult = 1.5 if req.exit_strategy == 'D' else 3.0
                
                portfolio.append({
                    "ticker": buy_target['ticker'],
                    "buy_date": day_str,
                    "buy_price": buy_target['price'],
                    "shares": shares,
                    "highest_price": buy_target['price'],
                    "lowest_price": buy_target['price'],
                    "trailing_stop": buy_target['price'] - (mult * buy_target['atr']),
                    "atr_multiplier": mult,
                    "buy_score": buy_target['score'],
                    "buy_momentum": buy_target['momentum'],
                    "buy_atr": buy_target['atr']
                })
        
        # Calculate daily equity
        day_holding_val = 0
        for p in portfolio:
            df = prices_df.get(p['ticker'])
            if df is not None and current_date in df.index:
                day_holding_val += p['shares'] * df.loc[current_date]['close']
            else:
                day_holding_val += p['shares'] * p['buy_price']
        
        daily_equity.append({
            "date": day_str,
            "equity": round(current_cash + day_holding_val, 2)
        })

    # Liquidate remaining at the end
    last_date = trading_days[-1].strftime('%Y-%m-%d')
    for p in portfolio:
        t = p['ticker']
        df = prices_df[t]
        sell_price = df.iloc[-1]['close']
        
        revenue = p['shares'] * sell_price * (1 - req.fee_rate)
        cost = p['shares'] * p['buy_price'] * (1 + req.fee_rate)
        pnl = revenue - cost
        
        current_cash += revenue
        mfe = (p['highest_price'] - p['buy_price']) / p['buy_price'] * 100
        mae = (p['lowest_price'] - p['buy_price']) / p['buy_price'] * 100
        
        trade_history.append({
            "ticker": t,
            "name": STOCK_NAMES.get(t, "未知"),
            "buy_date": p['buy_date'],
            "buy_price": round(p['buy_price'], 2),
            "buy_score": p.get('buy_score', 0),
            "buy_momentum": round(p.get('buy_momentum', 0) * 100, 2),
            "buy_atr": round(p.get('buy_atr', 0), 2),
            "sell_date": last_date,
            "sell_price": round(sell_price, 2),
            "reason": "期末平倉",
            "pnl_pct": round(pnl / cost * 100, 2),
            "pnl": round(pnl, 2),
            "hold_days": (trading_days[-1] - pd.Timestamp(p['buy_date'])).days,
            "mfe": round(mfe, 2),
            "mae": round(mae, 2),
            "trailing_stop_at_exit": round(p['trailing_stop'], 2)
        })
        
    # Calculate Metrics
    final_equity = daily_equity[-1]['equity'] if daily_equity else req.capital
    
    win_trades = [t for t in trade_history if t['pnl'] > 0]
    loss_trades = [t for t in trade_history if t['pnl'] <= 0]
    
    win_rate = (len(win_trades) / len(trade_history)) * 100 if trade_history else 0
    gross_profit = sum(t['pnl'] for t in win_trades)
    gross_loss = abs(sum(t['pnl'] for t in loss_trades))
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else (999 if gross_profit > 0 else 0)
    
    # Calculate MDD
    mdd = 0
    peak = -float('inf')
    for day in daily_equity:
        val = day['equity']
        if val > peak: peak = val
        dd = (peak - val) / peak * 100
        if dd > mdd: mdd = dd
        
    metrics_dict = {
        "total_return": round((final_equity - req.capital) / req.capital * 100, 2),
        "mdd": round(mdd, 2),
        "win_rate": round(win_rate, 2),
        "profit_factor": round(profit_factor, 2),
        "total_trades": len(trade_history)
    }
    
    # Save to SQLite DB
    try:
        conn = sqlite3.connect(SQLITE_PATH)
        c = conn.cursor()
        c.execute('''
            INSERT INTO experiments (capital, max_positions, fee_rate, start_date, end_date, max_hold_days, exit_strategy, total_return, mdd, win_rate, profit_factor, total_trades)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (req.capital, req.max_positions, req.fee_rate, req.start_date, req.end_date, req.max_hold_days, req.exit_strategy, metrics_dict['total_return'], metrics_dict['mdd'], metrics_dict['win_rate'], metrics_dict['profit_factor'], metrics_dict['total_trades']))
        
        experiment_id = c.lastrowid
        
        # Insert trades
        trade_records = []
        for t in trade_history:
            trade_records.append((
                experiment_id, t['ticker'], t['name'], t['buy_date'], t['sell_date'],
                t['buy_price'], t['sell_price'], t['pnl_pct'], t['pnl'],
                t['hold_days'], t['mfe'], t['mae'], t['reason']
            ))
            
        if trade_records:
            c.executemany('''
                INSERT INTO trades (experiment_id, ticker, name, buy_date, sell_date, buy_price, sell_price, pnl_pct, pnl, hold_days, mfe, mae, reason)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', trade_records)
            
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Failed to log to SQLite: {e}")

    return {
        "metrics": metrics_dict,
        "daily_equity": daily_equity,
        "trades": trade_history
    }

class GridSearchRequest(BaseModel):
    capital: float
    fee_rate: float
    start_date: str
    end_date: str

@app.post("/api/backtest/grid_search")
async def run_grid_search(req: GridSearchRequest):
    strategies = ['C', 'D']
    positions = [3, 5]
    hold_days = [30, 999]
    
    results = []
    
    for strategy in strategies:
        for pos in positions:
            for hd in hold_days:
                sub_req = BacktestRequest(
                    capital=req.capital,
                    max_positions=pos,
                    fee_rate=req.fee_rate,
                    start_date=req.start_date,
                    end_date=req.end_date,
                    max_hold_days=hd,
                    exit_strategy=strategy
                )
                
                res = await run_backtest(sub_req)
                
                results.append({
                    "strategy": strategy,
                    "max_positions": pos,
                    "max_hold_days": hd,
                    "metrics": res["metrics"]
                })
                
    results.sort(key=lambda x: x["metrics"]["total_return"], reverse=True)
    return {"status": "success", "grid_results": results}

@app.get("/api/analysis/experiments")
def get_experiments():
    if not os.path.exists(SQLITE_PATH):
        return {"data": []}
        
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM experiments ORDER BY id DESC")
    rows = c.fetchall()
    conn.close()
    
    return {"data": [dict(r) for r in rows]}

@app.get("/api/analysis/trades/{experiment_id}")
def get_trades(experiment_id: int):
    if not os.path.exists(SQLITE_PATH):
        return {"data": []}
        
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM trades WHERE experiment_id = ?", (experiment_id,))
    rows = c.fetchall()
    conn.close()
    
    return {"data": [dict(r) for r in rows]}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=58889)
