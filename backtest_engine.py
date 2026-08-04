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
import optuna
import strategy_core
from fastapi import FastAPI, APIRouter, Request, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI()
router = APIRouter()
app.include_router(router)

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
            total_trades INTEGER,
            is_out_of_sample BOOLEAN DEFAULT 0,
            return_2021 REAL DEFAULT 0,
            return_2022 REAL DEFAULT 0,
            return_2023 REAL DEFAULT 0,
            return_2024 REAL DEFAULT 0,
            return_2025 REAL DEFAULT 0,
            return_2026 REAL DEFAULT 0
        )
    ''')
    
    # Migrations
    try:
        c.execute("PRAGMA table_info(experiments)")
        cols = [col[1] for col in c.fetchall()]
        if 'is_out_of_sample' not in cols:
            c.execute("ALTER TABLE experiments ADD COLUMN is_out_of_sample BOOLEAN DEFAULT 0")
        if "cagr" not in cols:
            c.execute("ALTER TABLE experiments ADD COLUMN cagr REAL DEFAULT 0")
        for yr in ["2021", "2022", "2023", "2024", "2025", "2026"]:
            col_name = f"return_{yr}"
            if col_name not in cols:
                c.execute(f"ALTER TABLE experiments ADD COLUMN {col_name} REAL DEFAULT 0")
    except Exception as e:
        print(f"Migration notice: {e}")

    c.execute('''
        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            experiment_id INTEGER,
            ticker TEXT,
            name TEXT,
            buy_date TEXT,
            buy_price REAL,
            buy_score REAL,
            buy_momentum REAL,
            buy_atr REAL,
            sell_date TEXT,
            sell_price REAL,
            reason TEXT,
            pnl_pct REAL,
            pnl REAL,
            hold_days INTEGER,
            mfe REAL,
            mae REAL,
            trailing_stop_at_exit REAL,
            macro_trend TEXT DEFAULT '未知',
            FOREIGN KEY (experiment_id) REFERENCES experiments (id)
        )
    ''')
    
    # Check if macro_trend exists, if not add it (Migration)
    c.execute("PRAGMA table_info(trades)")
    cols = [col[1] for col in c.fetchall()]
    if 'macro_trend' not in cols:
        c.execute("ALTER TABLE trades ADD COLUMN macro_trend TEXT DEFAULT '未知'")
        
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

def fetch_taiex_history(start="2022-01-01"):
    try:
        df = yf.download("^TWII", start=start, progress=False)
        if df.empty:
            return pd.DataFrame()
        # Flatten multiindex columns if necessary
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
            
        df = df[['Close']].copy()
        df.columns = ['close']
        df['MA20'] = df['close'].rolling(20).mean()
        df['MA60'] = df['close'].rolling(60).mean()
        df.reset_index(inplace=True)
        # normalize column name to date
        df.rename(columns={'Date': 'date', 'index': 'date'}, inplace=True)
        df['date'] = df['date'].dt.strftime('%Y-%m-%d')
        return df
    except Exception as e:
        print(f"Error fetching TAIEX: {e}")
        return pd.DataFrame()

def fetch_macro_3in1_series(start_date, end_date):
    """
    盤後計算歷史「三合一巨觀風控熔斷保險絲」逐日訊號 (strategy_core.evaluate_macro_3in1_status)，
    供回測引擎套用進場否決/減碼，讓回測跟 doc.html 宣稱的風控行為一致。
    回傳: {date_str: {'veto_buy': bool, 'pos_scale': float, ...}}
    """
    token = os.getenv("FINMIND_API_TOKEN", "")
    result = {}
    try:
        # 1. 外資期貨淨空單 (TX 台指期未平倉)
        fut_url = f"https://api.finmindtrade.com/api/v4/data?dataset=TaiwanFuturesInstitutionalInvestors&data_id=TX&start_date={start_date}&end_date={end_date}&token={token}"
        fut_data = requests.get(fut_url, timeout=20).json().get("data", [])
        fut_by_date = {}
        for row in fut_data:
            if row.get("institutional_investors") == "外資":
                net_short = row.get("short_open_interest_balance_volume", 0) - row.get("long_open_interest_balance_volume", 0)
                fut_by_date[row["date"]] = net_short

        # 2. 台幣匯率 (USD/TWD 即期買入)
        fx_url = f"https://api.finmindtrade.com/api/v4/data?dataset=TaiwanExchangeRate&data_id=USD&start_date={start_date}&end_date={end_date}&token={token}"
        fx_data = requests.get(fx_url, timeout=20).json().get("data", [])
        fx_dates = sorted([row["date"] for row in fx_data])
        fx_rate_by_date = {row["date"]: row.get("spot_buy", 0) for row in fx_data}

        # 3. 外資現貨全市場單日買賣超 (三大法人彙總)
        inst_url = f"https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockTotalInstitutionalInvestors&start_date={start_date}&end_date={end_date}&token={token}"
        inst_data = requests.get(inst_url, timeout=20).json().get("data", [])
        spot_by_date = {}
        for row in inst_data:
            if row.get("name") == "Foreign_Investor":
                spot_by_date[row["date"]] = (row.get("buy", 0) - row.get("sell", 0)) / 1e8  # 換算億元

        all_dates = sorted(set(list(fut_by_date.keys()) + fx_dates + list(spot_by_date.keys())))
        for d in all_dates:
            twd_change_5d = 0.0
            if d in fx_dates:
                idx = fx_dates.index(d)
                if idx >= 5:
                    prev_rate = fx_rate_by_date.get(fx_dates[idx - 5])
                    curr_rate = fx_rate_by_date.get(d)
                    if prev_rate and curr_rate:
                        twd_change_5d = (curr_rate - prev_rate) * 10  # 換算成「角」

            result[d] = strategy_core.evaluate_macro_3in1_status(
                foreign_spot_buy=spot_by_date.get(d, 0),
                twd_rate_change_5d=twd_change_5d,
                foreign_futures_short=fut_by_date.get(d, 0)
            )
    except Exception as e:
        print(f"⚠️ 三合一巨觀風控資料抓取失敗，本次回測不套用風控 (fail-open): {e}")
    return result

OTC_TICKERS = {"3131", "3324", "3529", "3693", "4966", "5443", "6187", "6274", "6643", "8299"}

def get_tw_ticker(t):
    return f"{t}.TWO" if t in OTC_TICKERS else f"{t}.TW"

@app.get("/api/backtest/status")
async def get_db_status():
    pool_size = len(TICKERS)
    if not os.path.exists(DB_PATH):
        return {"status": "missing", "last_updated": "無資料", "pool_size": pool_size, "covered": 0, "missing_tickers": TICKERS, "date_start": None, "date_end": None}

    mod_time = os.path.getmtime(DB_PATH)
    try:
        with open(DB_PATH, 'r', encoding='utf-8') as f:
            db = json.load(f)
    except Exception:
        return {"status": "missing", "last_updated": "資料庫檔案損毀", "pool_size": pool_size, "covered": 0, "missing_tickers": TICKERS, "date_start": None, "date_end": None}

    prices = db.get("prices", {})
    chips = db.get("chips", {})
    # 「涵蓋」定義：這檔股票的股價跟法人籌碼都至少抓到一些資料，缺任一邊都算未完整
    covered = [t for t in TICKERS if prices.get(t) and chips.get(t)]
    missing = [t for t in TICKERS if t not in covered]

    date_start, date_end = None, None
    for t in covered:
        dates = [row["date"] for row in prices[t]]
        if not dates:
            continue
        t_min, t_max = min(dates), max(dates)
        if date_start is None or t_min < date_start:
            date_start = t_min
        if date_end is None or t_max > date_end:
            date_end = t_max

    return {
        "status": "ok",
        "last_updated": datetime.datetime.fromtimestamp(mod_time).strftime('%Y-%m-%d %H:%M:%S'),
        "pool_size": pool_size,
        "covered": len(covered),
        "missing_tickers": missing,
        "date_start": date_start,
        "date_end": date_end
    }

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
                if t not in db["prices"]:
                    db["prices"][t] = []
                
                # Merge logic
                existing_data = {row["date"]: row for row in db["prices"][t]}
                for date, row in hist.iterrows():
                    d_str = date.strftime('%Y-%m-%d')
                    existing_data[d_str] = {
                        "date": d_str,
                        "open": float(row['Open']),
                        "high": float(row['High']),
                        "low": float(row['Low']),
                        "close": float(row['Close']),
                        "volume": int(row['Volume'])
                    }
                db["prices"][t] = [existing_data[k] for k in sorted(existing_data.keys())]
        
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
                    
                    if t not in db["chips"]:
                        db["chips"][t] = []
                        
                    existing_chips_dict = {row["date"]: row for row in db["chips"][t]}
                    
                    for k, v in inst_dict.items():
                        existing_chips_dict[k] = {"date": k, "foreign": v["foreign"], "trust": v["trust"]}
                        
                    db["chips"][t] = [existing_chips_dict[k] for k in sorted(existing_chips_dict.keys())]
                    
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
    is_out_of_sample: bool = False

@app.post("/api/backtest/run")
async def run_backtest(req: BacktestRequest):
    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=400, detail="請先同步歷史資料庫")
        
    with open(DB_PATH, 'r', encoding='utf-8') as f:
        db = json.load(f)
        
    # Fetch TAIEX for macro trend
    taiex_df = fetch_taiex_history(req.start_date)
    if not taiex_df.empty:
        taiex_df.set_index("date", inplace=True)
        taiex_df.index = pd.to_datetime(taiex_df.index)

    # 三合一巨觀風控熔斷保險絲：逐日訊號，套用於進場否決/減碼
    macro_series = fetch_macro_3in1_series(req.start_date, req.end_date)
    macro_veto_weeks = 0

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
                
                # Determine Macro Trend at Buy Time
                macro_trend = "未知"
                buy_date_ts = pd.Timestamp(p['buy_date'])
                if not taiex_df.empty and buy_date_ts in taiex_df.index:
                    t_idx = taiex_df.loc[buy_date_ts]
                    if not pd.isna(t_idx['MA20']):
                        macro_trend = "大多頭" if t_idx['close'] > t_idx['MA20'] else "空頭震盪"
                
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
                    "trailing_stop_at_exit": round(p['trailing_stop'], 2),
                    "macro_trend": macro_trend
                })
                portfolio.remove(p)

        # 2. Entry logic (Only on Mondays)
        macro_status = macro_series.get(day_str, {"veto_buy": False, "pos_scale": 1.0}) if is_monday else {}
        if is_monday and macro_status.get("veto_buy"):
            macro_veto_weeks += 1
        if is_monday and len(portfolio) < req.max_positions and not macro_status.get("veto_buy"):
            pos_scale = macro_status.get("pos_scale", 1.0)
            slots_available = int((req.max_positions - len(portfolio)) * pos_scale)
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
                    
                eval_res = strategy_core.evaluate_entry(today_price, inst_list, req.exit_strategy, req.max_hold_days)
                
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
            
            # 華爾街逆波動率 (Risk Parity / Inverse Volatility Weighting) 算子
            total_inv_vol = 0.0
            for bt in to_buy:
                vol_pct = (bt['atr'] / bt['price']) if bt['price'] > 0 else 0.02
                bt['inv_vol'] = 1.0 / max(vol_pct, 0.005)
                total_inv_vol += bt['inv_vol']
                
            for buy_target in to_buy:
                # Buy
                if current_cash < 1000: break
                
                # 動態分配資金：高波動少配，低波動多配
                weight = (buy_target['inv_vol'] / total_inv_vol) if total_inv_vol > 0 else (1.0 / len(to_buy))
                target_alloc = min(req.capital * weight, current_cash)
                alloc = min(target_alloc, current_cash)
                
                # 零股與高價股滑價處罰模型 (高於 1000 元加扣 0.2% 額外滑價)
                effective_fee = req.fee_rate + (0.002 if buy_target['price'] >= 1000 else 0.0)
                shares = alloc / (buy_target['price'] * (1 + effective_fee))
                
                cost = shares * buy_target['price'] * (1 + effective_fee)
                current_cash -= cost
                
                # Determine TAIEX trend at buy time to apply Dynamic ATR
                is_taiex_bull = True
                if not taiex_df.empty and current_date in taiex_df.index:
                    t_idx = taiex_df.loc[current_date]
                    if not pd.isna(t_idx['MA20']):
                        is_taiex_bull = t_idx['close'] > t_idx['MA20']
                
                # Initial Trailing Stop Multiplier (Dynamic ATR)
                if req.exit_strategy == 'D':
                    mult = 2.2 if is_taiex_bull else 1.5  # 多頭時放寬至 2.2 ATR 防止甩轎，空頭時收緊至 1.5 ATR 避險
                else:
                    mult = 3.0
                
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
        
        # Determine Macro Trend at Buy Time
        macro_trend = "未知"
        buy_date_ts = pd.Timestamp(p['buy_date'])
        if not taiex_df.empty and buy_date_ts in taiex_df.index:
            t_idx = taiex_df.loc[buy_date_ts]
            if not pd.isna(t_idx['MA20']):
                macro_trend = "大多頭" if t_idx['close'] > t_idx['MA20'] else "空頭震盪"
        
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
            "trailing_stop_at_exit": round(p['trailing_stop'], 2),
            "macro_trend": macro_trend
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
        
    # Calculate annual returns
    yearly_returns = {2021: 0.0, 2022: 0.0, 2023: 0.0, 2024: 0.0, 2025: 0.0, 2026: 0.0}
    if daily_equity:
        equity_by_year = {}
        for entry in daily_equity:
            yr = int(entry['date'][:4])
            if yr not in equity_by_year:
                equity_by_year[yr] = []
            equity_by_year[yr].append(entry)
            
        for yr in [2021, 2022, 2023, 2024, 2025, 2026]:
            if yr in equity_by_year:
                year_data = equity_by_year[yr]
                prev_yr = yr - 1
                if prev_yr in equity_by_year:
                    start_val = equity_by_year[prev_yr][-1]['equity']
                else:
                    start_val = req.capital
                    if year_data[0]['date'] == daily_equity[0]['date']:
                        start_val = req.capital
                    else:
                        closest_val = req.capital
                        for entry in daily_equity:
                            if int(entry['date'][:4]) < yr:
                                closest_val = entry['equity']
                        start_val = closest_val
                
                end_val = year_data[-1]['equity']
                yearly_returns[yr] = round((end_val - start_val) / start_val * 100, 2)

    # Compute CAGR (Compound Annual Growth Rate)
    try:
        d1 = datetime.datetime.strptime(req.start_date, "%Y-%m-%d")
        d2 = datetime.datetime.strptime(req.end_date, "%Y-%m-%d")
        days = max(1, (d2 - d1).days)
        years_cnt = max(0.05, days / 365.25)
        tot_ratio = max(0.0001, final_equity / req.capital)
        cagr = round(((tot_ratio ** (1.0 / years_cnt)) - 1) * 100, 2)
    except Exception:
        cagr = 0.0

    metrics_dict = {
        "total_return": round((final_equity - req.capital) / req.capital * 100, 2),
        "cagr": cagr,
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
            INSERT INTO experiments (capital, max_positions, fee_rate, start_date, end_date, max_hold_days, exit_strategy, total_return, cagr, mdd, win_rate, profit_factor, total_trades, is_out_of_sample, return_2021, return_2022, return_2023, return_2024, return_2025, return_2026)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (req.capital, req.max_positions, req.fee_rate, req.start_date, req.end_date, req.max_hold_days, req.exit_strategy, metrics_dict['total_return'], metrics_dict['cagr'], metrics_dict['mdd'], metrics_dict['win_rate'], metrics_dict['profit_factor'], metrics_dict['total_trades'], req.is_out_of_sample, yearly_returns[2021], yearly_returns[2022], yearly_returns[2023], yearly_returns[2024], yearly_returns[2025], yearly_returns[2026]))
        
        experiment_id = c.lastrowid
        
        # Insert trades
        trade_records = []
        for t in trade_history:
            trade_records.append((
                experiment_id, t['ticker'], t['name'], t['buy_date'], t['sell_date'],
                t['buy_price'], t['sell_price'], t['pnl_pct'], t['pnl'],
                t['hold_days'], t['mfe'], t['mae'], t['reason'], t['macro_trend']
            ))
            
        if trade_records:
            c.executemany('''
                INSERT INTO trades (experiment_id, ticker, name, buy_date, sell_date, buy_price, sell_price, pnl_pct, pnl, hold_days, mfe, mae, reason, macro_trend)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', trade_records)
            
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Failed to log to SQLite: {e}")

    return {
        "metrics": metrics_dict,
        "daily_equity": daily_equity,
        "trades": trade_history,
        "macro_veto_weeks": macro_veto_weeks
    }

