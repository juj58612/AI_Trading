import secrets
from fastapi import FastAPI, HTTPException, Request, Depends, status
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

security = HTTPBasic()

def authenticate(credentials: HTTPBasicCredentials = Depends(security)):
    correct_username = secrets.compare_digest(credentials.username, "cyc58612")
    correct_password = secrets.compare_digest(credentials.password, "***REMOVED_LEAKED_PASSWORD***")
    if not (correct_username and correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
# 簡易 In-Memory Cache (TTL: 1小時 = 3600秒)
yf_cache = {}
CACHE_TTL = 3600

def fetch_yfinance_history(ticker: str):
    cache_key = ticker
    now = time.time()
    
    if cache_key in yf_cache:
        cached_hist, timestamp = yf_cache[cache_key]
        if now - timestamp < CACHE_TTL:
            return cached_hist

    stock = yf.Ticker(f"{ticker}.TW")
    hist = stock.history(period="1mo")
    if hist.empty:
        stock = yf.Ticker(f"{ticker}.TWO")
        hist = stock.history(period="1mo")
        
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

    token = "***REMOVED_LEAKED_FINMIND_TOKEN***"
    start_date = (datetime.now() - timedelta(days=45)).strftime('%Y-%m-%d')
    
    inst_url = f"https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInstitutionalInvestorsBuySell&data_id={ticker}&start_date={start_date}&token={token}"
    margin_url = f"https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockMarginPurchaseShortSale&data_id={ticker}&start_date={start_date}&token={token}"
    
    inst_list = []
    margin_list = []
    is_mock = False
    
    try:
        inst_res = requests.get(inst_url, timeout=5).json()
        margin_res = requests.get(margin_url, timeout=5).json()
        
        if inst_res.get("msg") == "success":
            inst_dict = {}
            for row in inst_res.get("data", []):
                date = row["date"]
                name = row["name"]
                net = (row.get("buy", 0) - row.get("sell", 0)) // 1000
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

@app.post("/api/scan_all")
async def scan_all_stocks(request: Request):
    try:
        payload = await request.json()
        tickers = payload.get("tickers", [])
        if not tickers:
            return {"data": []}
            
        results = []
        def process_ticker(ticker):
            try:
                # 降速掃描，避免觸發 Yahoo Finance 防爬蟲封鎖
                time.sleep(0.3)
                
                # 1. Fetch Price
                hist = fetch_yfinance_history(ticker)
                if hist.empty: return None
                latest_close = round(hist['Close'].iloc[-1], 2)
                ma5 = round(hist['Close'].tail(5).mean(), 2) if len(hist) >= 5 else latest_close
                ma20 = round(hist['Close'].tail(20).mean(), 2) if len(hist) >= 20 else latest_close
                vol_today = hist['Volume'].iloc[-1]
                vol_ma5 = hist['Volume'].tail(5).mean()
                
                # 2. Fetch Chips
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
                
        # 降速掃描，限制 workers 數量為 2
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(process_ticker, t) for t in tickers]
            for future in concurrent.futures.as_completed(futures):
                res = future.result()
                if res: results.append(res)
                
        results.sort(key=lambda x: (x['chip_score'], x['momentum']), reverse=True)
        
        if not results and tickers:
            raise HTTPException(status_code=500, detail="目前無法取得真實資料，無法推薦！(Yahoo Finance / FinMind 伺服器拒絕連線或發生錯誤)")
            
        return {"data": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 庫存持久化儲存 API
PORTFOLIO_FILE = "portfolio.json"

@app.get("/api/portfolio", dependencies=[Depends(authenticate)])
def get_portfolio():
    if os.path.exists(PORTFOLIO_FILE):
        try:
            with open(PORTFOLIO_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

@app.post("/api/portfolio", dependencies=[Depends(authenticate)])
async def save_portfolio(request: Request):
    try:
        data = await request.json()
        with open(PORTFOLIO_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
        return {"msg": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 歷史交易庫房 API
HISTORY_FILE = "history.json"

@app.get("/api/history", dependencies=[Depends(authenticate)])
def get_history():
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

@app.post("/api/history", dependencies=[Depends(authenticate)])
async def save_history(request: Request):
    try:
        data = await request.json()
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
        return {"msg": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 掛載靜態網頁與外部檔案 (提供支援 index.html, style.css, app.js 的靜態服務)
@app.get("/{filename}", dependencies=[Depends(authenticate)])
def serve_static(filename: str):
    if os.path.exists(filename) and filename in ["index.html", "style.css", "app.js", "history.html", "history.js"]:
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

@app.get("/", dependencies=[Depends(authenticate)])
def read_index():
    if os.path.exists("index.html"):
        headers = {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
        return FileResponse("index.html", headers=headers)
    return {"message": "index.html 檔案未找到"}
