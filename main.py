import secrets
from fastapi import FastAPI, HTTPException, Request, Depends, status
from pydantic import BaseModel
from typing import List, Optional
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import yfinance as yf
from bs4 import BeautifulSoup
import strategy_core
import requests
from datetime import datetime, timedelta
import os
import json
import time
import concurrent.futures

# 管理者帳密與邀請碼一律從環境變數讀取，不在原始碼中寫死任何機密
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "cyc58612")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")  # 未設定則管理者登入路徑一律不通過（安全預設）

USERS_FILE = "registered_users.json"
def load_registered_users():
    if os.path.exists(USERS_FILE):
        try:
            with open(USERS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_registered_users(users):
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(users, f, ensure_ascii=False, indent=4)

def authenticate(request: Request):
    auth = request.headers.get("Authorization")
    if not auth:
        raise HTTPException(status_code=403, detail="Unauthenticated")
    if auth.startswith("Basic "):
        try:
            import base64
            encoded = auth[6:].strip()
            decoded = base64.b64decode(encoded).decode("utf-8")
            user, pwd = decoded.split(":", 1)
            
            if ADMIN_PASSWORD and secrets.compare_digest(user, ADMIN_USERNAME) and secrets.compare_digest(pwd, ADMIN_PASSWORD):
                return ADMIN_USERNAME
            users = load_registered_users()
            if user in users and secrets.compare_digest(users[user], pwd):
                return user
        except Exception:
            pass
    raise HTTPException(status_code=403, detail="Incorrect username or password")

app = FastAPI()

# 引入與集成 AI 獨立回測實驗室 (Backtest Engine Routes) 讓手機與遠端 Render 也能 100% 運算與查看報告
try:
    import backtest_engine
    for route in backtest_engine.app.routes:
        if hasattr(route, "path") and not any(getattr(r, "path", None) == route.path for r in app.routes):
            app.routes.append(route)
    print("✅ 成功集成 backtest_engine 路由至主系統！遠端手機現已支援完整回測！")
except Exception as e:
    print(f"⚠️ 無法集成 backtest_engine 路由: {e}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
# 簡易 In-Memory Cache (TTL: 1小時 = 3600秒)
yf_cache = {}
CACHE_TTL = 3600

# Yahoo Finance 會針對雲端主機 (如 Render) 的 IP 做封鎖/限流，導致 yfinance 直接連線常常抓不到任何資料。
# 用 curl_cffi 偽裝瀏覽器 TLS 指紋連線可大幅改善這個問題（yfinance 官方建議的作法）。
try:
    from curl_cffi import requests as cc_requests
    _yf_session = cc_requests.Session(impersonate="chrome")
except Exception as e:
    print(f"⚠️ curl_cffi 不可用，改用預設連線: {e}")
    _yf_session = None

def fetch_yfinance_history(ticker: str):
    cache_key = ticker
    now = time.time()

    if cache_key in yf_cache:
        cached_hist, timestamp = yf_cache[cache_key]
        if now - timestamp < CACHE_TTL:
            return cached_hist

    # 上櫃股先試 .TWO，上市股先試 .TW，避免併發掃描時每檔上櫃股都要先浪費一次注定失敗的
    # 請求，在高併發下容易連帶拖垮整批請求的成功率 (見 CHANGELOG 2026-08-04)。
    otc_tickers = globals().get("backtest_engine") and getattr(backtest_engine, "OTC_TICKERS", None)
    is_known_otc = bool(otc_tickers) and ticker in otc_tickers
    suffixes = [".TWO", ".TW"] if is_known_otc else [".TW", ".TWO"]

    hist = None
    for suffix in suffixes:
        stock = yf.Ticker(f"{ticker}{suffix}", session=_yf_session)
        hist = stock.history(period="1mo")
        if not hist.empty:
            break

    if not hist.empty:
        yf_cache[cache_key] = (hist, now)
        
    return hist

chip_cache = {}

def fetch_chip_data_from_finmind(ticker):
    cache_key = ticker
    now = time.time()
    if cache_key in chip_cache:
        cached_data, timestamp = chip_cache[cache_key]
        if now - timestamp < CACHE_TTL:
            return cached_data["inst_list"], cached_data["margin_list"], cached_data["is_mock"]

    token = os.getenv("FINMIND_API_TOKEN", "")  # 必須由環境變數提供，不在原始碼中寫死金鑰
    start_date = (datetime.now() - timedelta(days=45)).strftime('%Y-%m-%d')
    
    inst_url = f"https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInstitutionalInvestorsBuySell&data_id={ticker}&start_date={start_date}&token={token}"
    margin_url = f"https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockMarginPurchaseShortSale&data_id={ticker}&start_date={start_date}&token={token}"
    
    inst_list = []
    margin_list = []
    is_mock = False
    
    try:
        inst_res = requests.get(inst_url, timeout=8).json()
        margin_res = requests.get(margin_url, timeout=8).json()
        
        if inst_res.get("msg") == "success":
            inst_dict = {}
            for row in inst_res.get("data", []):
                date = row["date"]
                name = row["name"]
                net = int((row.get("buy", 0) - row.get("sell", 0)) / 1000)
                if date not in inst_dict:
                    inst_dict[date] = {"date": date, "foreign": 0, "trust": 0, "dealer": 0, "total": 0}
                
                if name in ["Foreign_Investor", "Foreign_Dealer_Self"]:
                    inst_dict[date]["foreign"] += net
                elif name == "Investment_Trust":
                    inst_dict[date]["trust"] += net
                elif name in ["Dealer_self", "Dealer_Hedging"]:
                    inst_dict[date]["dealer"] += net
                    
            sorted_dates = sorted(inst_dict.keys())
            for d in sorted_dates:
                item = inst_dict[d]
                item["total"] = item["foreign"] + item["trust"] + item["dealer"]
                inst_list.append(item)
            inst_list = inst_list[-30:]
            
        if margin_res.get("msg") == "success":
            for row in margin_res.get("data", []):
                margin_list.append({
                    "date": row["date"],
                    "margin_bal": row.get("MarginPurchaseTodayBalance", 0),
                    "short_bal": row.get("ShortSaleTodayBalance", 0)
                })
            margin_list = margin_list[-30:]
            
    except Exception as e:
        print("FinMind Error:", e)
        is_mock = True
        
    if not inst_list or not margin_list:
        is_mock = True
        
    if not is_mock:
        chip_cache[cache_key] = ({"inst_list": inst_list, "margin_list": margin_list, "is_mock": is_mock}, now)
        
    return inst_list, margin_list, is_mock

def calc_atr(hist):
    if len(hist) < 14:
        return 0
    
    trs = []
    for i in range(1, len(hist)):
        high = hist['High'].iloc[i]
        low = hist['Low'].iloc[i]
        prev_close = hist['Close'].iloc[i-1]
        
        tr = max(high - low, abs(high - prev_close), abs(low - prev_close))
        trs.append(tr)
        
    if len(trs) < 14:
        return sum(trs) / len(trs) if trs else 0
        
    atr = sum(trs[-14:]) / 14
    return atr

_macro_status_cache = {"date": None, "status": None}

def get_latest_macro_status():
    """
    即時查詢「三合一巨觀風控熔斷保險絲」最新一個交易日的訊號。
    與 backtest_engine.py 共用同一套 strategy_core.evaluate_macro_3in1_status，
    確保回測、下單建議、首頁顯示三處的風控判斷完全一致。失敗時 fail-open。
    同一天內重複呼叫直接吃記憶體快取，避免拖慢首頁「0ms 快取」路徑。
    """
    today_str = datetime.today().strftime('%Y-%m-%d')
    if _macro_status_cache["date"] == today_str and _macro_status_cache["status"] is not None:
        return _macro_status_cache["status"]

    macro_status = {"level": 0, "title": "", "advice": "", "veto_buy": False, "pos_scale": 1.0}
    try:
        lookback_start = (datetime.today() - timedelta(days=15)).strftime('%Y-%m-%d')
        macro_series = backtest_engine.fetch_macro_3in1_series(lookback_start, today_str)
        if macro_series:
            macro_status = macro_series[max(macro_series.keys())]
            _macro_status_cache["date"] = today_str
            _macro_status_cache["status"] = macro_status
    except Exception as e:
        print(f"⚠️ 三合一巨觀風控即時檢查失敗，本次不套用風控 (fail-open): {e}")
    return macro_status


@app.get("/api/stock/{ticker}")
def get_stock_data(ticker: str):
    try:
        # 1. 抓取即時/盤後價格與歷史走勢 (yfinance)
        hist = fetch_yfinance_history(ticker)
        if hist.empty:
            raise ValueError(f"無法抓取 {ticker} 的股價資料")

        latest_close = round(hist['Close'].iloc[-1], 2)
        ma5 = round(hist['Close'].tail(5).mean(), 2) if len(hist) >= 5 else latest_close
        recent_high = round(hist['High'].tail(20).max(), 2) if len(hist) >= 1 else latest_close
        recent_low = round(hist['Low'].tail(20).min(), 2) if len(hist) >= 1 else latest_close
        
        history_dates = [d.strftime("%m-%d") for d in hist.index]
        history_prices = [round(p, 2) for p in hist['Close'].tolist()]

        # 2. 抓取真實籌碼與融資券 (FinMind)
        inst_data, margin_data, is_mock = fetch_chip_data_from_finmind(ticker)
        
        if is_mock:
            # Fallback mock data structure just so frontend doesn't break
            mock_date = datetime.now().strftime("%Y-%m-%d")
            inst_data = [{"date": mock_date, "foreign": 0, "trust": 0, "dealer": 0, "total": 0}]
            margin_data = [{"date": mock_date, "margin_bal": 0, "short_bal": 0}]

        # 3. 計算 ATR 動態防線
        atr = calc_atr(hist)
        volatility_pct = atr / latest_close if latest_close > 0 else 0
        
        stop_loss_pct = 0.08
        take_profit_pct = 0.15
        
        if volatility_pct > 0.05:  # 活潑飆股
            stop_loss_pct = 0.10
            take_profit_pct = 0.20
        elif volatility_pct < 0.025: # 平穩股
            stop_loss_pct = 0.06
            take_profit_pct = 0.10

        return {
            "ticker": ticker,
            "latest_close": latest_close,
            "ma5": ma5,
            "recent_high": recent_high,
            "recent_low": recent_low,
            "history_dates": history_dates,
            "history_prices": history_prices,
            "inst_data": inst_data,
            "margin_data": margin_data,
            "is_mock": is_mock,
            "stop_loss_pct": stop_loss_pct,
            "take_profit_pct": take_profit_pct
        }

    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.get("/api/doc")
def get_documentation():
    doc_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "AI_Trading_Console_Whitepaper_and_Manual.md")
    if os.path.exists(doc_path):
        with open(doc_path, "r", encoding="utf-8") as f:
            return {"status": "success", "content": f.read()}
    return {"status": "error", "message": "白皮書文件未找到"}

DAILY_CACHE_FILE = "daily_scan_cache.json"

def get_daily_scan_cache():
    if os.path.exists(DAILY_CACHE_FILE):
        try:
            with open(DAILY_CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_daily_scan_cache(cache_data):
    try:
        with open(DAILY_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache_data, f, ensure_ascii=False, indent=4)
    except Exception as e:
        print(f"Error saving daily scan cache: {e}")

AI_STOCK_LIST_FILE = "ai_stock_list.txt"

def load_ai_stock_list():
    if os.path.exists(AI_STOCK_LIST_FILE):
        try:
            with open(AI_STOCK_LIST_FILE, "r", encoding="utf-8") as f:
                return [line.strip() for line in f if line.strip()]
        except Exception:
            return []
    return []

def run_scan(tickers):
    """統一掃描核心：/api/scan_all 與下單規劃器都呼叫這裡，確保兩邊資料一致。"""
    # 偵測是否運行於 Render 雲端環境
    IS_RENDER = os.environ.get("RENDER") == "true"

    results = []
    def process_ticker(ticker):
        try:
            # 雲端環境下，降低延遲以防止 Render 30 秒 HTTP 閘道器逾時 (HTTP 502)
            sleep_time = 0.02 if IS_RENDER else 0.3
            time.sleep(sleep_time)

            # 1. Fetch Price
            hist = fetch_yfinance_history(ticker)
            if hist.empty: return None
            # 資料源常常會多一列「今天/昨天」的佔位資料，成交量已經有了但收盤價還沒回填
            # 完成（NaN）。直接用 .iloc[-1] 會拿到這個 NaN，不但害後面算出來的 MA/動能全部
            # 髒掉，NaN 更沒辦法被 JSON 序列化，會讓整個 /api/scan_all 回應直接 500 壞掉。
            # 過濾掉收盤價還沒回填的列，一律以「最新一筆有完整收盤價」的交易日為準。
            hist = hist[hist['Close'].notna()]
            if hist.empty: return None
            latest_close = round(hist['Close'].iloc[-1], 2)
            ma5 = round(hist['Close'].tail(5).mean(), 2) if len(hist) >= 5 else latest_close
            ma20 = round(hist['Close'].tail(20).mean(), 2) if len(hist) >= 20 else latest_close
            vol_today = hist['Volume'].iloc[-1]
            vol_ma5 = hist['Volume'].tail(5).mean()

            # 2. Fetch Chips (冷啟動/併發下偶爾逾時，失敗時重試一次再放棄)
            inst_data, margin_data, is_mock = fetch_chip_data_from_finmind(ticker)
            if is_mock or not inst_data:
                time.sleep(1.0)
                inst_data, margin_data, is_mock = fetch_chip_data_from_finmind(ticker)

            # 如果無法取得真實籌碼 (被鎖或 API 壞掉)，直接丟棄該股票，拒絕給假資料
            if is_mock or not inst_data:
                return None

            # 3. Calculate Chip Score (using unified strategy_core)
            chip_score, signal_text = strategy_core.calculate_chip_score(latest_close, ma5, inst_data)

            momentum = round((latest_close - ma20) / ma20, 4) if ma20 > 0 else 0
            vol_ratio = round(vol_today / vol_ma5, 2) if vol_ma5 > 0 else 0

            return {
                "ticker": ticker, "latest_close": latest_close, "ma20": ma20, "ma5": ma5,
                "momentum": momentum, "vol_ratio": vol_ratio,
                "chip_score": chip_score, "signal": signal_text,
                "last_foreign": inst_data[-1]['foreign'] if inst_data else 0,
                "last_trust": inst_data[-1]['trust'] if inst_data else 0,
            }
        except Exception as e:
            print(f"Error scanning {ticker}: {e}")
            return None

    # 雲端環境下，將併發線程數由 2 提升至 8 進行加速
    max_w = 8 if IS_RENDER else 2
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_w) as executor:
        futures = [executor.submit(process_ticker, t) for t in tickers]
        for future in concurrent.futures.as_completed(futures):
            res = future.result()
            if res: results.append(res)

    results.sort(key=lambda x: (x['chip_score'], x['momentum']), reverse=True)
    return results

@app.post("/api/scan_all")
async def scan_all_stocks(request: Request):
    try:
        payload = await request.json()
        tickers = payload.get("tickers", [])
        force_refresh = payload.get("force_refresh", False)
        if not tickers:
            return {"data": []}

        today_str = datetime.today().strftime('%Y-%m-%d')
        cache_db = get_daily_scan_cache()
        macro_status = get_latest_macro_status()
        canonical_pool = set(load_ai_stock_list())
        pool_size = len(canonical_pool) or len(tickers)

        # 當日快取邏輯：若非強制重新刷洗且今日數據已存在，直接 0ms 超高速回傳！
        if not force_refresh and today_str in cache_db and cache_db[today_str]:
            print(f"⚡ [0ms 本地防護] 秒速載入當日 ({today_str}) 盤後保存數據，免除線上連線！")
            return {"data": cache_db[today_str], "cached": True, "cache_date": today_str, "macro_status": macro_status, "pool_size": pool_size}

        results = run_scan(tickers)

        # 只有涵蓋完整股池的正式掃描才准許覆寫「今日快取」，避免局部/測試用的少量
        # ticker 請求把全市場快取洗成只剩幾檔，害市況判斷（health_ratio）算出離譜結果。
        is_full_pool_scan = bool(canonical_pool) and len(set(tickers) & canonical_pool) >= len(canonical_pool) * 0.8

        if results and is_full_pool_scan:
            # 跟今天既有的快取「合併」而不是整批覆蓋：同一檔以這次新結果為準，
            # 但這次沒抓到、之前抓到過的檔位保留下來，讓使用者多按幾次掃描就能
            # 逐漸把當天的完整度補滿，而不是每次都從零開始、隨機漏掉不同的股票。
            merged = {s['ticker']: s for s in cache_db.get(today_str, [])}
            for r in results:
                merged[r['ticker']] = r
            results = list(merged.values())

            cache_db[today_str] = results
            save_daily_scan_cache(cache_db)
            try:
                with open("latest_scan_results.json", "w", encoding="utf-8") as f:
                    json.dump(results, f, ensure_ascii=False, indent=4)
            except Exception as e:
                print("Error saving latest_scan_results.json:", e)
            return {"data": results, "cached": False, "cache_date": today_str, "macro_status": macro_status, "pool_size": pool_size}

        if not results and tickers:
            # 當當日線上連線失敗，自動回溯最近一次可用的盤後快取
            if cache_db:
                latest_date = sorted(cache_db.keys())[-1]
                return {"data": cache_db[latest_date], "cached": True, "cache_date": latest_date, "fallback": True, "macro_status": macro_status, "pool_size": pool_size}
            if os.path.exists("latest_scan_results.json"):
                try:
                    with open("latest_scan_results.json", "r", encoding="utf-8") as f:
                        cached_results = json.load(f)
                    return {"data": cached_results, "cached": True, "fallback": True, "macro_status": macro_status, "pool_size": pool_size}
                except Exception:
                    pass
            raise HTTPException(status_code=500, detail="Yahoo Finance / FinMind 伺服器拒絕連線，且無本地備份資料。")

        return {"data": results, "cached": False, "macro_status": macro_status, "pool_size": pool_size}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/admin/daily_auto_scan")
async def daily_auto_scan(user: str = Depends(authenticate)):
    """
    每日盤後自動巡邏：跑一次全股池掃描（沿用 /api/scan_all 同一套 run_scan +
    當日快取合併邏輯），並順便把所有使用者庫存中「持有中」股票的最新收盤價
    寫回去，這樣不管使用者什麼時候打開下單執行中心，看到的停損/加碼判斷都是
    當天盤後的資料，不必依賴「使用者今天有沒有先手動開首頁掃描過」。
    僅限管理者觸發（供外部排程如 GitHub Actions 呼叫），避免被公開濫用。
    """
    if user != ADMIN_USERNAME:
        raise HTTPException(status_code=403, detail="僅限管理者觸發每日自動巡邏")

    tickers = load_ai_stock_list()
    if not tickers:
        raise HTTPException(status_code=500, detail="找不到 ai_stock_list.txt 股池清單")

    results = run_scan(tickers)
    today_str = datetime.today().strftime('%Y-%m-%d')
    cache_db = get_daily_scan_cache()
    merged = {s['ticker']: s for s in cache_db.get(today_str, [])}
    for r in results:
        merged[r['ticker']] = r
    final_results = list(merged.values())

    cache_db[today_str] = final_results
    save_daily_scan_cache(cache_db)
    try:
        with open("latest_scan_results.json", "w", encoding="utf-8") as f:
            json.dump(final_results, f, ensure_ascii=False, indent=4)
    except Exception as e:
        print("Error saving latest_scan_results.json:", e)

    # 更新所有使用者（管理者 + 所有邀請碼註冊帳號）庫存裡持有中股票的最新價
    scan_by_ticker = {s['ticker']: s for s in final_results}
    all_usernames = [ADMIN_USERNAME] + list(load_registered_users().keys())
    portfolios_updated = 0
    for uname in all_usernames:
        pf = get_user_portfolio_file(uname)
        if not os.path.exists(pf):
            continue
        try:
            with open(pf, "r", encoding="utf-8") as f:
                portfolio = json.load(f)
        except Exception:
            continue

        changed = False
        for p in portfolio:
            sd = scan_by_ticker.get(p.get('ticker'))
            if not sd:
                continue
            latest_close = sd['latest_close']
            p['closePrice'] = latest_close
            if p.get('type') == 'short':
                p['high'] = min(p.get('high') or latest_close, latest_close)
            else:
                p['high'] = max(p.get('high') or 0, latest_close)
            changed = True

        if changed:
            try:
                with open(pf, "w", encoding="utf-8") as f:
                    json.dump(portfolio, f, ensure_ascii=False, indent=4)
                portfolios_updated += 1
            except Exception as e:
                print(f"Error updating portfolio for {uname}:", e)

    return {
        "status": "success",
        "scanned": len(final_results),
        "pool_size": len(tickers),
        "portfolios_updated": portfolios_updated,
        "macro_status": get_latest_macro_status()
    }

# 註冊與登入 API
class RegisterRequest(BaseModel):
    invite_code: str
    username: str
    password: str

@app.post("/api/register")
def register_user(req: RegisterRequest):
    valid_code = os.getenv("INVITATION_CODE")  # 必須由環境變數提供，不在原始碼中寫死邀請碼
    if not valid_code or not req.invite_code or req.invite_code.strip() != valid_code:
        raise HTTPException(status_code=400, detail="專屬邀請碼錯誤，請向管理者索取！")
    uname = req.username.strip() if req.username else ""
    pwd = req.password.strip() if req.password else ""
    if len(uname) < 3:
        raise HTTPException(status_code=400, detail="帳號名稱至少需要包含 3 個字元！")
    if len(pwd) < 4:
        raise HTTPException(status_code=400, detail="密碼至少需要包含 4 個字元！")
        
    users = load_registered_users()
    if uname in users or uname == ADMIN_USERNAME:
        raise HTTPException(status_code=400, detail="此帳號名稱已被註冊，請換一個！")
        
    users[uname] = pwd
    save_registered_users(users)
    return {"status": "success", "message": "註冊成功！請使用新帳密登入。", "username": uname}

class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/api/login")
def login_user(req: LoginRequest):
    uname = req.username.strip() if req.username else ""
    pwd = req.password.strip() if req.password else ""
    if ADMIN_PASSWORD and secrets.compare_digest(uname, ADMIN_USERNAME) and secrets.compare_digest(pwd, ADMIN_PASSWORD):
        return {"status": "success", "username": ADMIN_USERNAME}
    users = load_registered_users()
    if uname in users and secrets.compare_digest(users[uname], pwd):
        return {"status": "success", "username": uname}
    raise HTTPException(status_code=401, detail="帳號或密碼錯誤！")

def get_user_portfolio_file(username: str) -> str:
    if not username or username in [ADMIN_USERNAME, "admin", "default", "undefined"]:
        return "portfolio.json"
    return f"portfolio_{username}.json"

def get_user_history_file(username: str) -> str:
    if not username or username in [ADMIN_USERNAME, "admin", "default", "undefined"]:
        return "history.json"
    return f"history_{username}.json"

# 庫存持久化儲存 API (多用戶隔離與全域備援)
@app.get("/api/portfolio")
def get_portfolio(user: str = Depends(authenticate)):
    pfile = get_user_portfolio_file(user)
    if os.path.exists(pfile):
        try:
            with open(pfile, "r", encoding="utf-8") as f:
                data = json.load(f)
                if data and isinstance(data, list) and len(data) > 0:
                    return data
        except Exception:
            pass
    # Fallback to main portfolio.json
    if os.path.exists("portfolio.json"):
        try:
            with open("portfolio.json", "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

@app.post("/api/portfolio")
async def save_portfolio(request: Request, user: str = Depends(authenticate)):
    try:
        pfile = get_user_portfolio_file(user)
        data = await request.json()
        with open(pfile, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
        if pfile != "portfolio.json":
            with open("portfolio.json", "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=4)
        return {"msg": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 歷史交易庫房 API (多用戶隔離與全域備援)
@app.get("/api/history")
def get_history(user: str = Depends(authenticate)):
    hfile = get_user_history_file(user)
    if os.path.exists(hfile):
        try:
            with open(hfile, "r", encoding="utf-8") as f:
                data = json.load(f)
                if data and isinstance(data, list) and len(data) > 0:
                    return data
        except Exception:
            pass
    # Fallback to main history.json
    if os.path.exists("history.json"):
        try:
            with open("history.json", "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

@app.post("/api/history")
async def save_history(request: Request, user: str = Depends(authenticate)):
    try:
        hfile = get_user_history_file(user)
        data = await request.json()
        with open(hfile, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
        if hfile != "history.json":
            with open("history.json", "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=4)
        return {"msg": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class CommitOrder(BaseModel):
    ticker: str
    name: str
    price: float
    shares: float  # in units of '張' (e.g. 1.25張 = 1250股)
    type: str  # 'buy' or 'sell'
    reason: str = ""

class CommitRequest(BaseModel):
    orders: List[CommitOrder]

@app.get("/api/planner/recommendations")
def get_planner_recommendations(cash: float = 100.0, user: str = Depends(authenticate)):
    cash_twd = cash * 10000.0
    username = user
    portfolio_file = get_user_portfolio_file(username)
    
    portfolio = []
    if os.path.exists(portfolio_file):
        try:
            with open(portfolio_file, "r", encoding="utf-8") as f:
                portfolio = json.load(f)
        except Exception:
            portfolio = []
            
    # Check Exits (Sells)
    sells = []
    for p in portfolio:
        ticker = p.get('ticker')
        name = p.get('name')
        shares = p.get('shares', 0)
        buy_price = p.get('buy_price', p.get('cost', 0))
        close_price = p.get('closePrice', buy_price)
        
        reason = ""
        if p.get('trailing_stop') and close_price < p['trailing_stop']:
            reason = "觸發停損"
            
        buy_date_str = p.get('buy_date', datetime.today().strftime('%Y-%m-%d'))
        try:
            days_held = (datetime.today() - datetime.strptime(buy_date_str, '%Y-%m-%d')).days
        except Exception:
            days_held = 0
        if days_held >= 30:
            reason = "時間到期"
            
        if reason:
            pnl_pct = ((close_price - buy_price) / buy_price * 100) if buy_price else 0
            sells.append({
                "ticker": ticker,
                "name": name,
                "shares": shares,
                "reason": reason,
                "price": close_price,
                "buy_price": buy_price,
                "pnl_pct": round(pnl_pct, 2)
            })

    # Read latest scan results - must be TODAY's data so this page never silently disagrees
    # with what index.html shows. Render's free tier has no persistent disk, so daily_scan_cache.json
    # can be reset to a stale git-committed snapshot on every restart; when that happens, run a
    # fresh live scan ourselves instead of serving/mixing stale data.
    scan_results = []
    scan_warning = ""
    today_str = datetime.today().strftime('%Y-%m-%d')
    cache_db = get_daily_scan_cache()
    if cache_db and today_str in cache_db and cache_db[today_str]:
        scan_results = cache_db[today_str]
    else:
        tickers = load_ai_stock_list()
        if tickers:
            scan_results = run_scan(tickers)
            if scan_results:
                cache_db[today_str] = scan_results
                save_daily_scan_cache(cache_db)
                try:
                    with open("latest_scan_results.json", "w", encoding="utf-8") as f:
                        json.dump(scan_results, f, ensure_ascii=False, indent=4)
                except Exception as e:
                    print("Error saving latest_scan_results.json:", e)
        if not scan_results:
            # Live scan failed too (e.g. network outage) - fall back to the last known-good
            # results, but be explicit that it isn't current.
            if os.path.exists("latest_scan_results.json"):
                try:
                    with open("latest_scan_results.json", "r", encoding="utf-8") as f:
                        scan_results = json.load(f)
                    scan_warning = "⚠️ 即時掃描失敗，目前顯示的是先前保存的掃描結果，非今日最新資料。"
                except Exception:
                    scan_warning = "無法讀取最新掃描檔案，請於主頁重新掃描。"
            else:
                scan_warning = "⚠️ 尚未發現今日掃描快取，且即時掃描失敗。請稍後再試，或先返回『實戰控制台』按下『啟動 AI 深度掃描』。"

    # Calculate health ratio & market status
    valid_stocks = len(scan_results)
    above_20ma = sum(1 for item in scan_results if item.get('momentum', 0) > 0)
    health_ratio = (above_20ma / valid_stocks) * 100.0 if valid_stocks > 0 else 50.0
    
    market_status = "穩定多頭"
    market_advice = "全面進攻，採等權重分配買滿排名前三標的。"
    market_color = "#ef4444" # Red
    
    if health_ratio > 75:
        market_status = "高檔震盪 / 末升段"
        market_advice = "市場過熱，隨時拉回，嚴格鎖利，當心拉積盤出貨。"
        market_color = "#f97316"
    elif 45 <= health_ratio <= 75:
        market_status = "穩定多頭"
        market_advice = "全面進攻，採等權重分配買滿排名前三標的。"
        market_color = "#ef4444"
    elif 25 <= health_ratio < 45:
        market_status = "破底翻 / 築底期"
        market_advice = "多頭初醒，可小額試單前三名黑馬，分批佈局。"
        market_color = "#f59e0b"
    elif 10 <= health_ratio < 25:
        market_status = "無差別股災"
        market_advice = "覆巢之下無完卵，空手觀望，保留現金。"
        market_color = "#10b981" # Green
    else:
        market_status = "極度恐慌 / 融資斷頭期"
        market_advice = "乖離過大，隨時有暴力反彈 (V轉)，準備搶短。"
        market_color = "#059669"

    # 三合一巨觀風控熔斷保險絲：即時檢查最新一個交易日的訊號，否決/減碼新建倉
    macro_status = get_latest_macro_status()
    macro_warning = ""

    if macro_status.get("veto_buy"):
        macro_warning = f"{macro_status.get('title', '')}：{macro_status.get('advice', '')}"
        # 巨觀風控熔斷時，市況文字必須跟著改口，避免「文字全面進攻、清單卻是空的」這種自相矛盾的畫面
        market_status = f"🚨 巨觀風控熔斷中 (原廣度判斷：{market_status} {health_ratio:.1f}%)"
        market_advice = f"{macro_status.get('advice', '')} 即使個股籌碼面偏多，本輪一律不建議新建倉，靜待風控解除。"
        market_color = "#059669"  # 沿用系統「保留現金／觀望」的綠色語意，不是新配色
    elif macro_status.get("pos_scale", 1.0) < 1.0:
        cash_twd = cash_twd * macro_status.get("pos_scale", 1.0)
        macro_warning = f"{macro_status.get('title', '')}：{macro_status.get('advice', '')}"
        market_status = f"⚠️ {market_status}（巨觀風控減碼中）"
        market_advice = f"{macro_status.get('advice', '')} 原廣度判斷建議：「{market_advice}」，但本輪可用資金已依風控砍半。"
        market_color = "#f59e0b"  # 沿用系統「築底觀望」的黃橘語意

    # 2-Stage Pyramiding & Risk Parity Protection Selection Logic
    potential_buys = []
    portfolio_dict = {p.get('ticker'): p for p in portfolio if p.get('ticker')}
    
    scan_results.sort(key=lambda x: (x.get('chip_score', 0), x.get('momentum', 0)), reverse=True)

    for item in (scan_results if not macro_status.get("veto_buy") else []):
        t = item['ticker']
        chip_score = item.get('chip_score', 0)

        if chip_score < 1:
            continue
            
        held_item = portfolio_dict.get(t)
        if held_item:
            # Check current stage (1 = 30%, 2 = 60%, 3 = 100% full allocation)
            current_stage = held_item.get('stage_num', 1)
            if isinstance(current_stage, str):
                if '30%' in current_stage or '1' in current_stage: current_stage = 1
                elif '60%' in current_stage or '2' in current_stage: current_stage = 2
                elif '100%' in current_stage or '3' in current_stage: current_stage = 3
                else: current_stage = 1
                
            if current_stage < 3:
                # 【情況 A】：尚未買滿！允許順勢右側加碼 Stage 2 (30%) 或 Stage 3 (40%)！
                next_stage_num = current_stage + 1
                next_stage_label = "加碼 30%" if next_stage_num == 2 else "滿額 40%"
                potential_buys.append({
                    "ticker": t,
                    "name": item.get('name', t),
                    "price": item.get('latest_close'),
                    "score": chip_score,
                    "signal": f"右側順勢加碼 (第 {next_stage_num} 階段)",
                    "stage": f"第 {next_stage_num} 批 {next_stage_label}",
                    "stage_num": next_stage_num
                })
            else:
                # 【情況 B】：已經買滿 (Stage 3 滿額)！觸發 Risk Parity 避險機制，自動跳過，留資金給新黑馬！
                continue
        else:
            # 【情況 C】：尚未持有的全新黑馬標的 ➔ 建倉第 1 階段試探盤 (30%)
            potential_buys.append({
                "ticker": t,
                "name": item.get('name', t),
                "price": item.get('latest_close'),
                "score": chip_score,
                "signal": item.get('signal', 'S1 止跌/右側試探盤'),
                "stage": "首批 30%",
                "stage_num": 1
            })
            
    # Apply Budget Filter: Divide cash dynamically among top recommendations (up to 5 stocks)
    num_targets = max(1, min(len(potential_buys), 5))
    alloc_per_stock = cash_twd / float(num_targets)
    
    buys = []
    filtered_buys = []
    current_used_cash = 0.0
    
    for b in potential_buys:
        price = b['price']
        needed_cost = alloc_per_stock
        shares_twd = needed_cost / (price * 1.0015)
        shares_zhang = round(shares_twd / 1000.0, 3) # e.g. 1.250張 = 1250股
        
        if current_used_cash + needed_cost <= cash_twd:
            buys.append({
                "ticker": b['ticker'],
                "name": b['name'],
                "price": price,
                "shares": shares_zhang,
                "cost": needed_cost,
                "score": b['score'],
                "stage": b['stage'],
                "stage_num": b.get('stage_num', 1)
            })
            current_used_cash += needed_cost
        else:
            filtered_buys.append({
                "ticker": b['ticker'],
                "name": b['name'],
                "price": price,
                "shares": shares_zhang,
                "cost": needed_cost,
                "score": b['score'],
                "stage": b['stage'],
                "stage_num": b.get('stage_num', 1)
            })
            
    today = datetime.today()
    target_day = today + timedelta(days=1)
    if today.weekday() == 4:
        target_day = today + timedelta(days=3)
    elif today.weekday() == 5:
        target_day = today + timedelta(days=2)
        
    target_day_str = target_day.strftime('%Y-%m-%d')
    
    return {
        "status": "success",
        "target_day": target_day_str,
        "market_status": market_status,
        "market_advice": market_advice,
        "market_color": market_color,
        "health_ratio": health_ratio,
        "buys": buys,
        "sells": sells,
        "filtered_buys": filtered_buys,
        "warning": (scan_warning + "<br>" + macro_warning) if (scan_warning and macro_warning) else (scan_warning or macro_warning)
    }

@app.post("/api/planner/commit")
async def commit_planner_orders(req: CommitRequest, user: str = Depends(authenticate)):
    username = user
    portfolio_file = get_user_portfolio_file(username)
    history_file = get_user_history_file(username)

    portfolio = []
    if os.path.exists(portfolio_file):
        try:
            with open(portfolio_file, "r", encoding="utf-8") as f:
                portfolio = json.load(f)
        except Exception:
            portfolio = []

    history = []
    if os.path.exists(history_file):
        try:
            with open(history_file, "r", encoding="utf-8") as f:
                history = json.load(f)
        except Exception:
            history = []

    today_str = datetime.today().strftime('%Y-%m-%d')

    for o in req.orders:
        if o.type == 'buy':
            exists = next((item for item in portfolio if item['ticker'] == o.ticker), None)
            if exists:
                old_shares = exists.get('shares', 0)
                old_cost = exists.get('cost', exists.get('closePrice', 0))
                total_shares = old_shares + o.shares
                if total_shares > 0:
                    exists['cost'] = ((old_cost * old_shares) + (o.price * o.shares)) / total_shares
                exists['shares'] = total_shares
                exists['closePrice'] = o.price
                exists['high'] = max(exists.get('high', o.price), o.price)
            else:
                atr_val = o.price * 0.04
                mult = 2.2
                trailing_stop = o.price - (mult * atr_val)
                
                new_item = {
                    "name": o.name,
                    "ticker": o.ticker,
                    "closePrice": o.price,
                    "cost": o.price,
                    "shares": o.shares,
                    "supp": o.price * 0.95,
                    "high": o.price,
                    "sigClass": "sig-right",
                    "signal": "AI 實戰建倉",
                    "type": "long",
                    "inst_data": [],
                    "margin_data": [],
                    "history_dates": [],
                    "history_prices": [],
                    "is_mock": False,
                    "reason": "",
                    "journal": "",
                    "buy_date": today_str,
                    "trailing_stop": trailing_stop,
                    "atr_multiplier": mult
                }
                portfolio.append(new_item)
            
            # Log transaction in history journal for history.html
            history.append({
                "name": o.name,
                "ticker": o.ticker,
                "cost": o.price,
                "closePrice": o.price,
                "exitPrice": o.price,
                "shares": o.shares,
                "buy_date": today_str,
                "exitDate": today_str,
                "outcome": o.reason or "買進建倉",
                "signal": "AI 實戰建倉",
                "type": "buy"
            })
        elif o.type == 'sell':
            exists = next((item for item in portfolio if item['ticker'] == o.ticker), None)
            if exists:
                portfolio = [item for item in portfolio if item['ticker'] != o.ticker]
                history.append({
                    **exists,
                    "exitPrice": o.price,
                    "exitDate": today_str,
                    "outcome": o.reason or "平倉賣出"
                })
            else:
                history.append({
                    "name": o.name,
                    "ticker": o.ticker,
                    "cost": o.price,
                    "closePrice": o.price,
                    "exitPrice": o.price,
                    "shares": o.shares,
                    "buy_date": today_str,
                    "exitDate": today_str,
                    "outcome": o.reason or "手動平倉賣出",
                    "signal": "AI 實戰出場",
                    "type": "sell"
                })

    try:
        with open(portfolio_file, "w", encoding="utf-8") as f:
            json.dump(portfolio, f, ensure_ascii=False, indent=4)
        if portfolio_file != "portfolio.json":
            with open("portfolio.json", "w", encoding="utf-8") as f:
                json.dump(portfolio, f, ensure_ascii=False, indent=4)
                
        with open(history_file, "w", encoding="utf-8") as f:
            json.dump(history, f, ensure_ascii=False, indent=4)
        if history_file != "history.json":
            with open("history.json", "w", encoding="utf-8") as f:
                json.dump(history, f, ensure_ascii=False, indent=4)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"儲存記帳失敗: {str(e)}")

    return {"status": "success", "message": f"成功寫入 {len(req.orders)} 筆下單交易至【現役持倉】與【歷史庫房】！"}

# 掛載靜態網頁與外部檔案 (提供開放網頁載入，由前端 UI 跳出邀請碼開戶 Modal)
@app.get("/{filename}")
def serve_static(filename: str):
    if os.path.exists(filename) and filename in ["index.html", "style.css", "app.js", "history.html", "history.js", "order_planner.html", "order_planner.js", "backtest.html", "backtest.js", "doc.html", "analysis.html"]:
        headers = {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
        return FileResponse(filename, headers=headers)
    if filename == "favicon.ico":
        raise HTTPException(status_code=404)
    # Default route for everything else that is not found
    raise HTTPException(status_code=404)

@app.get("/")
def read_index():
    if os.path.exists("index.html"):
        headers = {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
        return FileResponse("index.html", headers=headers)
    return {"message": "index.html 檔案未找到"}
