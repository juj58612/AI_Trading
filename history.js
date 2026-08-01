const API_BASE_URL = (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost")
    ? "http://127.0.0.1:58888"
    : window.location.origin;

let myPortfolio = [];
let myHistory = [];
window.chartInstances = {};

const discountRateInput = document.getElementById('discountRate');
if (discountRateInput) {
    discountRateInput.addEventListener('change', () => renderActive(myPortfolio));
}

async function loadData() {
    try {
        const [portRes, histRes] = await Promise.all([
            fetch(`${API_BASE_URL}/api/portfolio`),
            fetch(`${API_BASE_URL}/api/history`)
        ]);
        
        myPortfolio = await portRes.json();
        myHistory = await histRes.json();
        
        // --- 啟動自動同步 (Sync Latest Data) ---
        let portfolioChanged = false;
        if (myPortfolio.length > 0) {
            document.getElementById('activeGrid').innerHTML = '<div class="empty-msg">🔄 正在自動同步最新籌碼與股價...</div>';
            
            await Promise.all(myPortfolio.map(async (item) => {
                try {
                    const res = await fetch(`${API_BASE_URL}/api/stock/${item.ticker}`);
                    const freshData = await res.json();
                    
                    if (freshData.latest_close) {
                        item.closePrice = freshData.latest_close;
                        item.high = Math.max(item.high || 0, freshData.latest_close);
                        item.inst_data = freshData.inst_data || [];
                        item.margin_data = freshData.margin_data || [];
                        item.history_dates = freshData.history_dates || [];
                        item.history_prices = freshData.history_prices || [];
                        item.is_mock = freshData.is_mock;
                        
                        // 智能籌碼與防線診斷 (Smart Alerts)
                        const sl_pct = freshData.stop_loss_pct || 0.08;
                        const tp_pct = freshData.take_profit_pct || 0.15;
                        const isShort = item.type === 'short';
                        
                        let newSignal = item.signal;
                        let newSigClass = item.sigClass || 'sig-neutral';
                        
                        let lastForeign = 0;
                        let lastTrust = 0;
                        if (item.inst_data && item.inst_data.length >= 2) {
                            const last1 = item.inst_data[item.inst_data.length - 1];
                            const last2 = item.inst_data[item.inst_data.length - 2];
                            lastForeign = last1.foreign + last2.foreign;
                            lastTrust = last1.trust + last2.trust;
                        }
                        
                        if (isShort) {
                            // 空單邏輯
                            const stopLossPrice = item.cost * (1 + sl_pct);
                            const takeProfitPrice = item.cost * (1 - tp_pct);
                            
                            if (item.cost > 0 && item.closePrice > stopLossPrice) {
                                newSignal = "⚠️ 突破防線，強烈建議停損";
                                newSigClass = "sig-loss";
                            } else if (item.cost > 0 && item.closePrice <= takeProfitPrice) {
                                newSignal = "💰 達標！建議分批獲利了結";
                                newSigClass = "sig-profit";
                            } else if (lastForeign > 0 && lastTrust > 0) {
                                newSignal = "⚠️ 法人聯手買進，軋空危機";
                                newSigClass = "sig-loss";
                            } else if (lastForeign < 0 && lastTrust < 0) {
                                newSignal = "🔥 籌碼鬆動，空單抱緊處理";
                                newSigClass = "sig-profit";
                            } else {
                                newSignal = "觀察中 (空單)";
                                newSigClass = "sig-neutral";
                            }
                        } else {
                            // 多單邏輯
                            const stopLossPrice = item.cost * (1 - sl_pct);
                            const takeProfitPrice = item.cost * (1 + tp_pct);
                            
                            if (item.cost > 0 && item.closePrice < stopLossPrice) {
                                newSignal = "⚠️ 跌破防線，強烈建議停損";
                                newSigClass = "sig-loss";
                            } else if (item.cost > 0 && item.closePrice >= takeProfitPrice) {
                                newSignal = "💰 達標！建議分批獲利了結";
                                newSigClass = "sig-profit";
                            } else if (lastForeign < 0 && lastTrust < 0) {
                                newSignal = "⚠️ 法人聯手出貨，籌碼鬆動";
                                newSigClass = "sig-loss";
                            } else if (lastTrust > 0 && lastForeign > 0) {
                                newSignal = "🔥 法人同買，多單抱緊處理";
                                newSigClass = "sig-profit";
                            } else if (lastTrust > 0) {
                                newSignal = "🔥 投信連買，抱緊處理";
                                newSigClass = "sig-profit";
                            } else {
                                newSignal = "觀察中 (多單)";
                                newSigClass = "sig-neutral";
                            }
                        }
                        
                        if (item.signal !== newSignal || item.sigClass !== newSigClass) {
                            item.signal = newSignal;
                            item.sigClass = newSigClass;
                            portfolioChanged = true;
                        }
                    }
                } catch (err) {
                    console.warn(`同步 ${item.ticker} 失敗:`, err);
                }
            }));
            
            if (portfolioChanged) {
                savePortfolioToStorage();
            }
        }
        // --- 同步結束 ---
        
        renderActive(myPortfolio);
        renderHistory(myHistory);
        renderStatsDashboard();
    } catch (e) {
        console.error("載入資料失敗", e);
        document.getElementById('activeGrid').innerHTML = '<div class="empty-msg">⚠️ 載入失敗</div>';
        document.getElementById('historyContainer').innerHTML = '<div class="empty-msg">⚠️ 載入失敗</div>';
    }
}

function renderStatsDashboard() {
    let unrealizedPnl = 0;
    let realizedPnl = 0;
    
    myPortfolio.forEach(item => {
        if (item.closePrice && item.closePrice > 0 && item.cost > 0) {
            const shares = item.shares || 1;
            const isShort = item.type === 'short';
            const pnl = isShort ? (item.cost - item.closePrice) * shares * 1000 : (item.closePrice - item.cost) * shares * 1000;
            unrealizedPnl += pnl;
        }
    });
    
    myHistory.forEach(item => {
        if (item.exitPrice && item.exitPrice > 0 && item.cost > 0) {
            const shares = item.shares || 1;
            const isShort = item.type === 'short';
            const pnl = isShort ? (item.cost - item.exitPrice) * shares * 1000 : (item.exitPrice - item.cost) * shares * 1000;
            realizedPnl += pnl;
        } else if (item.closePrice && item.closePrice > 0 && item.cost > 0) {
            const shares = item.shares || 1;
            const isShort = item.type === 'short';
            const pnl = isShort ? (item.cost - item.closePrice) * shares * 1000 : (item.closePrice - item.cost) * shares * 1000;
            realizedPnl += pnl;
        }
    });
    
    const totalPnl = unrealizedPnl + realizedPnl;
    
    const formatMoney = (val) => {
        const symbol = val > 0 ? '+' : '';
        return `<span style="color: ${val > 0 ? 'var(--accent-green)' : (val < 0 ? 'var(--accent-red)' : 'var(--text-main)')}">${symbol}${new Intl.NumberFormat('zh-TW').format(Math.round(val))}</span>`;
    };
    
    const elUnrealized = document.getElementById('unrealizedPnl');
    const elRealized = document.getElementById('realizedPnl');
    const elTotal = document.getElementById('totalPnl');
    
    if (elUnrealized) elUnrealized.innerHTML = formatMoney(unrealizedPnl);
    if (elRealized) elRealized.innerHTML = formatMoney(realizedPnl);
    if (elTotal) elTotal.innerHTML = formatMoney(totalPnl);
}

async function savePortfolioToStorage() {
    try {
        await fetch(`${API_BASE_URL}/api/portfolio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(myPortfolio)
        });
    } catch(e) {
        console.error("儲存庫存失敗", e);
    }
}

window.savePortfolioNote = function(index) {
    const reasonInput = document.getElementById(`reason-port-${index}`);
    const journalInput = document.getElementById(`journal-port-${index}`);
    if (reasonInput) myPortfolio[index].reason = reasonInput.value;
    if (journalInput) myPortfolio[index].journal = journalInput.value;
    savePortfolioToStorage();
    alert("✅ 筆記已儲存");
}

window.removeFromPortfolio = async function(index) {
    const item = myPortfolio[index];
    const defaultPrice = item.closePrice || item.cost;
    const exitPriceStr = prompt(`準備將 ${item.name} 移至歷史庫房。\n請輸入最終平倉/出場價格 (目前收盤價為 ${defaultPrice}):`, defaultPrice);
    if (exitPriceStr === null) return;
    
    const exitPrice = parseFloat(exitPriceStr) || defaultPrice;
    const isShort = item.type === 'short';
    const pnl = isShort ? (item.cost - exitPrice) : (exitPrice - item.cost);
    const pnlPercent = item.cost > 0 ? (pnl / item.cost * 100).toFixed(1) : 0;
    
    let outcome = "平盤 (0%)";
    if (pnl > 0) outcome = `獲利 (+${pnlPercent}%)`;
    else if (pnl < 0) outcome = `停損 (${pnlPercent}%)`;
    
    const historyRecord = {
        ...item,
        exitPrice: exitPrice,
        outcome: outcome,
        exitDate: new Date().toISOString().split('T')[0]
    };
    
    try {
        myHistory.push(historyRecord);
        await fetch(`${API_BASE_URL}/api/history`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(myHistory)
        });
    } catch (e) {
        console.error("歸檔失敗", e);
    }

    if (window.chartInstances[`canvas-inst-${item.ticker}`]) window.chartInstances[`canvas-inst-${item.ticker}`].destroy();
    if (window.chartInstances[`canvas-margin-${item.ticker}`]) window.chartInstances[`canvas-margin-${item.ticker}`].destroy();
    if (window.chartInstances[`canvas-price-${item.ticker}`]) window.chartInstances[`canvas-price-${item.ticker}`].destroy();
    
    myPortfolio.splice(index, 1);
    savePortfolioToStorage();
    renderActive(myPortfolio);
    renderHistory(myHistory);
    renderStatsDashboard();
    alert(`✅ 已將 ${item.name} 歸檔至歷史交易庫房！`);
};

function renderActive(data) {
    const grid = document.getElementById('activeGrid');
    if (!data || data.length === 0) {
        grid.innerHTML = '<div class="empty-msg" style="grid-column: 1/-1;">目前無現役持倉。</div>';
        return;
    }
    
    const discountRate = discountRateInput ? (parseFloat(discountRateInput.value) || 0.95) : 0.95;
    let stocksToRenderCharts = [];
    grid.innerHTML = '';
    
    data.forEach((item, index) => {
        const isShort = item.type === 'short';
        const typeLabel = isShort ? '空單' : '多單';
        
        const currentRet = isShort ? ((item.cost - item.closePrice) / item.cost * 100).toFixed(1) : ((item.closePrice - item.cost) / item.cost * 100).toFixed(1);
        const pnlAmount = isShort ? Math.round((item.cost - item.closePrice) * item.shares * 1000) : Math.round((item.closePrice - item.cost) * item.shares * 1000);
        
        const totalCostAmount = Math.round(item.cost * item.shares * 1000);
        const totalCostFormatted = new Intl.NumberFormat('zh-TW').format(totalCostAmount);
        const pnlFormatted = new Intl.NumberFormat('zh-TW').format(Math.abs(pnlAmount));
        const pnlColor = pnlAmount >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
        const pnlSymbol = pnlAmount >= 0 ? '▲ +' : '▼ -';
        
        let alertHtml = "";
        let defenseHtml = "";
        
        if (item.closePrice > 0) {
            if (isShort) {
                const effectiveLow = item.high > 0 ? item.high * (1 + (1 - discountRate)) : 0;
                if (item.supp > 0 && item.closePrice > item.supp) {
                    alertHtml = `<div class="alert-box alert-danger">🟢 觸發防線B！突破關鍵壓力，建議停損觀望</div>`;
                } else if (item.closePrice >= item.cost * 1.08) {
                    alertHtml = `<div class="alert-box alert-danger">🟢 觸發防線A！虧損達 8%，建議減碼或回補</div>`;
                } else if (item.high > 0 && item.closePrice >= effectiveLow * 1.08 && item.closePrice < item.cost) {
                    alertHtml = `<div class="alert-box alert-warning">🟡 反彈鎖利！自低點反彈達 8%，建議全數回補</div>`;
                } else if (item.closePrice <= item.cost * 0.85) {
                    alertHtml = `<div class="alert-box alert-profit">🔴 保本停利！獲利逾 15%，強制防守位下調至成本-5%</div>`;
                } else {
                    alertHtml = `<div class="alert-box alert-safe">🔵 狀態正常，讓空單利潤奔跑 (Let profits run)</div>`;
                }
                
                defenseHtml = `
                <div style="margin: 10px 0; padding: 12px; background: rgba(59, 130, 246, 0.05); border: 1px solid var(--accent-blue); border-radius: 8px;">
                    <div style="color: var(--accent-blue); font-weight: bold; margin-bottom: 8px;">🛡️ 戰術防線與目標價 (空單)</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.9rem;">
                        <div>防線A (-8% 停損): <strong style="color: var(--accent-red)">${(item.cost * 1.08).toFixed(1)}</strong></div>
                        <div>防線B (關鍵壓力): <strong style="color: var(--accent-red)">${item.supp > 0 ? item.supp.toFixed(1) : '-'}</strong></div>
                        <div>保本停利 (+15%): 達 <strong style="color: var(--accent-green)">${(item.cost * 0.85).toFixed(1)}</strong></div>
                        <div>波段低點打折鎖利: <strong style="color: var(--accent-yellow)">${item.high > 0 ? (effectiveLow * 1.08).toFixed(1) : '-'}</strong></div>
                    </div>
                </div>`;
            } else {
                const effectiveHigh = item.high * discountRate;
                if (item.supp > 0 && item.closePrice < item.supp) {
                    alertHtml = `<div class="alert-box alert-danger">🟢 觸發防線B！跌破關鍵支撐，建議停損觀望</div>`;
                } else if (item.closePrice <= item.cost * 0.92) {
                    alertHtml = `<div class="alert-box alert-danger">🟢 觸發防線A！虧損達 8%，建議減碼或停損</div>`;
                } else if (item.high > item.cost && item.closePrice <= effectiveHigh * 0.92) {
                    alertHtml = `<div class="alert-box alert-warning">🟡 回撤鎖利！自實質高點拉回達 8%，建議全數離場</div>`;
                } else if (item.closePrice >= item.cost * 1.15) {
                    alertHtml = `<div class="alert-box alert-profit">🔴 保本停利！獲利逾 15%，強制防守位上調至成本+5%</div>`;
                } else {
                    alertHtml = `<div class="alert-box alert-safe">🔵 狀態正常，讓利潤奔跑 (Let profits run)</div>`;
                }
                
                defenseHtml = `
                <div style="margin: 10px 0; padding: 12px; background: rgba(59, 130, 246, 0.05); border: 1px solid var(--accent-blue); border-radius: 8px;">
                    <div style="color: var(--accent-blue); font-weight: bold; margin-bottom: 8px;">🛡️ 戰術防線與目標價 (多單)</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.9rem;">
                        <div>防線A (-8% 停損): <strong style="color: var(--accent-red)">${(item.cost * 0.92).toFixed(1)}</strong></div>
                        <div>防線B (關鍵支撐): <strong style="color: var(--accent-red)">${item.supp > 0 ? item.supp.toFixed(1) : '-'}</strong></div>
                        <div>保本停利 (+15%): 達 <strong style="color: var(--accent-green)">${(item.cost * 1.15).toFixed(1)}</strong></div>
                        <div>波段高點打折鎖利: <strong style="color: var(--accent-yellow)">${item.high > 0 ? (effectiveHigh * 0.92).toFixed(1) : '-'}</strong></div>
                    </div>
                </div>`;
            }
        } else {
            alertHtml = `<div class="alert-box" style="background:#334155;">等待最新收盤價連線...</div>`;
        }
        
        if (item.is_mock) {
            alertHtml += `<div class="alert-box alert-mock">⚠️ 籌碼資料獲取受限，目前為備用模擬數據</div>`;
        }

        let instTableRows = "";
        if (item.inst_data && item.inst_data.length > 0) {
            const revInst = [...item.inst_data].reverse();
            instTableRows = revInst.map(d => {
                const fColor = d.foreign >= 0 ? 'var(--accent-red)' : 'var(--accent-green)';
                const tColor = d.trust >= 0 ? 'var(--accent-red)' : 'var(--accent-green)';
                const dColor = d.dealer >= 0 ? 'var(--accent-red)' : 'var(--accent-green)';
                const sumColor = d.total >= 0 ? 'var(--accent-red)' : 'var(--accent-green)';
                return `<tr><td>${d.date.substring(5)}</td><td style="color:${fColor}">${d.foreign}</td><td style="color:${tColor}">${d.trust}</td><td style="color:${dColor}">${d.dealer}</td><td style="color:${sumColor}; font-weight:bold;">${d.total}</td></tr>`;
            }).join('');
        }

        let marginTableRows = "";
        if (item.margin_data && item.margin_data.length > 0) {
            const revMargin = [...item.margin_data].reverse();
            marginTableRows = revMargin.map(d => {
                const ratio = d.margin_bal > 0 ? ((d.short_bal / d.margin_bal)*100).toFixed(2) : 0;
                return `<tr><td>${d.date.substring(5)}</td><td>${d.margin_bal}</td><td>${d.short_bal}</td><td>${ratio}%</td></tr>`;
            }).join('');
        }

        let chartSectionHtml = "";
        if (!item.is_mock) {
            stocksToRenderCharts.push(item);
            chartSectionHtml = `
            <div class="charts-container" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
                <div class="chart-wrapper" style="grid-column: 1/-1;">
                    <h4>📈 近30日收盤價走勢</h4>
                    <div class="chart-canvas-container" style="height: 180px;">
                        <canvas id="canvas-price-${item.ticker}"></canvas>
                    </div>
                </div>
                
                <div class="chart-wrapper">
                    <h4>📊 法人買賣超</h4>
                    <div class="chart-canvas-container">
                        <canvas id="canvas-inst-${item.ticker}"></canvas>
                    </div>
                    <details style="margin-top: 10px; cursor: pointer; color: var(--text-sub); font-size: 0.9rem;">
                        <summary style="padding: 5px; outline: none; user-select: none;">▶ 展開每日詳細資料</summary>
                        <table class="data-table" style="margin-top: 5px;">
                            <thead><tr><th>日期</th><th>外資</th><th>投信</th><th>自營商</th><th>合計</th></tr></thead>
                            <tbody>${instTableRows}</tbody>
                        </table>
                    </details>
                </div>
                
                <div class="chart-wrapper">
                    <h4>📊 融資融券</h4>
                    <div class="chart-canvas-container">
                        <canvas id="canvas-margin-${item.ticker}"></canvas>
                    </div>
                    <details style="margin-top: 10px; cursor: pointer; color: var(--text-sub); font-size: 0.9rem;">
                        <summary style="padding: 5px; outline: none; user-select: none;">▶ 展開每日詳細資料</summary>
                        <table class="data-table" style="margin-top: 5px;">
                            <thead><tr><th>日期</th><th>融資張數</th><th>融券張數</th><th>券資比(%)</th></tr></thead>
                            <tbody>${marginTableRows}</tbody>
                        </table>
                    </details>
                </div>
            </div>`;
        }

        const journalSectionHtml = `
            <div class="inputs-container" style="margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                <div class="input-box">
                    <label>建倉理由 (Trading Reason)</label>
                    <input type="text" id="reason-port-${index}" value="${item.reason || ''}" placeholder="例：突破下降趨勢線">
                </div>
                <div class="input-box">
                    <label>交易日誌/備忘錄 (Journal)</label>
                    <textarea id="journal-port-${index}" placeholder="紀錄後續加減碼心得">${item.journal || ''}</textarea>
                </div>
            </div>
            <button class="btn-save-note" onclick="savePortfolioNote(${index})">💾 儲存筆記</button>
        `;

        const headerBg = isShort ? 'linear-gradient(135deg, rgba(13, 148, 136, 0.15) 0%, rgba(59, 130, 246, 0.15) 100%)' : 'linear-gradient(135deg, rgba(236, 72, 153, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%)';
        const pCard = document.createElement('div');
        pCard.className = 'stock-card';
        pCard.innerHTML = `
            <div style="background: ${headerBg}; margin: -18px -18px 15px -18px; padding: 18px; border-radius: 12px 12px 0 0; border-bottom: 1px solid var(--border-color); position: relative;">
                <button class="btn-remove" onclick="removeFromPortfolio(${index})" style="top: 18px; right: 18px;">✕ 移除</button>
                <div class="stock-header" style="margin-top: 0; border-bottom: none; padding-bottom: 0;">
                    <span style="font-size: 1.15rem; font-weight: bold; color: var(--text-main);">${item.name}</span>
                    <div style="margin-top: 8px;">
                        <span class="signal-tag ${item.sigClass}">● ${item.signal || typeLabel} (${typeLabel})</span>
                    </div>
                </div>
            </div>
            <div class="pnl-panel">
                <div class="pnl-col">
                    <span>設定成本：<strong style="color:var(--text-main)">${item.cost}</strong> </span>
                    <span>操作張數：<strong style="color:var(--text-main)">${item.shares} 張</strong></span>
                    <span>最新收盤：<strong style="color:var(--text-main)">${item.closePrice > 0 ? item.closePrice : '計算中'}</strong></span>
                </div>
                <div class="pnl-col" style="text-align: right;">
                    <span style="color:var(--text-sub); font-size: 0.8rem;">投入本金：<strong style="color:var(--text-main); font-size:0.95rem;">${totalCostFormatted}</strong></span>
                    <span style="color:var(--text-sub); font-size: 0.8rem; margin-top: 4px;">${typeLabel}帳面損益 (TWD)</span>
                    <strong style="color:${pnlColor}; font-size: 1.5rem; line-height: 1.2;">
                        ${item.closePrice > 0 ? pnlSymbol + pnlFormatted : '-'}
                    </strong>
                    <span style="color:${pnlColor}; font-size: 0.85rem;">(${currentRet}%)</span>
                </div>
            </div>
            ${defenseHtml}
            ${alertHtml}
            ${journalSectionHtml}
            ${chartSectionHtml}
        `;
        grid.appendChild(pCard);
    });

    stocksToRenderCharts.forEach(stock => {
        initAdvancedCharts(stock.ticker, stock.inst_data, stock.margin_data, stock.history_dates, stock.history_prices);
    });
}

function initAdvancedCharts(ticker, inst_data, margin_data, history_dates, history_prices) {
    const instCanvasId = `canvas-inst-${ticker}`;
    const marginCanvasId = `canvas-margin-${ticker}`;
    const priceCanvasId = `canvas-price-${ticker}`;

    const instCtx = document.getElementById(instCanvasId);
    const marginCtx = document.getElementById(marginCanvasId);
    const priceCtx = document.getElementById(priceCanvasId);

    if (!instCtx || !marginCtx || !priceCtx) return;

    if (window.chartInstances[instCanvasId]) window.chartInstances[instCanvasId].destroy();
    if (window.chartInstances[marginCanvasId]) window.chartInstances[marginCanvasId].destroy();
    if (window.chartInstances[priceCanvasId]) window.chartInstances[priceCanvasId].destroy();

    const pLabels = history_dates ? history_dates.map(d => d.substring(5)) : [];
    const pData = history_prices || [];

    window.chartInstances[priceCanvasId] = new Chart(priceCtx.getContext('2d'), {
        type: 'line',
        data: {
            labels: pLabels,
            datasets: [{ 
                label: '收盤價', data: pData, borderColor: '#eab308', 
                backgroundColor: 'rgba(234, 179, 8, 0.1)', 
                pointBackgroundColor: '#eab308', tension: 0.2, fill: true
            }]
        },
        options: { 
            responsive: true, maintainAspectRatio: false, animation: false,
            scales: { x: { grid: { display: false } }, y: { grid: { color: '#334155' } } },
            plugins: { legend: { display: false } }
        }
    });

    const labels = inst_data && inst_data.length > 0 ? inst_data.map(d => d.date.substring(5)) : [];
    const fData = inst_data ? inst_data.map(d => d.foreign) : [];
    const tData = inst_data ? inst_data.map(d => d.trust) : [];
    const dData = inst_data ? inst_data.map(d => d.dealer) : [];

    window.chartInstances[instCanvasId] = new Chart(instCtx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: '外資', data: fData, backgroundColor: '#ef4444' },
                { label: '投信', data: tData, backgroundColor: '#3b82f6' },
                { label: '自營商', data: dData, backgroundColor: '#10b981' }
            ]
        },
        options: { 
            responsive: true, maintainAspectRatio: false, animation: false,
            scales: { y: { grid: { color: '#334155' } }, x: { grid: { display: false } } },
            plugins: { legend: { labels: { color: '#f8fafc' } } }
        }
    });

    const mLabels = margin_data && margin_data.length > 0 ? margin_data.map(d => d.date.substring(5)) : [];
    const mData = margin_data ? margin_data.map(d => d.margin_bal) : [];
    const sData = margin_data ? margin_data.map(d => d.short_bal) : [];

    window.chartInstances[marginCanvasId] = new Chart(marginCtx.getContext('2d'), {
        type: 'line',
        data: {
            labels: mLabels,
            datasets: [
                { 
                    label: '融資張數', data: mData, yAxisID: 'y1', 
                    borderColor: '#ef4444', backgroundColor: '#ef4444', 
                    pointBackgroundColor: '#ef4444', tension: 0.1 
                },
                { 
                    label: '融券張數', data: sData, yAxisID: 'y', 
                    borderColor: '#10b981', backgroundColor: '#10b981', 
                    pointBackgroundColor: '#10b981', tension: 0.1 
                }
            ]
        },
        options: { 
            responsive: true, maintainAspectRatio: false, animation: false,
            scales: { 
                x: { grid: { display: false } },
                y: { 
                    type: 'linear', position: 'left', beginAtZero: true, 
                    min: 0, ticks: { stepSize: 500 }, grid: { color: '#334155' } 
                },
                y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false } }
            },
            plugins: { legend: { labels: { color: '#f8fafc' } } }
        }
    });
}

function renderHistory(data) {
    const container = document.getElementById('historyContainer');
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="empty-msg">尚無歷史結案紀錄。當您從現役部隊中移除庫存時，資料將會歸檔於此。</div>';
        return;
    }
    
    // 越新的紀錄放越上面
    const sortedData = [...data].reverse();
    
    let html = '';
    sortedData.forEach((item, idx) => {
        const originalIndex = data.length - 1 - idx;
        const typeLabel = item.type === 'short' ? '空單' : '多單';
        
        let badgeClass = 'outcome-neutral';
        if (item.outcome.includes('獲利') || item.outcome.includes('停利') || item.outcome.includes('賺')) badgeClass = 'outcome-profit';
        else if (item.outcome.includes('損') || item.outcome.includes('虧') || item.outcome.includes('賠')) badgeClass = 'outcome-loss';
        
        const headerBg = item.type === 'short' ? 'linear-gradient(135deg, rgba(13, 148, 136, 0.15) 0%, rgba(59, 130, 246, 0.15) 100%)' : 'linear-gradient(135deg, rgba(236, 72, 153, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%)';
        html += `
            <div class="history-card" style="position: relative;">
                <div style="background: ${headerBg}; margin: -18px -18px 15px -18px; padding: 18px; border-radius: 12px 12px 0 0; border-bottom: 1px solid var(--border-color); position: relative;">
                    <input type="checkbox" class="history-checkbox" data-index="${originalIndex}" onchange="toggleDeleteButton()" style="position: absolute; top: 22px; right: 18px; transform: scale(1.5); cursor: pointer;">
                    <div class="history-header" style="margin: 0; border-bottom: none; padding-bottom: 0; padding-right: 40px;">
                        <div class="history-title">${item.name} <span style="font-size: 0.9rem; font-weight: normal; color: var(--text-sub);">(${typeLabel})</span></div>
                        <div class="history-meta" style="margin-top: 8px;">
                            <span class="outcome-badge ${badgeClass}">${item.outcome}</span>
                            <span style="margin-left: 15px;">歸檔日期：${item.exitDate || '未知'}</span>
                        </div>
                    </div>
                </div>
                
                <div class="history-body">
                    <div class="history-data-point">建倉成本：<strong>${item.cost}</strong></div>
                    <div class="history-data-point">操作張數：<strong>${item.shares}</strong></div>
                    <div class="history-data-point">波段極端收盤價：<strong>${item.high || 0}</strong></div>
                    <div class="history-data-point">最後紀錄收盤：<strong>${item.closePrice || 0}</strong></div>
                </div>
                
                ${(item.reason || item.journal) ? `
                <div class="history-notes">
                    ${item.reason ? `<strong>建倉理由：</strong><div>${item.reason}</div><br>` : ''}
                    ${item.journal ? `<strong>交易日誌/覆盤：</strong><div style="white-space: pre-wrap;">${item.journal}</div>` : ''}
                </div>
                ` : ''}
            </div>
        `;
    });
    container.innerHTML = html;
}

window.toggleDeleteButton = function() {
    const checkboxes = document.querySelectorAll('.history-checkbox:checked');
    const btnDelete = document.getElementById('btnDeleteSelected');
    if (btnDelete) {
        btnDelete.style.display = checkboxes.length > 0 ? 'inline-block' : 'none';
    }
}

window.deleteSelectedHistory = async function() {
    const checkboxes = document.querySelectorAll('.history-checkbox:checked');
    if (checkboxes.length === 0) return;
    
    if (!confirm(`確定要刪除這 ${checkboxes.length} 筆歷史紀錄嗎？此動作無法復原！`)) {
        return;
    }
    
    const indicesToDelete = Array.from(checkboxes).map(cb => parseInt(cb.dataset.index)).sort((a, b) => b - a);
    
    indicesToDelete.forEach(idx => {
        myHistory.splice(idx, 1);
    });
    
    try {
        await fetch(`${API_BASE_URL}/api/history`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(myHistory)
        });
        alert('✅ 紀錄已成功刪除');
        renderHistory(myHistory);
        renderStatsDashboard();
        toggleDeleteButton();
    } catch (e) {
        console.error("刪除失敗", e);
        alert('❌ 刪除失敗');
    }
}

window.exportHistoryToCSV = function() {
    if (!myHistory || myHistory.length === 0) {
        alert('目前無歷史紀錄可供匯出。');
        return;
    }
    
    let csvContent = "\uFEFF";
    csvContent += "代號與名稱,多空,進場成本,操作張數,波段極端收盤價,最後紀錄收盤,實際平倉價,出場結果,歸檔日期,建倉理由,交易日誌\n";
    
    myHistory.forEach(item => {
        const typeLabel = item.type === 'short' ? '空單' : '多單';
        const name = `"${(item.name || '').replace(/"/g, '""')}"`;
        const cost = item.cost || 0;
        const shares = item.shares || 0;
        const high = item.high || 0;
        const closePrice = item.closePrice || 0;
        const exitPrice = item.exitPrice || item.closePrice || 0;
        const outcome = `"${(item.outcome || '').replace(/"/g, '""')}"`;
        const date = item.exitDate || '';
        const reason = `"${(item.reason || '').replace(/"/g, '""')}"`;
        const journal = `"${(item.journal || '').replace(/"/g, '""')}"`;
        
        csvContent += `${name},${typeLabel},${cost},${shares},${high},${closePrice},${exitPrice},${outcome},${date},${reason},${journal}\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `歷史交易紀錄_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// 啟動載入
loadData();