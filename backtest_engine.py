import os
import json
import time
import base64
import secrets
import requests
import datetime
import uvicorn
import pandas as pd
import yfinance as yf
import math
import sqlite3
import optuna
import strategy_core
from dotenv import load_dotenv
load_dotenv()  # 本機開發時載入 .env（Render 上沒有這個檔案，不影響雲端行為）
from fastapi import FastAPI, APIRouter, Request, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

# 跟 main.py 讀同一組管理者帳密環境變數，用來保護下面會寫入/清空資料庫、
# 觸發網路連線或跑重運算的 API（這支檔案是獨立的 FastAPI app，不會共用
# main.py 裡已經定義好的 authenticate()，所以在這裡自己重做一份同樣邏輯）
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "cyc58612")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")

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

# 「買入持有回測計算機」專用：跟上面 A/B/C/D 模型的股池完全分開的獨立資料庫，
# 使用者自選 ETF/個股清單，只快取股價+配息（不抓法人籌碼，這個計算機用不到）。
CUSTOM_DB_PATH = os.path.join(DIR_PATH, "backtest_database_custom.json")
CUSTOM_LIST_PATH = os.path.join(DIR_PATH, "custom_stock_list.txt")

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
            is_grid_trial BOOLEAN DEFAULT 0,
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
        if 'is_grid_trial' not in cols:
            # 「4. AI 網格最佳化」內部 20 次訓練期(前 70%)探索性試跑的標記，跟正式的
            # 單次回測/大數據回測區隔開，避免污染排行榜與 AI 智慧決策建議的統計平均
            c.execute("ALTER TABLE experiments ADD COLUMN is_grid_trial BOOLEAN DEFAULT 0")
        if "cagr" not in cols:
            c.execute("ALTER TABLE experiments ADD COLUMN cagr REAL DEFAULT 0")
        if "pool_size" not in cols:
            # 舊資料都是在股票池擴充到 70 檔之前跑的，回填為當時的 60 檔
            c.execute("ALTER TABLE experiments ADD COLUMN pool_size INTEGER DEFAULT 60")
        for yr in ["2021", "2022", "2023", "2024", "2025", "2026"]:
            col_name = f"return_{yr}"
            if col_name not in cols:
                c.execute(f"ALTER TABLE experiments ADD COLUMN {col_name} REAL DEFAULT 0")
        if "sharpe_ratio" not in cols:
            # Tier 3：daily_equity 本來就會為了算 MDD 逐日算出來，只是算完就丟掉沒存。
            # 這裡補存年化 Sharpe/Sortino，讓風險調整後報酬也能拿來排序/比較，不只看總報酬。
            c.execute("ALTER TABLE experiments ADD COLUMN sharpe_ratio REAL DEFAULT 0")
        if "sortino_ratio" not in cols:
            c.execute("ALTER TABLE experiments ADD COLUMN sortino_ratio REAL DEFAULT 0")
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

def require_admin(request: Request):
    """
    會寫入/清空資料庫、觸發網路連線（yfinance/FinMind）、或跑重運算的 API，
    原本完全沒有任何驗證機制（2026-08-11 資安檢查發現，任何人知道網址就能直接
    呼叫，不需要透過前端畫面）。修正為一律要求管理者帳密（跟 main.py 的 Basic
    Auth 同一組），不管是本機還是正式站呼叫都要驗證——2026-08-11 稍後拿掉了
    原本「本機請求自動放行」的例外，因為使用者想在本機用一般使用者帳號測試
    這些頁面實際看到/能操作的畫面，「本機=管理者」的假設會讓這種測試失真。
    """
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Basic "):
        try:
            decoded = base64.b64decode(auth[6:].strip()).decode("utf-8")
            user, pwd = decoded.split(":", 1)
            if ADMIN_PASSWORD and secrets.compare_digest(user, ADMIN_USERNAME) and secrets.compare_digest(pwd, ADMIN_PASSWORD):
                return
        except Exception:
            pass
    raise HTTPException(status_code=403, detail="此操作僅限管理者身分執行")

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
    "3081": "聯亞",
    "3105": "穩懋",
    "2455": "全新",
    "3163": "波若威",
    "3363": "上詮",
    "6442": "光聖",
    "3380": "明泰",
    "6830": "汎銓",
    "3587": "閎康",
    "3289": "宜特",
}

