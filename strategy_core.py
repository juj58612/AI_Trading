import pandas as pd
import numpy as np

def calculate_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    統一計算技術指標 (MA5, MA20, ATR)
    確保實戰與回測的數值絕對精準等價。
    """
    df = df.copy()
    
    # 均線計算 (包含傳統 MA 與華爾街 VWMA 成交量加權均線)
    df['MA5'] = df['close'].rolling(window=5).mean().round(2)
    df['MA20'] = df['close'].rolling(window=20).mean().round(2)
    
    # VWMA 成交量加權均線
    pv = df['close'] * df['volume']
    df['VWMA5'] = (pv.rolling(window=5).sum() / df['volume'].rolling(window=5).sum()).round(2)
    df['VWMA20'] = (pv.rolling(window=20).sum() / df['volume'].rolling(window=20).sum()).round(2)
    
    # ATR 計算 (14日真實波動率)
    high_low = df['high'] - df['low']
    high_close = np.abs(df['high'] - df['close'].shift())
    low_close = np.abs(df['low'] - df['close'].shift())
    ranges = pd.concat([high_low, high_close, low_close], axis=1)
    true_range = np.max(ranges, axis=1)
    df['ATR'] = true_range.rolling(window=14).mean().round(2)
    
    return df

def evaluate_macro_3in1_status(foreign_spot_buy: float, twd_rate_change_5d: float, foreign_futures_short: int) -> dict:
    """
    華爾街三合一巨觀風控算子 (外資現貨 + 台幣匯率 + 外資期貨空單)
    回傳: { 'level': 0|1|2, 'title': str, 'advice': str, 'veto_buy': bool, 'pos_scale': float }
    """
    alerts = 0
    reasons = []
    
    # 警報 1: 外資期貨空單大於 30,000 口 (極端警戒)
    if foreign_futures_short >= 30000:
        alerts += 1
        reasons.append(f"期貨空單偏高 ({foreign_futures_short:,}口)")
        
    # 警報 2: 台幣 5 日內貶值超過 1.5 角 (資金外流)
    if twd_rate_change_5d >= 0.15:
        alerts += 1
        reasons.append(f"台幣快速貶值 (+{twd_rate_change_5d:.2f}角)")
        
    # 警報 3: 外資現貨單日大賣超過 100 億元
    if foreign_spot_buy <= -100:
        alerts += 1
        reasons.append(f"外資現貨大賣 ({foreign_spot_buy:.0f}億)")
        
    if alerts >= 3:
        return {
            'level': 2, # 紅燈熔斷
            'title': '🚨 三合一巨觀紅燈熔斷 (外資撤資+貶值+期空破3萬)',
            'advice': f"⚠️ 觸發巨觀風控熔斷！原因: {', '.join(reasons)}。一票否決禁止新建多單，保留現金！",
            'veto_buy': True,
            'pos_scale': 0.0
        }
    elif alerts == 2:
        return {
            'level': 1, # 黃燈警戒
            'title': '⚠️ 巨觀雙重警戒 (資金避險防禦期)',
            'advice': f"⚠️ 風險升級！原因: {', '.join(reasons)}。建議總庫存上限降至 50%，防線收緊。",
            'veto_buy': False,
            'pos_scale': 0.5
        }
    else:
        return {
            'level': 0, # 綠燈安全
            'title': '🟢 巨觀資金面安全',
            'advice': "資金面無系統性風險，可按波段與 Risk Parity 正常分配建倉。",
            'veto_buy': False,
            'pos_scale': 1.0
        }

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

def evaluate_entry(today_price: pd.Series, inst_last2_days: list, strategy: str, max_hold_days: int = 30) -> dict:
    """
    統一進場濾網與邏輯
    回傳字典: 包含 score, momentum, atr 或是 None(不買)
    """
    close = today_price['close']
    ma5 = today_price['MA5']
    ma20 = today_price['MA20']
    atr = today_price['ATR']
    
    score, signal = calculate_chip_score(close, ma5, inst_last2_days)
    
    # 摩擦成本過濾器 (Friction Filter)
    min_score = 1
    if max_hold_days < 12:
        min_score = 3  # 短天數交易，極度嚴格過濾，僅限最強籌碼進場
        
    if score >= min_score:
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

def _evaluate_regime_exit(p: dict, close: float, today_chip: dict, is_bull: bool) -> tuple:
    """
    'R'（Regime自動切換，研究版）專屬出場判斷，card-line規則組合依當日regime動態切換
    （每天重新判斷，不是凍結在進場當下的regime）。跟A/B/C/D/E共用的吊燈式ATR停損／
    固定15%停利是兩套完全不同的機制，不共用、不疊加。

    多頭（is_bull=True）：關防線A，防線B／高點打折鎖利／保本停利(調整模式)維持。
    空頭（is_bull=False）：防線A/防線B/高點打折鎖利全關，只留保本停利(調整模式)+土洋雙賣。

    這是 case_studies.html 個案⑤⑦⑧、research_report.html 驗證出的最終配置
    （48組窮舉冠軍，經巨觀風控開/關交叉驗證後配置不變）。

    p 需要的欄位：buy_price（成本）、supp（進場當下的20日低點，防線B用）、
    high（自進場以來最高收盤，函式內自動維護）、tp_locked/tp_floor（保本停利狀態，函式內自動維護）。
    """
    cost = p['buy_price']
    high = max(p.get('high', cost), close)
    p['high'] = high

    if is_bull:
        use_a, use_b, use_trail, use_dualsell = False, True, True, False
    else:
        use_a, use_b, use_trail, use_dualsell = False, False, False, True

    if use_dualsell:
        # today_chip 可能是dict、pandas Series或{}，一律用.get()取值，不對today_chip本身做
        # 真假值判斷（pandas Series的bool()是ambiguous，會直接丟例外）
        foreign = today_chip.get('foreign', 0) if today_chip is not None else 0
        trust = today_chip.get('trust', 0) if today_chip is not None else 0
        if foreign < 0 and trust < 0:
            return "土洋雙賣", p

    if use_b and close < p.get('supp', 0):
        return "防線B(破支撐)", p

    if use_a and close <= cost * 0.92:
        return "防線A(-8%停損)", p

    if use_trail and high > cost:
        effective_high = high * 0.95
        if close <= effective_high * 0.92:
            return "高點打折鎖利", p

    if not p.get('tp_locked') and close >= cost * 1.15:
        p['tp_locked'] = True
        p['tp_floor'] = cost * 1.05
    if p.get('tp_locked') and close < p['tp_floor']:
        return "保本停利(防守線回落)", p

    return None, p

def evaluate_exit(p: dict, today_price: pd.Series, yesterday_close: float, today_chip: dict, strategy: str, max_hold_days: int, current_date: pd.Timestamp, is_bull_regime: bool = None) -> tuple:
    """
    統一出場邏輯
    p: 該筆持倉紀錄
    is_bull_regime: 僅 strategy='R' 使用，當日TAIEX收盤 vs 20日均線的多空判斷，由呼叫端算好傳入
    （strategy_core 本身不抓即時資料，避免跟 main.py/backtest_engine.py 循環引用）。
    回傳: (sell_reason, updated_p) 或 (None, updated_p)
    """
    close = today_price['close']
    sell_reason = None

    # Check Time limit（所有方案共用的持倉天數上限，含'R'）
    days_held = (current_date - pd.Timestamp(p['buy_date'])).days
    if days_held >= max_hold_days:
        return "時間到期", p

    if strategy == 'R':
        return _evaluate_regime_exit(p, close, today_chip, bool(is_bull_regime))

    # 華爾街升級：吊燈停損法進階版 (Adaptive Chandelier Exit)
    # 當持倉獲利超過門檻後，自動收緊 ATR 乘數，緊貼價格鎖死獲利。
    # 方案E專屬：個案研究⑯用Optuna在訓練期(2021-01-01~2024-11-01)系統化搜尋這幾個
    # 常數，測試期(2024-11-02~2026-08-10)樣本外驗證仍打贏原本手動設的值，用正式
    # run_backtest引擎逐年獨立回測確認不是單一切分點的巧合（6年5勝1負，全期間
    # 286.64%->338.75%，MDD幾乎不變25.93%->25.92%），才正式改用；A/B/C/D維持原本的
    # 12%/1.25x/15%不變，避免未經驗證就影響其他方案。
    profit_lock_trigger = 0.1493 if strategy == 'E' else 0.12
    profit_lock_mult = 1.1292 if strategy == 'E' else 1.25
    take_profit_pct = 0.1872 if strategy == 'E' else 0.15

    unrealized_pnl_pct = (close - p['buy_price']) / p['buy_price']
    current_mult = p['atr_multiplier']
    if unrealized_pnl_pct >= profit_lock_trigger:
        current_mult = min(current_mult, profit_lock_mult)

    if close > p['highest_price']:
        p['highest_price'] = close
        atr_val = today_price['ATR']
        atr_val = atr_val if not pd.isna(atr_val) else 0.0
        p['trailing_stop'] = close - (current_mult * atr_val)
    if close < p['lowest_price']:
        p['lowest_price'] = close

    # Check Stop Loss (Trailing or Fixed)
    if close < p['trailing_stop']:
        sell_reason = "觸發停損"
        return sell_reason, p

    # Check Take profit - Disabled for Strategy D
    if close >= p['buy_price'] * (1 + take_profit_pct) and strategy != 'D':
        sell_reason = f"{round(take_profit_pct*100)}%停利"
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

    elif strategy == 'E': # 快穩雙軌：借用方案B「土洋雙賣」單日觸發（實測平均
        # 虧損是四方案中最小），但依「觸發當下部位是賺是賠」分兩種處理：
        #   - 虧損中：比照B，立即出場（B這部分本來就沒問題）
        #   - 獲利中：不直接出場，改成收緊移動停損到接近現價（比照C/D的動態收縮邏輯），
        #     等於「先把獲利鎖住，但給它一點點空間繼續漲」，而不是像v1版本那樣完全忽略訊號、
        #     結果讓部位一路撐到真的轉虧才出場，反而讓平均出場價更差（v1實測驗證過這樣更差，
        #     平均每筆虧損從B的-3,206元惡化到-8,223元，因此改成這個「緊縮不忽略」的版本）
        # 收緊倍數1.6226（原本1.0）：個案研究⑯Optuna搜尋結果，個案⑭已發現這個機制原本
        # 幾乎不會被單獨觸發(836筆裡只有5筆)，放寬倍數後給獲利部位多一點緩衝，訓練/測試期
        # 樣本外驗證+逐年獨立回測都確認優於原始1.0。
        if today_chip.get('foreign', 0) < 0 and today_chip.get('trust', 0) < 0:
            if unrealized_pnl_pct < 0:
                sell_reason = "土洋雙賣"
                return sell_reason, p
            else:
                atr_val = today_price['ATR']
                atr_val = atr_val if not pd.isna(atr_val) else 0.0
                base_price = yesterday_close if yesterday_close else close
                tightened_stop = base_price - (1.6226 * atr_val)
                p['trailing_stop'] = max(p['trailing_stop'], tightened_stop)
                if close < p['trailing_stop']:
                    sell_reason = "雙賣後鎖利出場"
                    return sell_reason, p

    return None, p
