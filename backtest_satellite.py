import os
import json
import requests
import datetime
import yfinance as yf
import pandas as pd
import numpy as np
import time

# --- 參數設定 ---
FINMIND_URL = "https://api.finmindtrade.com/api/v4/data"
STOCK_LIST_PATH = 'ai_stock_list.txt'
YEARS_TO_TEST = 3 # 測試過去3年

# 手續費與稅金 (依長官指示: 買進 0.1425%*0.5, 賣出 0.1425%*0.5 + 0.3%)
FEE_BUY = 0.001425 * 0.5
FEE_SELL = 0.001425 * 0.5
TAX_SELL = 0.003
TOTAL_FRICTION = FEE_BUY + FEE_SELL + TAX_SELL # 約 0.4425%

# 短線策略參數
RSI_PERIOD = 2
RSI_OVERSOLD_THRESHOLD = 25 # 放寬容錯，25以下在多頭回檔中已經算超賣
RSI_OVERBOUGHT_THRESHOLD = 80
VOL_SPIKE_RATIO = 1.0 # 放寬爆量條件，只要有基本均量即可
MAX_HOLD_DAYS = 3 # 3日內強制出場

def calculate_rsi(data, period=2):
    delta = data['Close'].diff()
    up = delta.clip(lower=0)
    down = -1 * delta.clip(upper=0)
    ema_up = up.ewm(com=period - 1, adjust=False).mean()
    ema_down = down.ewm(com=period - 1, adjust=False).mean()
    rs = ema_up / ema_down
    data[f'RSI_{period}'] = 100 - (100 / (1 + rs))
    return data

def fetch_finmind_institutional(ticker, start_date):
    """抓取 FinMind 三大法人資料 (外資與投信)"""
    stock_id = ticker.replace('.TW', '').replace('.TWO', '')
    token = os.getenv("FINMIND_API_TOKEN", "")  # 必須由環境變數提供，不在原始碼中寫死金鑰
    params = {
        "dataset": "TaiwanStockInstitutionalInvestorsBuySell",
        "data_id": stock_id,
        "start_date": start_date,
        "token": token
    }
    try:
        response = requests.get(FINMIND_URL, params=params, timeout=10)
        data = response.json()
        if data.get("msg") == "success" and len(data.get("data", [])) > 0:
            df = pd.DataFrame(data["data"])
            df['date'] = pd.to_datetime(df['date'])
            # 確保欄位存在並計算淨買超
            if 'buy' in df.columns and 'sell' in df.columns:
                df['net_buy'] = df['buy'] - df['sell']
            else:
                df['net_buy'] = 0
                
            # 整理為每日淨買超
            pivot_df = df.pivot_table(index='date', columns='name', values='net_buy', aggfunc='sum').fillna(0)
            
            # 確保欄位存在
            foreign_buy = pivot_df['Foreign_Investor'].copy() if 'Foreign_Investor' in pivot_df.columns else pd.Series(0, index=pivot_df.index)
            if 'Foreign_Dealer_Self' in pivot_df.columns:
                foreign_buy = foreign_buy + pivot_df['Foreign_Dealer_Self']
                
            trust_buy = pivot_df['Investment_Trust'].copy() if 'Investment_Trust' in pivot_df.columns else pd.Series(0, index=pivot_df.index)
            
            result_df = pd.DataFrame({
                'Foreign_Net_Buy': foreign_buy,
                'Trust_Net_Buy': trust_buy
            })
            return result_df
        return pd.DataFrame()
    except Exception as e:
        print(f"Error fetching FinMind for {ticker}: {e}")
        return pd.DataFrame()

