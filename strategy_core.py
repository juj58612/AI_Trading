import pandas as pd
import numpy as np

def calculate_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    統一計算技術指標 (MA5, MA20, ATR)
    確保實戰與回測的數值絕對精準等價。
    """
    df = df.copy()
    
    # 均線計算
    df['MA5'] = df['close'].rolling(window=5).mean().round(2)
    df['MA20'] = df['close'].rolling(window=20).mean().round(2)
    
    # ATR 計算 (14日真實波動率)
    high_low = df['high'] - df['low']
    high_close = np.abs(df['high'] - df['close'].shift())
    low_close = np.abs(df['low'] - df['close'].shift())
    ranges = pd.concat([high_low, high_close, low_close], axis=1)
    true_range = np.max(ranges, axis=1)
    df['ATR'] = true_range.rolling(window=14).mean().round(2)
    
    return df

def calculate_chip_score(latest_close: float, ma5: float, inst_last2_days: list) -> tuple:
    """
    統一籌碼積分邏輯 (0~5分)
    inst_last2_days: 包含最近兩天法人數據的列表 [{'trust': 100, 'foreign': 50}, ...]
    回傳: (score, signal_text)
    """
    chip_score = 0
    signal_text = "等待主力表態"
    
    if pd.isna(ma5) or latest_close < ma5:
        chip_score -= 2
        signal_text = "⚠️ 跌破 5MA 轉弱"
        return chip_score, signal_text
        
    # 站上 5MA 基礎分
    chip_score += 1
    
    if not inst_last2_days or len(inst_last2_days) < 1:
        return chip_score, signal_text
        
    last1 = inst_last2_days[-1]  # 今天
    last2 = inst_last2_days[-2] if len(inst_last2_days) >= 2 else None  # 昨天
    
    # 投信今日買超
    if last1.get('trust', 0) > 0:
        chip_score += 2
        signal_text = "投信進駐"
    
    # 投信連買加分
    if last2 and last1.get('trust', 0) > 0 and last2.get('trust', 0) > 0:
        chip_score += 1
        signal_text = "🔥 投信連買"
        
    # 外資同步買超
    if last1.get('foreign', 0) > 0:
        chip_score += 1
        if last1.get('trust', 0) > 0: 
            signal_text = "🔥 土洋同買"
            
    return chip_score, signal_text

def evaluate_entry(today_price: pd.Series, inst_last2_days: list, strategy: str) -> dict:
    """
    統一進場濾網與邏輯
    回傳字典: 包含 score, momentum, atr 或是 None(不買)
    """
    close = today_price['close']
    ma5 = today_price['MA5']
    ma20 = today_price['MA20']
    atr = today_price['ATR']
    
    score, signal = calculate_chip_score(close, ma5, inst_last2_days)
    
    if score >= 1:
        # 大趨勢濾網 (方案 D 專屬)
        if strategy == 'D':
            if pd.isna(ma20) or close <= ma20:
                return None # 濾網擋下
                
        # 計算動能與防線
        momentum = (close - ma20) / ma20 if not pd.isna(ma20) and ma20 != 0 else 0.0
        safe_atr = atr if not pd.isna(atr) else 0.0
        
        return {
            "score": score,
            "momentum": momentum,
            "atr": safe_atr,
            "signal": signal
        }
        
    return None

def evaluate_exit(p: dict, today_price: pd.Series, yesterday_close: float, today_chip: dict, strategy: str, max_hold_days: int, current_date: pd.Timestamp) -> tuple:
    """
    統一出場邏輯
    p: 該筆持倉紀錄
    回傳: (sell_reason, updated_p) 或 (None, updated_p)
    """
    close = today_price['close']
    sell_reason = None
    
    # 更新最高最低價
    if close > p['highest_price']:
        p['highest_price'] = close
        atr_val = today_price['ATR']
        atr_val = atr_val if not pd.isna(atr_val) else 0.0
        p['trailing_stop'] = close - (p['atr_multiplier'] * atr_val)
    if close < p['lowest_price']:
        p['lowest_price'] = close
        
    # Check Time limit
    days_held = (current_date - pd.Timestamp(p['buy_date'])).days
    if days_held >= max_hold_days:
        sell_reason = "時間到期"
        return sell_reason, p
        
    # Check Stop Loss (Trailing or Fixed)
    if close < p['trailing_stop']:
        sell_reason = "觸發停損"
        return sell_reason, p
        
    # Check Take profit (15%) - Disabled for Strategy D
    if close >= p['buy_price'] * 1.15 and strategy != 'D':
        sell_reason = "15%停利"
        return sell_reason, p
        
    # Check Chip Loosening
    if strategy in ['C', 'D']: # 動態 ATR
        if today_chip.get('foreign', 0) < 0 or today_chip.get('trust', 0) < 0:
            p['chip_weak_days'] = p.get('chip_weak_days', 0) + 1
        else:
            p['chip_weak_days'] = 0
            
        if p['chip_weak_days'] >= 2:
            # 收縮防線
            p['atr_multiplier'] = 1.0
            atr_val = today_price['ATR']
            atr_val = atr_val if not pd.isna(atr_val) else 0.0
            
            # 使用昨收減去 1 ATR，若沒有昨收則用今收
            base_price = yesterday_close if yesterday_close else close
            new_stop = base_price - (1.0 * atr_val)
            p['trailing_stop'] = max(p['trailing_stop'], new_stop)
            if close < p['trailing_stop']:
                sell_reason = "動態停損"
                return sell_reason, p
                
    elif strategy == 'A': # 積分反轉
        if close < today_price['MA5'] and (today_chip.get('foreign', 0) < 0 or today_chip.get('trust', 0) < 0):
            p['score_weak_days'] = p.get('score_weak_days', 0) + 1
        else:
            p['score_weak_days'] = 0
            
        if p['score_weak_days'] >= 2:
            sell_reason = "積分轉負"
            return sell_reason, p
            
    elif strategy == 'B': # 土洋雙賣
        if today_chip.get('foreign', 0) < 0 and today_chip.get('trust', 0) < 0:
            sell_reason = "土洋雙賣"
            return sell_reason, p
            
    return None, p