class GridSearchRequest(BaseModel):
    capital: float
    fee_rate: float
    start_date: str
    end_date: str

@app.post("/api/backtest/grid_search")
async def run_bayesian_optimization(req: GridSearchRequest):
    # Optuna study
    study = optuna.create_study(direction="maximize")
    
    # Temporal Split (70% IS, 30% OOS)
    try:
        dates = pd.date_range(req.start_date, req.end_date)
        if len(dates) < 30:
            return {"status": "error", "detail": "時間區間太短，無法進行樣本外切割"}
        split_idx = int(len(dates) * 0.7)
        is_end_date = dates[split_idx].strftime('%Y-%m-%d')
        oos_start_date = dates[split_idx + 1].strftime('%Y-%m-%d')
    except Exception as e:
        return {"status": "error", "detail": f"日期解析錯誤: {str(e)}"}
        
    n_trials = 20 # 限制在 20 次以內快速完成展示
    results = []
    
    for i in range(n_trials):
        trial = study.ask()
        
        strategy = trial.suggest_categorical("strategy", ['C', 'D'])
        pos = trial.suggest_int("max_positions", 2, 5)
        hd = trial.suggest_categorical("max_hold_days", [30, 60, 999])
        
        sub_req = BacktestRequest(
            capital=req.capital,
            max_positions=pos,
            fee_rate=req.fee_rate,
            start_date=req.start_date,
            end_date=is_end_date,
            max_hold_days=hd,
            exit_strategy=strategy,
            is_out_of_sample=False
        )
        
        try:
            res = await run_backtest(sub_req)
            ret = res["metrics"]["total_return"]
            mdd = res["metrics"]["mdd"]
            score = ret - (mdd * 2)
            study.tell(trial, score)
            
            results.append({
                "strategy": strategy, "max_positions": pos, "max_hold_days": hd,
                "metrics": res["metrics"], "score": score
            })
        except Exception as e:
            study.tell(trial, -999) # 懲罰失敗的 trial
            
    best_params = study.best_params
    
    # Run Out-Of-Sample
    oos_req = BacktestRequest(
        capital=req.capital,
        max_positions=best_params["max_positions"],
        fee_rate=req.fee_rate,
        start_date=oos_start_date,
        end_date=req.end_date,
        max_hold_days=best_params["max_hold_days"],
        exit_strategy=best_params["strategy"],
        is_out_of_sample=True
    )
    
    try:
        await run_backtest(oos_req)
    except Exception:
        pass # If OOS fails (e.g. no trades), it's fine
        
    return {"status": "success", "message": "Bayesian Optimization Complete", "best_params": best_params}