TICKERS = ["2330", "2317", "2382", "3231", "6669", "2376", "2356", "2324", "3706", "2357", "2353", "3017", "3324", "2421", "3653", "3338", "8996", "3013", "6117", "3693", "8210", "2059", "2308", "6282", "2345", "2368", "3044", "2313", "3037", "8046", "3189", "2383", "6274", "6213", "3661", "3443", "3035", "6643", "3529", "6531", "2454", "3034", "8299", "5269", "4966", "3711", "2449", "3131", "3583", "6187", "6515", "2360", "3533", "2359", "6414", "2395", "6139", "5443", "2303", "6230",
           # 2026-08-05 新增：矽光子/CPO 光通訊供應鏈補強
           "3081", "3105", "2455", "3163", "3363", "6442", "3380", "6830", "3587", "3289",
           # 2026-08-09 新增：AI硬體供應鏈六大類擴充（晶片設計/晶圓封測/關鍵材料/伺服器/散熱電力/軟體）
           "1503", "1513", "1514", "1519", "1560", "1609", "2301", "2337", "2355", "2385", "2404", "2412", "2436", "2458", "2480", "2492", "3005", "3413", "3532", "4755", "4958", "5388", "5434", "6166", "6183", "6196", "6202", "6206", "6214", "6239", "6257", "6269", "6285", "6412", "6415", "6438", "6533", "6719", "6770", "8081", "8114", "3227", "3374", "3438", "3680", "4979", "4991", "5227", "5347", "5483", "6182", "6223", "6488", "6510", "8050", "8086"]

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

    2026-08-11 修正：這三個巨觀指標過去從未被「同步歷史資料庫」快取過，每次回測都要即時打
    3 支 FinMind API，FinMind 只要逾時/配額用完就整批 fail-open（等於巨觀風控完全沒套用，
    卻不會有任何錯誤訊息提醒），而且同一支腳本兩次執行可能因為 API 當下狀態不同而得到不同
    結果。現在優先讀本地 backtest_database.json 的 macro 欄位（由 /api/backtest/download
    同步寫入），只有本地快取沒涵蓋到查詢範圍時才退回即時抓取；即時抓到的原始數值也會直接
    寫回本地快取，讓下次呼叫不用再重抓。
    """
    db = {}
    if os.path.exists(DB_PATH):
        try:
            with open(DB_PATH, 'r', encoding='utf-8') as f:
                db = json.load(f)
        except Exception:
            db = {}
    macro_cache = db.get("macro", {})

    if macro_cache:
        all_cached_dates = sorted(macro_cache.keys())
        covers_range = all_cached_dates[0] <= start_date and all_cached_dates[-1] >= end_date
        if covers_range:
            result = {}
            for d, row in macro_cache.items():
                if start_date <= d <= end_date:
                    result[d] = strategy_core.evaluate_macro_3in1_status(
                        foreign_spot_buy=row.get("foreign_spot_buy", 0),
                        twd_rate_change_5d=row.get("twd_rate_change_5d", 0),
                        foreign_futures_short=row.get("foreign_futures_short", 0),
                    )
            return result

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
        raw_by_date = {}
        for d in all_dates:
            twd_change_5d = 0.0
            if d in fx_dates:
                idx = fx_dates.index(d)
                if idx >= 5:
                    prev_rate = fx_rate_by_date.get(fx_dates[idx - 5])
                    curr_rate = fx_rate_by_date.get(d)
                    if prev_rate and curr_rate:
                        twd_change_5d = (curr_rate - prev_rate) * 10  # 換算成「角」

            raw_by_date[d] = {
                "foreign_spot_buy": spot_by_date.get(d, 0),
                "twd_rate_change_5d": twd_change_5d,
                "foreign_futures_short": fut_by_date.get(d, 0),
            }
            result[d] = strategy_core.evaluate_macro_3in1_status(**raw_by_date[d])

        if raw_by_date and os.path.exists(DB_PATH):
            try:
                with open(DB_PATH, 'r', encoding='utf-8') as f:
                    fresh_db = json.load(f)
                fresh_db.setdefault("macro", {}).update(raw_by_date)
                with open(DB_PATH, 'w', encoding='utf-8') as f:
                    json.dump(fresh_db, f, ensure_ascii=False)
            except Exception as e:
                print(f"⚠️ 巨觀風控資料寫入本地快取失敗（不影響本次回測結果）: {e}")
    except Exception as e:
        print(f"⚠️ 三合一巨觀風控資料抓取失敗，本次回測不套用風控 (fail-open): {e}")
    return result

OTC_TICKERS = {"3131", "3324", "3529", "3693", "4966", "5443", "6187", "6274", "6643", "8299",
               # 2026-08-05 新增矽光子/CPO 標的中，實測確認為上櫃者
               "3081", "3105", "3163", "3363", "3587", "3289",
               # 2026-08-09 新增AI硬體供應鏈擴充標的中，實測確認為上櫃者
               "3227", "3374", "3438", "3680", "4979", "4991", "5227", "5347", "5483", "6182", "6223", "6488", "6510", "8050", "8086"}

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
    require_admin(request)
    payload = await request.json()
    start_date = payload.get("start_date", "2025-01-01")
    end_date = payload.get("end_date", "2026-12-31")
    force = payload.get("force", False)

    # Load existing DB to support incremental download (斷點續傳)
    db = {"prices": {}, "chips": {}}
    if os.path.exists(DB_PATH):
        try:
            with open(DB_PATH, 'r', encoding='utf-8') as f:
                db = json.load(f)
        except:
            pass

    # 一天最多完整同步一次：籌碼資料是前一天的盤後資料，同一天內不管重點幾次「同步」，
    # 當天不會再有新資料可抓，直接略過整批網路請求，不用每次都花時間逐檔重新確認。
    # 但這個「今天已同步過」的略過邏輯，只在資料庫真的涵蓋全部股票時才成立——如果還缺檔
    # （例如股票池剛擴充、或前一次同步中途被 FinMind 配額擋掉），即使今天已經跑過一次，
    # 也要讓使用者可以繼續點擊補齊，不能被這個旗標卡死（2026-08-10 實測發現的 bug）。
    today_str = datetime.date.today().isoformat()
    is_fully_covered = all(db["prices"].get(t) and db["chips"].get(t) for t in TICKERS)
    if not force and is_fully_covered and db.get("last_full_sync_date") == today_str:
        return {
            "message": f"今天（{today_str}）已經完整同步過一次，資料已是最新的前一天盤後資料，不需要再重新抓取",
            "skipped": True
        }

    try:
        # 1. Bulk Download Yahoo Finance (Adjusted Close)
        # 斷點續傳：只要每一檔都已經有資料涵蓋到接近 end_date，就只補抓「尚未涵蓋的尾端」，
        # 不用每次都把 5 年多的完整歷史全部重抓一遍。只有全新股票（完全沒有快取）才會整段全抓。
        yf_tickers = [get_tw_ticker(t) for t in TICKERS]

        tickers_missing_data = [t for t in TICKERS if not db["prices"].get(t)]
        existing_last_dates = [
            db["prices"][t][-1]["date"] for t in TICKERS
            if db["prices"].get(t) and db["prices"][t][-1]["date"] < end_date
        ]

        if tickers_missing_data:
            # 有股票完全沒有快取（例如新加入的股票），只能整段全抓才安全
            fetch_start = start_date
        elif existing_last_dates:
            # 全部股票都已有資料，只需要補抓「最早落後的那檔」之後的區間即可
            fetch_start = min(existing_last_dates)
        else:
            fetch_start = None  # 全部都已經涵蓋到 end_date，價格資料不用重抓

        if fetch_start and fetch_start <= end_date:
            data = yf.download(yf_tickers, start=fetch_start, end=end_date, group_by='ticker', auto_adjust=True, progress=False)

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
        chip_fetch_failures = []
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
            # 沒帶 token 會被當成匿名請求，配額極低很快就被拒絕（2026-08-09 實測發現：新增56檔
            # 時遇到 "Requests reach the upper limit" 402，全部靜默失敗、chips 完全沒抓到）
            finmind_token = os.getenv("FINMIND_API_TOKEN", "")
            inst_url = f"https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInstitutionalInvestorsBuySell&data_id={t}&start_date={start_date}&end_date={end_date}&token={finmind_token}"
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
                else:
                    print(f"FinMind 籌碼抓取失敗 {t}: {res.get('msg')}")
                    chip_fetch_failures.append(f"{t}（{res.get('msg', '未知錯誤')}）")
            except Exception as e:
                chip_fetch_failures.append(f"{t}（連線錯誤）")

            time.sleep(1.0) # Increased delay to prevent FinMind ban

        # 3. 三合一巨觀風控原始數據（外資期貨淨空單／台幣匯率／外資現貨買賣超）
        # 過去這三個指標從未被存進本地資料庫，每次回測都要即時打 FinMind，逾時或配額用完
        # 就整批 fail-open（風控悄悄沒套用）。這裡比照股價/籌碼的斷點續傳邏輯，涵蓋到查詢
        # 範圍就跳過，不然只補抓缺的部分；只快取原始數值，veto/pos_scale 由呼叫端即時計算，
        # 避免風控判斷邏輯以後調整時，舊快取的計算結果變成過期資料。
        macro_fetch_failure = None
        try:
            existing_macro = db.get("macro", {})
            macro_dates = sorted(existing_macro.keys())
            macro_covered = bool(macro_dates) and macro_dates[0] <= start_date and macro_dates[-1] >= end_date
            if not macro_covered:
                macro_fetch_start = macro_dates[-1] if macro_dates and macro_dates[-1] < end_date else start_date
                finmind_token = os.getenv("FINMIND_API_TOKEN", "")

                fut_url = f"https://api.finmindtrade.com/api/v4/data?dataset=TaiwanFuturesInstitutionalInvestors&data_id=TX&start_date={macro_fetch_start}&end_date={end_date}&token={finmind_token}"
                fut_data = requests.get(fut_url, timeout=20).json().get("data", [])
                fut_by_date = {}
                for row in fut_data:
                    if row.get("institutional_investors") == "外資":
                        fut_by_date[row["date"]] = row.get("short_open_interest_balance_volume", 0) - row.get("long_open_interest_balance_volume", 0)

                fx_url = f"https://api.finmindtrade.com/api/v4/data?dataset=TaiwanExchangeRate&data_id=USD&start_date={macro_fetch_start}&end_date={end_date}&token={finmind_token}"
                fx_data = requests.get(fx_url, timeout=20).json().get("data", [])
                fx_dates = sorted([row["date"] for row in fx_data])
                fx_rate_by_date = {row["date"]: row.get("spot_buy", 0) for row in fx_data}

                inst_url = f"https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockTotalInstitutionalInvestors&start_date={macro_fetch_start}&end_date={end_date}&token={finmind_token}"
                inst_data = requests.get(inst_url, timeout=20).json().get("data", [])
                spot_by_date = {}
                for row in inst_data:
                    if row.get("name") == "Foreign_Investor":
                        spot_by_date[row["date"]] = (row.get("buy", 0) - row.get("sell", 0)) / 1e8

                all_macro_dates = sorted(set(list(fut_by_date.keys()) + fx_dates + list(spot_by_date.keys())))
                if all_macro_dates:
                    db.setdefault("macro", {})
                    for d in all_macro_dates:
                        twd_change_5d = 0.0
                        if d in fx_dates:
                            idx = fx_dates.index(d)
                            if idx >= 5:
                                prev_rate = fx_rate_by_date.get(fx_dates[idx - 5])
                                curr_rate = fx_rate_by_date.get(d)
                                if prev_rate and curr_rate:
                                    twd_change_5d = (curr_rate - prev_rate) * 10
                        db["macro"][d] = {
                            "foreign_spot_buy": spot_by_date.get(d, 0),
                            "twd_rate_change_5d": twd_change_5d,
                            "foreign_futures_short": fut_by_date.get(d, 0),
                        }
                    with open(DB_PATH, 'w', encoding='utf-8') as f:
                        json.dump(db, f, ensure_ascii=False)
        except Exception as e:
            macro_fetch_failure = str(e)
            print(f"⚠️ 巨觀風控資料同步失敗（不影響股價/籌碼同步結果）: {e}")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # 只有這次同步真的把全部股票都補齊了，才標記「今天已完整同步過」；只要還有任何一檔
    # 籌碼抓取失敗（例如 FinMind 配額被擋），就不設這個旗標，讓使用者下次點擊還能繼續重試，
    # 不會被「今天同步過了」卡住（呼應函式開頭的完整度檢查）
    still_incomplete = any(not (db["prices"].get(t) and db["chips"].get(t)) for t in TICKERS)
    if not still_incomplete:
        db["last_full_sync_date"] = today_str
    with open(DB_PATH, 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False)

    if chip_fetch_failures:
        preview = "、".join(chip_fetch_failures[:8])
        more = f" 等共 {len(chip_fetch_failures)} 檔" if len(chip_fetch_failures) > 8 else ""
        msg = f"同步完成，但有籌碼資料抓取失敗：{preview}{more}。常見原因是 FinMind API 配額用完，建議稍後（例如隔天配額重置後）再次點擊同步補齊。"
        if macro_fetch_failure:
            msg += f" 巨觀風控資料同步也失敗（{macro_fetch_failure}），下次同步會自動重試。"
        return {"message": msg}

    if macro_fetch_failure:
        return {"message": f"股價與籌碼同步完成，但巨觀風控資料同步失敗（{macro_fetch_failure}），下次同步會自動重試，這段期間回測仍會照舊即時抓取（可能因此fail-open）。"}

    return {"message": "Data downloaded successfully"}

# ============================================================
# 買入持有回測計算機（獨立於 A/B/C/D 模型之外，純算術，見 STRATEGY_ANALYSIS_NOTES.md
# 「2026-08-07（續2）：規劃「買入持有回測計算機」」章節的完整決策紀錄）
# ============================================================

def load_custom_stock_list():
    """
    買入持有股池是固定名單（使用者跟 Claude 討論後直接編輯 custom_stock_list.txt 決定），
    不提供使用者自行新增/移除的 UI 或 API——使用者只能從這份固定清單中「勾選要測試哪幾檔」。
    """
    if os.path.exists(CUSTOM_LIST_PATH):
        with open(CUSTOM_LIST_PATH, "r", encoding="utf-8") as f:
            return [line.strip() for line in f if line.strip()]
    return []

STOCK_METADATA_PATH = os.path.join(DIR_PATH, "stock_metadata.json")

def load_stock_metadata():
    """ticker -> {name_cn, category, subcategory}，供股池下拉選單分類分組＋顯示中文名稱用。"""
    if os.path.exists(STOCK_METADATA_PATH):
        try:
            with open(STOCK_METADATA_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

@app.get("/api/buyhold/pool")
async def get_buyhold_pool():
    tickers = load_custom_stock_list()
    meta = load_stock_metadata()
    items = [{
        "ticker": t,
        "name_cn": meta.get(t, {}).get("name_cn", t),
        "category": meta.get(t, {}).get("category", "未分類"),
        "subcategory": meta.get(t, {}).get("subcategory", ""),
    } for t in tickers]
    return {"tickers": tickers, "items": items, "count": len(tickers)}

@app.get("/api/buyhold/pool_prices")
async def get_buyhold_pool_prices(start_date: str, end_date: str):
    """
    給股票選單勾選畫面用：一次回傳股池內每一檔在買入日/結算日（或之後最近一個有資料的交易日）
    的價格，讓使用者勾選當下就能看到「買入時股價/賣出時股價」，不用等按下計算才知道。
    """
    tickers = load_custom_stock_list()
    prices = {}
    if not tickers or not os.path.exists(CUSTOM_DB_PATH):
        return {"prices": prices}
    with open(CUSTOM_DB_PATH, 'r', encoding='utf-8') as f:
        db = json.load(f)
    for t in tickers:
        rows = db.get("prices", {}).get(t)
        if not rows:
            continue
        buy_rows = [r for r in rows if r["date"] >= start_date]
        sell_rows = [r for r in rows if r["date"] >= end_date]
        # 找不到「該日之後」的資料時（例如結算日預設抓今天，但今天是週末/假日、資料庫最新
        # 交易日還是上週五），改用資料庫裡最後一筆已知價格頂替，不要直接顯示查無資料
        if not buy_rows and rows:
            buy_rows = [rows[-1]]
        if not sell_rows and rows:
            sell_rows = [rows[-1]]
        prices[t] = {
            "buy_price": buy_rows[0]["close"] if buy_rows else None,
            "buy_date": buy_rows[0]["date"] if buy_rows else None,
            "sell_price": sell_rows[0]["close"] if sell_rows else None,
            "sell_date": sell_rows[0]["date"] if sell_rows else None,
        }
    return {"prices": prices}

@app.get("/api/buyhold/status")
async def get_buyhold_db_status():
    tickers = load_custom_stock_list()
    pool_size = len(tickers)

    if pool_size == 0:
        return {"status": "empty", "last_updated": "無資料", "pool_size": 0, "covered": 0, "missing_tickers": [], "date_start": None, "date_end": None}

    if not os.path.exists(CUSTOM_DB_PATH):
        return {"status": "missing", "last_updated": "無資料", "pool_size": pool_size, "covered": 0, "missing_tickers": tickers, "date_start": None, "date_end": None}

    mod_time = os.path.getmtime(CUSTOM_DB_PATH)
    try:
        with open(CUSTOM_DB_PATH, 'r', encoding='utf-8') as f:
            db = json.load(f)
    except Exception:
        return {"status": "missing", "last_updated": "資料庫檔案損毀", "pool_size": pool_size, "covered": 0, "missing_tickers": tickers, "date_start": None, "date_end": None}

    prices = db.get("prices", {})
    covered = [t for t in tickers if prices.get(t)]
    missing = [t for t in tickers if t not in covered]

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

@app.post("/api/buyhold/sync")
async def sync_buyhold_db(request: Request):
    require_admin(request)
    payload = await request.json()
    force = payload.get("force", False)

    tickers = load_custom_stock_list()
    if not tickers:
        return {"message": "股池目前是空的，請先新增股票再同步", "skipped": True}

    db = {"prices": {}}
    if os.path.exists(CUSTOM_DB_PATH):
        try:
            with open(CUSTOM_DB_PATH, 'r', encoding='utf-8') as f:
                db = json.load(f)
        except Exception:
            pass
    if "prices" not in db:
        db["prices"] = {}

    today_str = datetime.date.today().isoformat()
    if not force and db.get("last_full_sync_date") == today_str:
        return {"message": f"今天（{today_str}）已經完整同步過一次，不需要再重新抓取", "skipped": True}

    synced, failed = [], []
    for t in tickers:
        try:
            existing_rows = db["prices"].get(t, [])
            fetch_start = None
            if existing_rows:
                last_date = existing_rows[-1]["date"]
                next_day = (datetime.date.fromisoformat(last_date) + datetime.timedelta(days=1)).isoformat()
                if next_day > today_str:
                    synced.append(t)
                    continue
                fetch_start = next_day  # 斷點續傳：只補最後一天之後到今天

            hist = None
            # ETF/個股不一定知道是上市(.TW)還是上櫃(.TWO)，兩個都試一次，跟 main.py 的
            # fetch_yfinance_history 用同一套判斷邏輯，不要求使用者自己分類
            for suffix in [".TW", ".TWO"]:
                stock = yf.Ticker(f"{t}{suffix}")
                if fetch_start:
                    h = stock.history(start=fetch_start, auto_adjust=False, actions=True)
                else:
                    h = stock.history(period="max", auto_adjust=False, actions=True)
                if not h.empty:
                    hist = h
                    break

            if hist is None or hist.empty:
                if not existing_rows:
                    failed.append(t)
                else:
                    synced.append(t)  # 已有舊資料，只是今天沒有新的可補，不算失敗
                continue

            hist = hist[hist['Close'].notna()]
            existing = {row["date"]: row for row in existing_rows}
            for date, row in hist.iterrows():
                d_str = date.strftime('%Y-%m-%d')
                existing[d_str] = {
                    "date": d_str,
                    "close": round(float(row['Close']), 4),
                    "dividend": round(float(row['Dividends']), 4) if 'Dividends' in row and not pd.isna(row['Dividends']) else 0.0
                }
            db["prices"][t] = [existing[k] for k in sorted(existing.keys())]
            synced.append(t)
            time.sleep(0.3)
        except Exception as e:
            print(f"買入持有股池同步失敗 {t}:", e)
            failed.append(t)

    db["last_full_sync_date"] = today_str
    with open(CUSTOM_DB_PATH, 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False)

    return {
        "message": f"同步完成：成功 {len(synced)} 檔，失敗 {len(failed)} 檔" + (f"（失敗：{'、'.join(failed)}）" if failed else ""),
        "synced": synced,
        "failed": failed
    }

BUYHOLD_FEE_RATE = 0.001425  # 買賣手續費，跟主系統下單規劃器的假設一致
BUYHOLD_TAX_RATE = 0.003     # 證交稅（賣出時收）

@app.get("/api/buyhold/price_on_date")
async def get_buyhold_price_on_date(ticker: str, date: str):
    """
    給前端「張數/總價」雙向試算欄位用的單一股票牌價查詢：回傳指定股票在指定日期（或之後
    最近一個有資料的交易日）的收盤價，僅供輸入時的即時試算預覽，不是正式的損益計算結果。
    """
    if not os.path.exists(CUSTOM_DB_PATH):
        raise HTTPException(status_code=400, detail="請先同步歷史資料庫")
    with open(CUSTOM_DB_PATH, 'r', encoding='utf-8') as f:
        db = json.load(f)
    prices = db.get("prices", {}).get(ticker)
    if not prices:
        raise HTTPException(status_code=404, detail=f"尚未同步 {ticker} 的歷史資料")
    rows = [r for r in prices if r["date"] >= date]
    if not rows:
        # 找不到「該日之後」的資料（例如選到週末/假日、資料庫最新交易日還沒更新到那麼新），
        # 改用資料庫裡最後一筆已知價格頂替，不要直接回 404
        rows = [prices[-1]] if prices else []
    if not rows:
        raise HTTPException(status_code=404, detail="查無資料")
    row = rows[0]
    return {"ticker": ticker, "date": row["date"], "price": row["close"]}

class BuyHoldRequest(BaseModel):
    tickers: List[str]
    start_date: str
    end_date: str
    shares: float  # 股數（整張換算後的股數，例如 3 張 = 3000 股）

@app.post("/api/buyhold/calculate")
async def calculate_buyhold(req: BuyHoldRequest):
    if not os.path.exists(CUSTOM_DB_PATH):
        raise HTTPException(status_code=400, detail="請先同步歷史資料庫")
    with open(CUSTOM_DB_PATH, 'r', encoding='utf-8') as f:
        db = json.load(f)

    if not req.shares or req.shares <= 0:
        raise HTTPException(status_code=400, detail="請提供有效股數")

    results = []
    for t in req.tickers:
        prices = db.get("prices", {}).get(t)
        if not prices:
            results.append({"ticker": t, "error": "尚未同步此股票的歷史資料，請先在上方同步歷史資料庫"})
            continue

        rows_in_range = [r for r in prices if req.start_date <= r["date"] <= req.end_date]
        if not rows_in_range:
            results.append({"ticker": t, "error": "所選期間內查無資料"})
            continue

        start_row = rows_in_range[0]
        end_row = rows_in_range[-1]
        start_price = start_row["close"]
        end_price = end_row["close"]
        shares = req.shares

        # 手續費/證交稅一律計入，不提供關閉選項——買賣持有的目的就是要看「賣出後真正拿到多少」
        buy_cost = shares * start_price * (1 + BUYHOLD_FEE_RATE)
        end_market_value = shares * end_price * (1 - BUYHOLD_FEE_RATE - BUYHOLD_TAX_RATE)
        total_dividends = round(sum(r.get("dividend", 0) for r in rows_in_range) * shares, 0)

        final_value = end_market_value + total_dividends
        pnl = final_value - buy_cost
        pnl_pct = (pnl / buy_cost * 100) if buy_cost > 0 else 0

        days_held = (datetime.date.fromisoformat(end_row["date"]) - datetime.date.fromisoformat(start_row["date"])).days
        years = days_held / 365.25
        annualized_pct = (((final_value / buy_cost) ** (1 / years)) - 1) * 100 if years > 0 and buy_cost > 0 and final_value > 0 else 0

        results.append({
            "ticker": t,
            "start_date": start_row["date"],
            "end_date": end_row["date"],
            "start_price": start_price,
            "end_price": end_price,
            "shares": round(shares, 0),
            "buy_cost": round(buy_cost, 0),
            "end_market_value": round(end_market_value, 0),
            "total_dividends": total_dividends,
            "final_value": round(final_value, 0),
            "pnl": round(pnl, 0),
            "pnl_pct": round(pnl_pct, 2),
            "annualized_pct": round(annualized_pct, 2),
            "days_held": days_held
        })

    return {"status": "success", "results": results}

class BacktestRequest(BaseModel):
    capital: float
    max_positions: int
    fee_rate: float
    start_date: str
    end_date: str
    max_hold_days: int
    exit_strategy: str
    is_out_of_sample: bool = False
    is_grid_trial: bool = False

@app.post("/api/backtest/run")
async def run_backtest(req: BacktestRequest, request: Request = None):
    # exit_strategy='R'（Regime自動切換，研究版）已知落差：這裡只接上「出場card-line規則
    # 依regime切換」，進場仍跟其他方案一樣是單筆一次到位；研究驗證的692.64%/488.17%用的是
    # 空頭端3:3:4分批進場，這個engine目前對所有方案都沒有分批機制（不是R專屬的缺口），
    # 所以這裡跑出來的R數字會比研究報告的數字保守，兩者不能直接拿來對比。要重現分批效果，
    # 仍需參考 case_studies.html 個案⑤⑦⑧ 對應的 research_data/ CSV 或原始研究腳本。
    # request 只有真的透過 HTTP 呼叫這支 API 時才會有值；被 grid_search/mega_grid
    # 內部直接當一般函式呼叫（不是走 HTTP）時 request 是 None，不需要也不能重複檢查
    if request is not None:
        require_admin(request)
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
            df['Low20'] = df['low'].rolling(20).min()  # strategy='R'（Regime自動切換）防線B用
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

            is_bull_today = None
            if req.exit_strategy == 'R' and not taiex_df.empty and current_date in taiex_df.index:
                t_idx = taiex_df.loc[current_date]
                if not pd.isna(t_idx['MA20']):
                    is_bull_today = t_idx['close'] > t_idx['MA20']

            # 三大法人買賣超要收盤(13:30)後17:00才公布，FinMind更要等隔天凌晨1:30才能查到，
            # 所以current_date「當天」的籌碼資料在current_date收盤當下根本不存在、不可能被真實
            # 交易者拿來下單——這裡改用cdf.iloc[idx-1]（上一個有資料的交易日，等於前一天17:00
            # 已公布、隔天開盤前就已知的資料），避免用未來才會公布的資料做這一天的出場判斷。
            cdf_idx = cdf.index.get_loc(current_date) if current_date in cdf.index else -1
            today_chip = cdf.iloc[cdf_idx - 1].to_dict() if cdf_idx >= 1 else {}

            sell_reason, p = strategy_core.evaluate_exit(
                p, today_price, yesterday_close,
                today_chip,
                req.exit_strategy, req.max_hold_days, current_date,
                is_bull_regime=is_bull_today
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
                
                # 同樣的未來函數問題：current_date當天的法人買賣超要17:00後才公布，這裡買進判斷
                # 用的兩天窗口整批往前移一天（idx-2/idx-1取代idx-1/idx），calculate_chip_score
                # 把list最後一個元素當「今天」，所以最後一筆必須是D-1（已公布、可知），不能是D。
                inst_list = []
                idx = cdf.index.get_loc(current_date) if current_date in cdf.index else -1
                if idx >= 2:
                    inst_list.append(cdf.iloc[idx-2].to_dict())
                if idx >= 1:
                    inst_list.append(cdf.iloc[idx-1].to_dict())

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
                
                supp_at_buy = None
                if req.exit_strategy == 'R':
                    df_buy = prices_df[buy_target['ticker']]
                    if current_date in df_buy.index and not pd.isna(df_buy.loc[current_date]['Low20']):
                        supp_at_buy = float(df_buy.loc[current_date]['Low20'])
                    else:
                        supp_at_buy = buy_target['price'] * 0.9

                portfolio.append({
                    "ticker": buy_target['ticker'],
                    "buy_date": day_str,
                    "buy_price": buy_target['price'],
                    "shares": shares,
                    "highest_price": buy_target['price'],
                    "lowest_price": buy_target['price'],
                    "trailing_stop": buy_target['price'] - (mult * buy_target['atr']),
                    "atr_multiplier": mult,
                    "supp": supp_at_buy,
                    "high": buy_target['price'],
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

    # Tier 3：年化 Sharpe / Sortino——用逐日equity算逐日報酬率，無風險利率簡化為0
    # （台股短期公債殖利率長期偏低，且策略比較主要看相對排序，簡化不影響排序結論）。
    # 逐日equity本來就已經為了算MDD算出來，這裡只是多算兩個統計量，不用額外資料來源。
    sharpe_ratio = 0.0
    sortino_ratio = 0.0
    if len(daily_equity) >= 2:
        equity_series = pd.Series([d['equity'] for d in daily_equity])
        daily_returns = equity_series.pct_change().dropna()
        if len(daily_returns) > 1 and daily_returns.std() > 0:
            sharpe_ratio = round((daily_returns.mean() / daily_returns.std()) * math.sqrt(252), 2)
        downside_returns = daily_returns[daily_returns < 0]
        if len(downside_returns) > 1 and downside_returns.std() > 0:
            sortino_ratio = round((daily_returns.mean() / downside_returns.std()) * math.sqrt(252), 2)

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
        "total_trades": len(trade_history),
        "sharpe_ratio": sharpe_ratio,
        "sortino_ratio": sortino_ratio
    }

    # Save to SQLite DB
    try:
        conn = sqlite3.connect(SQLITE_PATH)
        c = conn.cursor()
        c.execute('''
            INSERT INTO experiments (capital, max_positions, fee_rate, start_date, end_date, max_hold_days, exit_strategy, total_return, cagr, mdd, win_rate, profit_factor, total_trades, is_out_of_sample, is_grid_trial, pool_size, return_2021, return_2022, return_2023, return_2024, return_2025, return_2026, sharpe_ratio, sortino_ratio)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (req.capital, req.max_positions, req.fee_rate, req.start_date, req.end_date, req.max_hold_days, req.exit_strategy, metrics_dict['total_return'], metrics_dict['cagr'], metrics_dict['mdd'], metrics_dict['win_rate'], metrics_dict['profit_factor'], metrics_dict['total_trades'], req.is_out_of_sample, req.is_grid_trial, len(TICKERS), yearly_returns[2021], yearly_returns[2022], yearly_returns[2023], yearly_returns[2024], yearly_returns[2025], yearly_returns[2026], sharpe_ratio, sortino_ratio))
        
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
async def run_bayesian_optimization(req: GridSearchRequest, request: Request):
    require_admin(request)
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
            is_out_of_sample=False,
            # 這 20 次只涵蓋前 70% 訓練期，不是完整區間的正式回測結果，標記起來
            # 讓排行榜與 get_attribution() 的統計平均可以把它們排除，避免污染
            is_grid_trial=True
        )

        try:
            res = await run_backtest(sub_req)
            ret = res["metrics"]["total_return"]
            mdd = res["metrics"]["mdd"]
            score = ret - (mdd * 2)
            study.tell(trial, score)
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
def clear_experiments_db(request: Request):
    require_admin(request)
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
    # is_grid_trial = 1 是「4. AI 網格最佳化」內部只涵蓋前 70% 訓練期的探索性試跑，
    # 不是完整區間的正式回測結果，排行榜不顯示，避免跟正式結果混淆
    c.execute("SELECT * FROM experiments WHERE is_grid_trial = 0 OR is_grid_trial IS NULL ORDER BY total_return DESC")
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

SNAPSHOT_PATH = os.path.join(DIR_PATH, "published_snapshot.json")
SNAPSHOT_CSV_PATH = os.path.join(DIR_PATH, "published_leaderboard.csv")

def _build_leaderboard_csv(experiments: list) -> str:
    """跟前端 exportAnalysisToCSV() 完全同一套欄位格式，只是改在後端組一次，
    直接產生一份真正的試算表檔案，正式站不用另外靠 JS 從 JSON 現組 CSV。"""
    header = "排名,回測開始日期,回測結束日期,策略方案,持股檔數,持倉天數,累積總報酬率(%),年化報酬率CAGR(%),最大回撤MDD(%),勝率(%),獲利因子,總交易次數,2021報酬(%),2022空頭(%),2023主升(%),2024報酬(%),2025報酬(%),2026迄今(%)\n"
    lines = ["﻿" + header]
    for idx, row in enumerate(experiments):
        lines.append(
            f"{idx + 1},\"{row.get('start_date', '2021-01-01')}\",\"{row.get('end_date', '2026-08-01')}\","
            f"\"方案 {row.get('exit_strategy', '')}\",{row.get('max_positions', 0)},{row.get('max_hold_days', 0)},"
            f"{row.get('total_return', 0):.2f},{row.get('cagr', 0):.2f},{row.get('mdd', 0):.2f},"
            f"{row.get('win_rate', 0):.1f},{row.get('profit_factor', 0):.2f},{row.get('total_trades', 0)},"
            f"{row.get('return_2021', 0):.2f},{row.get('return_2022', 0):.2f},{row.get('return_2023', 0):.2f},"
            f"{row.get('return_2024', 0):.2f},{row.get('return_2025', 0):.2f},{row.get('return_2026', 0):.2f}\n"
        )
    return "".join(lines)

@app.post("/api/backtest/publish_snapshot")
async def publish_snapshot(request: Request):
    """
    把本機跑完的排行榜結果打包成一份精簡的靜態快照，寫到專案目錄下的
    published_snapshot.json + published_leaderboard.csv。使用者手動 git commit + push
    之後，Render 正式站（沒有永久硬碟、跑不了長時間回測）就能讀這些靜態檔案來顯示排行榜，
    而不必仰賴正式站自己那個每次重啟就會被清空的資料庫。
    完整的逐筆交易資料庫有數十 MB、697 組實驗、40 萬筆以上交易，太大不可能整包發布
    （GitHub 單檔硬性上限 100MB）；但只發布「報酬率最高那一組」的完整交易明細，資料量
    很小（幾百筆、不到 200KB），值得額外附上，讓正式站的一般使用者至少能看到並下載
    最佳策略的完整交易明細，不用只看排行榜摘要數字。
    """
    require_admin(request)
    status_data = await get_db_status()
    experiments_data = get_experiments()
    attribution_data = get_attribution()
    experiments = experiments_data.get("data", [])

    top_trades = []
    if experiments:
        top_exp_id = experiments[0].get("id")
        if top_exp_id:
            top_trades = get_trades(top_exp_id).get("data", [])
            top_trades.sort(key=lambda t: t.get("buy_date") or "")

    snapshot = {
        "generated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "status": status_data,
        "experiments": experiments,
        "attribution": attribution_data,
        "top_trades": top_trades,
    }

    with open(SNAPSHOT_PATH, 'w', encoding='utf-8') as f:
        json.dump(snapshot, f, ensure_ascii=False)

    csv_content = _build_leaderboard_csv(experiments)
    with open(SNAPSHOT_CSV_PATH, 'w', encoding='utf-8') as f:
        f.write(csv_content)

    json_size_kb = os.path.getsize(SNAPSHOT_PATH) / 1024
    csv_size_kb = os.path.getsize(SNAPSHOT_CSV_PATH) / 1024
    return {
        "status": "success",
        "message": f"已產生快照（{len(experiments)} 筆排行榜結果 + 最佳策略 {len(top_trades)} 筆交易明細）：published_snapshot.json（{json_size_kb:.0f} KB）+ published_leaderboard.csv（{csv_size_kb:.0f} KB），請自行 git commit + push 才會真正發布到正式站",
        "json_size_kb": round(json_size_kb, 1),
        "csv_size_kb": round(csv_size_kb, 1),
        "experiments_count": len(experiments),
        "top_trades_count": len(top_trades),
        "generated_at": snapshot["generated_at"],
    }

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

def get_existing_combos(req: MegaGridRequest) -> set:
    """回傳資料庫中已經跑過、且共用條件（資金/手續費/日期區間/股票池大小）完全相同的 (策略, 持倉, 天數) 組合集合。
    股票池大小也要比對，否則股票池擴充後重跑會被誤判成「已測試過」而略過，導致新股票永遠沒被納入計算。"""
    if not os.path.exists(SQLITE_PATH):
        return set()
    conn = sqlite3.connect(SQLITE_PATH)
    c = conn.cursor()
    c.execute('''
        SELECT exit_strategy, max_positions, max_hold_days FROM experiments
        WHERE capital = ? AND fee_rate = ? AND start_date = ? AND end_date = ? AND is_out_of_sample = 0 AND pool_size = ?
    ''', (req.capital, req.fee_rate, req.start_date, req.end_date, len(TICKERS)))
    rows = c.fetchall()
    conn.close()
    return {(strategy, pos, hd) for strategy, pos, hd in rows}

async def run_mega_grid_task(req: MegaGridRequest, combos: list, skipped_count: int = 0):
    global mega_grid_status
    mega_grid_status["running"] = True
    mega_grid_status["current"] = 0
    mega_grid_status["errors"] = []

    mega_grid_status["total"] = len(combos)
    skip_note = f"（另有 {skipped_count} 組條件相同的組合已有資料，自動略過）" if skipped_count > 0 else ""
    mega_grid_status["message"] = f"開始運算 {len(combos)} 組組合...{skip_note}"

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
    skip_suffix = f"（另有 {skipped_count} 組條件相同的組合已有資料，自動略過）" if skipped_count > 0 else ""
    mega_grid_status["message"] = f"大數據網格運算完成！共成功跑完 {mega_grid_status['current']} 組組合。{skip_suffix}"

@app.post("/api/backtest/mega_grid")
async def start_mega_grid(req: MegaGridRequest, background_tasks: BackgroundTasks, request: Request):
    require_admin(request)
    global mega_grid_status
    if mega_grid_status["running"]:
        raise HTTPException(status_code=400, detail="已有大數據運算正在進行中")

    # 計算本次請求的完整組合，並比對資料庫裡條件完全相同（資金/手續費/日期區間）
    # 且已經跑過的組合，跳過重複測試——除非使用者確實新增了條件（新的持倉數/方案/天數）
    all_combos = []
    for s in req.strategies:
        for p in req.positions:
            for hd in req.hold_days:
                all_combos.append((s, p, hd))

    existing = get_existing_combos(req)
    new_combos = [c for c in all_combos if c not in existing]
    skipped_count = len(all_combos) - len(new_combos)

    if not new_combos:
        return {
            "status": "already_up_to_date",
            "message": f"✅ 這 {len(all_combos)} 組條件（資金/手續費/日期區間/持倉檔數/方案/持倉天數）都已經測試過且結果都在排行榜裡，資料庫已是最新，無需重新執行！"
        }

    background_tasks.add_task(run_mega_grid_task, req, new_combos, skipped_count)
    started_msg = "已在背景啟動巨量大數據網格搜索"
    if skipped_count > 0:
        started_msg += f"（{skipped_count} 組條件相同的組合已有資料自動略過，只新增測試 {len(new_combos)} 組）"
    return {"status": "started", "message": started_msg}

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
        # 排除網格最佳化的訓練期(前 70%)探索性試跑，只用完整區間的正式回測結果算敏感度統計
        df_exp = pd.read_sql_query("SELECT * FROM experiments WHERE is_grid_trial = 0 OR is_grid_trial IS NULL", conn)
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

        # Rule on positions — 動態找出資料裡實際存在的「MDD最低檔數」vs「最少檔數(通常風險最集中)」對照，
        # 不寫死特定兩個檔數(3 vs 5)，避免網格參數改變後這條規則悄悄失效或講錯話
        if not pos_sens == [] and len(df_exp['max_positions'].unique()) >= 2:
            pos_mdds = df_exp.groupby('max_positions')['mdd'].mean()
            min_pos = pos_mdds.index.min()
            best_mdd_pos = pos_mdds.idxmin()
            baseline_mdd = pos_mdds.get(min_pos)
            best_mdd_val = pos_mdds.get(best_mdd_pos)
            if best_mdd_pos != min_pos and baseline_mdd is not None:
                mdd_reduction = round(baseline_mdd - best_mdd_val, 2)
                decisions.append(f"🛡️ <b>資金分散防護力</b>：持倉上限提高到 <b>{best_mdd_pos} 檔</b>時平均最大回撤(MDD)最低，為 {round(best_mdd_val, 2)}%；相較於只持有 {min_pos} 檔（MDD {round(baseline_mdd, 2)}%），<b>風險降低了 {mdd_reduction} 個百分點</b>。建議採用 {best_mdd_pos} 檔左右的配置分散單一標的誤判的衝擊。")

        # Rule on strategies — 2026-08-13重寫：動態找出目前資料庫裡平均報酬最高、MDD最低的方案，
        # 不再寫死比較D跟C（過去這樣寫，方案E補齊資料後就會變成錯誤建議，見 STRATEGY_ANALYSIS_NOTES.md
        # 2026-08-13條目 / case_studies.html 個案⑭）
        if not strat_sens == [] and len(strat_rets := df_exp.groupby('exit_strategy')['total_return'].mean()) >= 2:
            strat_mdds = df_exp.groupby('exit_strategy')['mdd'].mean()
            best_strat = strat_rets.idxmax()
            best_ret = strat_rets.max()
            runner_up = strat_rets.drop(best_strat).idxmax()
            runner_up_ret = strat_rets[runner_up]
            ret_diff = round(best_ret - runner_up_ret, 2)
            defensive_strat = strat_mdds.idxmin()
            defensive_mdd = strat_mdds.min()
            best_mdd = strat_mdds.get(best_strat)
            if defensive_strat == best_strat:
                decisions.append(f"🏆 <b>策略方案抉擇</b>：方案 <b>{best_strat}</b> 的平均總報酬為 {round(best_ret, 2)}%，是目前 {len(strat_rets)} 個已測試方案裡最高的（次高為方案 {runner_up}，{round(runner_up_ret, 2)}%，差幅 {ret_diff}%），且平均MDD（{round(best_mdd, 2)}%）也是所有方案裡最低，<b>報酬與防守雙優，推薦作為真實進出場核心</b>。")
            else:
                decisions.append(f"🏆 <b>策略方案抉擇</b>：方案 <b>{best_strat}</b> 的平均總報酬為 {round(best_ret, 2)}%，是目前 {len(strat_rets)} 個已測試方案裡最高的（次高為方案 {runner_up}，{round(runner_up_ret, 2)}%，差幅 {ret_diff}%）。若優先考慮防守，方案 {defensive_strat} 的平均MDD（{round(defensive_mdd, 2)}%）最低——<b>是報酬與防守之間的取捨，非單一方案全面最優</b>。")

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