def run_backtest(ticker):
    print(f"Backtesting {ticker}...")
    
    end_date = datetime.date.today()
    start_date = end_date - datetime.timedelta(days=YEARS_TO_TEST * 365 + 100) # 多抓100天算均線
    
    # 1. 抓取價量資料
    try:
        # First try .TW (TSE)
        df = yf.download(f"{ticker}.TW", start=start_date, end=end_date, progress=False, multi_level_index=False)
        if df.empty:
            # If empty, try .TWO (OTC)
            df = yf.download(f"{ticker}.TWO", start=start_date, end=end_date, progress=False, multi_level_index=False)
        if df.empty:
            print(f"No price data found for {ticker}")
            return None
    except Exception as e:
        print(f"Failed to fetch Yahoo data for {ticker}: {e}")
        return None
        
    df.index = df.index.tz_localize(None) # 移除時區方便對齊
    
    # 2. 計算技術指標
    df = calculate_rsi(df, RSI_PERIOD)
    df['MA60'] = df['Close'].rolling(window=60).mean()
    df['VOL_MA5'] = df['Volume'].rolling(window=5).mean()
    df['VOL_RATIO'] = df['Volume'] / df['VOL_MA5'].shift(1) # 跟昨天的均量比
    
    # 3. 抓取法人資料並合併
    fm_df = fetch_finmind_institutional(ticker, start_date.strftime('%Y-%m-%d'))
    if not fm_df.empty:
        df = df.join(fm_df, how='left')
        df['Foreign_Net_Buy'] = df['Foreign_Net_Buy'].fillna(0)
        df['Trust_Net_Buy'] = df['Trust_Net_Buy'].fillna(0)
    else:
        # 無籌碼資料則假設為0
        df['Foreign_Net_Buy'] = 0
        df['Trust_Net_Buy'] = 0
        
    df = df.dropna()
    
    # --- 回測核心邏輯 ---
    trades = []
    in_position = False
    entry_price = 0
    entry_date = None
    days_held = 0
    
    # 為了避免在當前K棒看到未來，我們依據「昨天(i-1)」收盤的訊號，在「今天(i)」的開盤價買進
    for i in range(1, len(df)):
        current_date = df.index[i]
        today_open = float(df['Open'].iloc[i])
        today_close = float(df['Close'].iloc[i])
        today_rsi = float(df[f'RSI_{RSI_PERIOD}'].iloc[i])
        
        # 昨天的訊號判斷基準
        prev_close = float(df['Close'].iloc[i-1])
        prev_ma60 = float(df['MA60'].iloc[i-1])
        prev_rsi = float(df[f'RSI_{RSI_PERIOD}'].iloc[i-1])
        prev_vol_ratio = float(df['VOL_RATIO'].iloc[i-1])
        prev_foreign = float(df['Foreign_Net_Buy'].iloc[i-1])
        prev_trust = float(df['Trust_Net_Buy'].iloc[i-1])
        
        if not in_position:
            # 進場條件判斷 (盤後)
            cond1 = prev_close > prev_ma60 # 季線之上
            cond2 = prev_rsi < RSI_OVERSOLD_THRESHOLD # 極度超賣
            cond3 = prev_vol_ratio > VOL_SPIKE_RATIO # 爆量
            cond4 = (prev_foreign > 0) or (prev_trust > 0) # 法人吸籌
            
            if cond1 and cond2 and cond3 and cond4:
                # 隔日開盤買進
                in_position = True
                entry_price = today_open
                entry_date = current_date
                days_held = 1
        else:
            # 持倉中，判斷出場
            days_held += 1
            
            # 出場條件一：RSI > 80 強勢反彈 (以今天收盤結算)
            if today_rsi > RSI_OVERBOUGHT_THRESHOLD:
                exit_price = today_close
                profit_pct = (exit_price / entry_price) - 1 - TOTAL_FRICTION
                trades.append({'ticker': ticker, 'entry_date': entry_date, 'exit_date': current_date, 'profit': profit_pct, 'reason': 'RSI_OVERBOUGHT'})
                in_position = False
                days_held = 0
                
            # 出場條件二：時間到了，第3天收盤強制出場
            elif days_held >= MAX_HOLD_DAYS:
                exit_price = today_close
                profit_pct = (exit_price / entry_price) - 1 - TOTAL_FRICTION
                trades.append({'ticker': ticker, 'entry_date': entry_date, 'exit_date': current_date, 'profit': profit_pct, 'reason': 'TIME_STOP'})
                in_position = False
                days_held = 0

    return trades

def main():
    if not os.path.exists(STOCK_LIST_PATH):
        print("ai_stock_list.txt not found!")
        return

    with open(STOCK_LIST_PATH, 'r', encoding='utf-8') as f:
        tickers = [line.strip() for line in f if line.strip() and not line.startswith('#')]
        
    all_trades = []
    # 測試全數 60 檔股票
    for ticker in tickers:
        try:
            trades = run_backtest(ticker)
            if trades:
                all_trades.extend(trades)
            time.sleep(1.0) # 避免 API 頻繁請求
        except Exception as e:
            print(f"Error processing {ticker}: {e}")
            
    if not all_trades:
        print("No trades triggered in the backtest period.")
        return
        
    df_trades = pd.DataFrame(all_trades)
    
    total_trades = len(df_trades)
    winning_trades = len(df_trades[df_trades['profit'] > 0])
    win_rate = winning_trades / total_trades if total_trades > 0 else 0
    avg_profit = df_trades['profit'].mean()
    
    print("\n" + "="*50)
    print("🚀 短線衛星系統 (RSI-2 多因子) 回測報告 🚀")
    print("="*50)
    print(f"回測期間: 過去 {YEARS_TO_TEST} 年")
    print(f"總交易次數: {total_trades} 次")
    print(f"勝率 (Win Rate): {win_rate*100:.2f}%")
    print(f"平均每筆淨利潤 (扣除所有手續費稅金): {avg_profit*100:.2f}%")
    
    # 統計勝率 > 60%
    if win_rate > 0.6:
        print("\n✅ 審核通過：勝率大於 60%，系統具備實戰價值！")
    else:
        print("\n⚠️ 審核未達標：勝率低於 60%，參數可能太嚴苛或需要微調。")
        
    print(f"\n手續費與稅金預設摩擦成本: {TOTAL_FRICTION*100:.4f}%")
    
if __name__ == "__main__":
    main()