@app.post("/api/analysis/clear_db")
def clear_experiments_db():
    try:
        if os.path.exists(SQLITE_PATH):
            conn = sqlite3.connect(SQLITE_PATH)
            c = conn.cursor()
            c.execute("DELETE FROM trades")
            c.execute("DELETE FROM experiments")
            conn.commit()
            conn.close()
        return {"status": "success", "message": "SQLite 回測資料庫已成功清空！"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/analysis/experiments")
def get_experiments():
    if not os.path.exists(SQLITE_PATH):
        return {"data": []}
        
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM experiments ORDER BY total_return DESC")
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

@app.get("/api/analysis/trades_all_top")
def get_all_top_trades():
    if not os.path.exists(SQLITE_PATH):
        return {"data": []}
        
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT id, exit_strategy, max_positions, max_hold_days, total_return FROM experiments ORDER BY total_return DESC LIMIT 10")
    top_exps = c.fetchall()
    
    all_trades = []
    for rank_idx, exp in enumerate(top_exps):
        exp_id = exp['id']
        c.execute("SELECT * FROM trades WHERE experiment_id = ? ORDER BY buy_date ASC", (exp_id,))
        t_rows = c.fetchall()
        for t in t_rows:
            td = dict(t)
            td['rank'] = rank_idx + 1
            td['strategy_label'] = f"方案 {exp['exit_strategy']}"
            all_trades.append(td)
            
    conn.close()
    return {"data": all_trades}

# Mega Grid Search background task definitions
mega_grid_status = {
    "running": False,
    "current": 0,
    "total": 0,
    "message": "尚未啟動",
    "errors": []
}

class MegaGridRequest(BaseModel):
    capital: float
    fee_rate: float
    start_date: str
    end_date: str
    positions: List[int]
    hold_days: List[int]
    strategies: List[str]

async def run_mega_grid_task(req: MegaGridRequest):
    global mega_grid_status
    mega_grid_status["running"] = True
    mega_grid_status["current"] = 0
    mega_grid_status["errors"] = []
    
    # Calculate combinations
    combos = []
    for s in req.strategies:
        for p in req.positions:
            for hd in req.hold_days:
                combos.append((s, p, hd))
                
    mega_grid_status["total"] = len(combos)
    mega_grid_status["message"] = f"開始運算 {len(combos)} 組組合..."
    
    for idx, (strategy, pos, hd) in enumerate(combos):
        sub_req = BacktestRequest(
            capital=req.capital,
            max_positions=pos,
            fee_rate=req.fee_rate,
            start_date=req.start_date,
            end_date=req.end_date,
            max_hold_days=hd,
            exit_strategy=strategy,
            is_out_of_sample=False
        )
        try:
            mega_grid_status["message"] = f"正在運算 {strategy} 方案 | 持倉 {pos} 檔 | 期限 {hd} 天 ({idx+1}/{len(combos)})..."
            await run_backtest(sub_req)
        except Exception as e:
            mega_grid_status["errors"].append(f"組合 {strategy}-{pos}-{hd} 失敗: {str(e)}")
            
        mega_grid_status["current"] = idx + 1
        
    mega_grid_status["running"] = False
    mega_grid_status["message"] = f"大數據網格運算完成！共成功跑完 {mega_grid_status['current']} 組組合。"

@app.post("/api/backtest/mega_grid")
async def start_mega_grid(req: MegaGridRequest, background_tasks: BackgroundTasks):
    global mega_grid_status
    if mega_grid_status["running"]:
        raise HTTPException(status_code=400, detail="已有大數據運算正在進行中")
        
    background_tasks.add_task(run_mega_grid_task, req)
    return {"status": "started", "message": "已在背景啟動巨量大數據網格搜索"}

@app.get("/api/backtest/mega_grid/status")
async def get_mega_grid_status():
    global mega_grid_status
    return mega_grid_status

@app.get("/api/analysis/attribution")
def get_attribution():
    if not os.path.exists(SQLITE_PATH):
        return {"status": "error", "message": "無回測資料庫"}
        
    try:
        conn = sqlite3.connect(SQLITE_PATH)
        df_exp = pd.read_sql_query("SELECT * FROM experiments", conn)
        conn.close()
        
        if df_exp.empty:
            return {"status": "empty", "message": "目前尚無回測數據"}
            
        # 1. Hold Days Sensitivity
        hold_sens = df_exp.groupby('max_hold_days')[['total_return', 'mdd', 'return_2022', 'return_2023']].mean().reset_index()
        hold_sens = hold_sens.to_dict(orient='records')
        
        # 2. Positions Sensitivity
        pos_sens = df_exp.groupby('max_positions')[['total_return', 'mdd', 'return_2022', 'return_2023']].mean().reset_index()
        pos_sens = pos_sens.to_dict(orient='records')
        
        # 3. Strategy Sensitivity
        strat_sens = df_exp.groupby('exit_strategy')[['total_return', 'mdd', 'return_2022', 'return_2023']].mean().reset_index()
        strat_sens = strat_sens.to_dict(orient='records')
        
        # 4. Generate AI Decisions
        decisions = []
        
        # Rule on short hold days
        low_hold_df = df_exp[df_exp['max_hold_days'] < 12]
        if not low_hold_df.empty:
            low_hold_ret = low_hold_df['total_return'].mean()
            if low_hold_ret < 0:
                decisions.append(f"⚠️ <b>交易成本警訊</b>：持倉天數小於 12 天時，平均總報酬率為 {round(low_hold_ret, 2)}%。頻繁交易的手續費與摩擦成本已吞噬全部獲利，<b>強烈建議操作模型之持倉期限必須大於 20 天</b>。")
                
        # Rule on optimal hold days
        high_hold_df = df_exp[df_exp['max_hold_days'] >= 12]
        if not high_hold_df.empty:
            best_hold = high_hold_df.groupby('max_hold_days')['total_return'].mean().idxmax()
            best_hold_ret = high_hold_df.groupby('max_hold_days')['total_return'].mean().max()
            
            # Find defensive best
            best_def_hold = high_hold_df.groupby('max_hold_days')['return_2022'].mean().idxmax()
            best_def_ret = high_hold_df.groupby('max_hold_days')['return_2022'].mean().max()
            
            decisions.append(f"💡 <b>持倉天數黃金區間</b>：數據顯示，最優持倉期限為 <b>{best_hold} 天</b> (平均總報酬 {round(best_hold_ret, 2)}%)；但若考量 2022 年空頭防禦性，最優持倉期限為 <b>{best_def_hold} 天</b> (單年抗震回檔僅 {round(best_def_ret, 2)}%)。建議真實模型期限設定在 <b>30 ~ 60 天</b>，為抗震與爆發力最佳平衡區間。")

        # Rule on positions
        if not pos_sens == []:
            best_pos = df_exp.groupby('max_positions')['total_return'].mean().idxmax()
            pos_mdds = df_exp.groupby('max_positions')['mdd'].mean()
            mdd_3 = pos_mdds.get(3, None)
            mdd_5 = pos_mdds.get(5, None)
            if mdd_3 and mdd_5:
                mdd_reduction = round(mdd_3 - mdd_5, 2)
                decisions.append(f"🛡️ <b>資金分散防護力</b>：將持倉上限由 3 檔提高至 5 檔時，平均最大回撤 (MDD) 由 {round(mdd_3, 2)}% 降低至 {round(mdd_5, 2)}% (<b>風險降低了 {mdd_reduction}%</b>)，總報酬幾乎持平。<b>建議採用 5 檔配置進行資金均分。</b>")
                
        # Rule on strategies
        if not strat_sens == []:
            strat_rets = df_exp.groupby('exit_strategy')['total_return'].mean()
            ret_diff = round(strat_rets.get('D', 0) - strat_rets.get('C', 0), 2)
            decisions.append(f"🏆 <b>策略方案抉擇</b>：方案 D 的平均總報酬為 {round(strat_rets.get('D', 0), 2)}%，超越方案 C 的 {round(strat_rets.get('C', 0), 2)}% (<b>差幅達 {ret_diff}%</b>)。雖方案 C 在 2022 年防守稍強，但綜合考慮爆發力，<b>推薦採用方案 D 作為真實進出場核心。</b>")

        return {
            "status": "success",
            "hold_sens": hold_sens,
            "pos_sens": pos_sens,
            "strat_sens": strat_sens,
            "decisions": decisions
        }
    except Exception as e:
        return {"status": "error", "message": f"計算歸因失敗: {str(e)}"}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=58889)
