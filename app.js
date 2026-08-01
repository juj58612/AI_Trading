const API_BASE_URL = (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost" || window.location.protocol === "file:")
    ? "http://127.0.0.1:58888"
    : window.location.origin;

const AI_STOCKS_CONFIG = [
    { ticker: "2330", name: "2330 台積電", price: 950 }, { ticker: "2317", name: "2317 鴻海", price: 200 },
    { ticker: "2382", name: "2382 廣達", price: 280 }, { ticker: "3231", name: "3231 緯創", price: 105 },
    { ticker: "6669", name: "6669 緯穎", price: 2800 }, { ticker: "2376", name: "2376 技嘉", price: 270 },
    { ticker: "2356", name: "2356 英業達", price: 50 }, { ticker: "2324", name: "2324 仁寶", price: 35 },
    { ticker: "3706", name: "3706 神達", price: 45 }, { ticker: "2357", name: "2357 華碩", price: 500 },
    { ticker: "2353", name: "2353 宏碁", price: 45 }, { ticker: "3017", name: "3017 奇鋐", price: 600 },
    { ticker: "3324", name: "3324 雙鴻", price: 700 }, { ticker: "2421", name: "2421 建準", price: 100 },
    { ticker: "3653", name: "3653 健策", price: 1200 }, { ticker: "3338", name: "3338 泰碩", price: 60 },
    { ticker: "8996", name: "8996 高力", price: 350 }, { ticker: "3013", name: "3013 晟銘電", price: 100 },
    { ticker: "6117", name: "6117 迎廣", price: 100 }, { ticker: "3693", name: "3693 營邦", price: 400 },
    { ticker: "8210", name: "8210 勤誠", price: 280 }, { ticker: "2059", name: "2059 川湖", price: 1200 },
    { ticker: "2308", name: "2308 台達電", price: 400 }, { ticker: "6282", name: "6282 康舒", price: 35 },
    { ticker: "2345", name: "2345 智邦", price: 500 }, { ticker: "2368", name: "2368 金像電", price: 200 },
    { ticker: "3044", name: "3044 健鼎", price: 200 }, { ticker: "2313", name: "2313 華通", price: 75 },
    { ticker: "3037", name: "3037 欣興", price: 160 }, { ticker: "8046", name: "8046 南電", price: 150 },
    { ticker: "3189", name: "3189 景碩", price: 100 }, { ticker: "2383", name: "2383 台光電", price: 400 },
    { ticker: "6274", name: "6274 台燿", price: 170 }, { ticker: "6213", name: "6213 聯茂", price: 85 },
    { ticker: "3661", name: "3661 世芯-KY", price: 2500 }, { ticker: "3443", name: "3443 創意", price: 1200 },
    { ticker: "3035", name: "3035 智原", price: 280 }, { ticker: "6643", name: "6643 M31", price: 1100 },
    { ticker: "3529", name: "3529 力旺", price: 2500 }, { ticker: "6531", name: "6531 愛普*", price: 300 },
    { ticker: "2454", name: "2454 聯發科", price: 1300 }, { ticker: "3034", name: "3034 聯詠", price: 550 },
    { ticker: "8299", name: "8299 群聯", price: 550 }, { ticker: "5269", name: "5269 祥碩", price: 1700 },
    { ticker: "4966", name: "4966 譜瑞-KY", price: 800 }, { ticker: "3711", name: "3711 日月光投控", price: 160 },
    { ticker: "2449", name: "2449 京元電子", price: 110 }, { ticker: "3131", name: "3131 弘塑", price: 1500 },
    { ticker: "3583", name: "3583 辛耘", price: 350 }, { ticker: "6187", name: "6187 萬潤", price: 280 },
    { ticker: "6515", name: "6515 穎崴", price: 1000 }, { ticker: "2360", name: "2360 致茂", price: 300 },
    { ticker: "3533", name: "3533 嘉澤", price: 1500 }, { ticker: "2359", name: "2359 所羅門", price: 150 },
    { ticker: "6414", name: "6414 樺漢", price: 300 }, { ticker: "2395", name: "2395 研華", price: 350 },
    { ticker: "6139", name: "6139 亞翔", price: 220 }, { ticker: "5443", name: "5443 均豪", price: 130 },
    { ticker: "2303", name: "2303 聯電", price: 55 }, { ticker: "6230", name: "6230 尼得科超眾", price: 150 }
];

const stockPool = AI_STOCKS_CONFIG.map(s => ({
    ticker: s.ticker, name: s.name, defaultPrice: s.price,
    signal: "AI 趨勢選股", sigClass: "sig-right", priority: 1, cost: "", keySupport: "", instBuy: "等待連線", volume: "等待連線", maTrend: "等待連線"
}));

const sellPool = AI_STOCKS_CONFIG.map(s => ({
    ticker: s.ticker, name: s.name, defaultPrice: s.price,
    signal: "趨勢轉弱掃描", priority: "動態判定", action: "建議依紀律停損/停利", r1: "-", ma5: "-", instBuy: "等待連線", volume: "等待連線", maTrend: "等待連線"
}));

let myPortfolio = [];
window.chartInstances = {};

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

async function loadPortfolioFromStorage() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/portfolio`);
        if (res.ok) {
            const data = await res.json();
            myPortfolio = data.filter(item => item.ticker && item.ticker !== 'undefined');
        }
    } catch (e) {
        console.error("讀取庫存失敗", e);
        myPortfolio = [];
    }
}

const stocksGrid = document.getElementById('stocksGrid');
const btnScanAI = document.getElementById('btnScanAI');
const stockCountInput = document.getElementById('stockCount');
const buyPriceRange = document.getElementById('buyPriceRange');
const discountRateInput = document.getElementById('discountRateInput');
const sellGrid = document.getElementById('sellGrid');
const sellCountInput = document.getElementById('sellCount');
const sellPriceRange = document.getElementById('sellPriceRange');
const globalSearchKeyword = document.getElementById('globalSearchKeyword');
const btnGlobalSearch = document.getElementById('btnGlobalSearch');
const globalSearchResult = document.getElementById('globalSearchResult');

function filterByPriceRange(price, rangeKey) {
    if (rangeKey === 'under100') return price < 100;
    if (rangeKey === '100to300') return price >= 100 && price <= 300;
    if (rangeKey === '300to1000') return price > 300 && price <= 1000;
    if (rangeKey === 'above1000') return price > 1000;
    return true;
}

discountRateInput.addEventListener('input', () => {
    renderStockCards(stockCountInput.value);
    renderSellCards(sellCountInput.value);
});

btnGlobalSearch.addEventListener('click', async () => {
    const query = globalSearchKeyword.value.trim().toUpperCase();
    if (!query) { alert("請輸入股號或股票名稱！"); return; }

    btnGlobalSearch.textContent = "⏳ 查詢中...";
    const allPools = [...stockPool, ...sellPool];
    let match = allPools.find(s => s.name.toUpperCase().includes(query) || s.ticker.includes(query));

    globalSearchResult.style.display = "block";
    
    // 永遠嘗試從後端抓取最新報價
    let realPrice = null;
    let targetTicker = match ? match.ticker : (!isNaN(query) ? query : null);
    
    if (targetTicker) {
        try {
            const res = await fetch(`${API_BASE_URL}/api/stock/${targetTicker}`);
            const data = await res.json();
            if (data.latest_close) {
                realPrice = data.latest_close;
            }
        } catch (e) {
            console.warn("動態查詢失敗");
        }
    }

    if (!match && realPrice) {
        match = {
            ticker: query,
            name: `${query} 動態查詢標的`,
            defaultPrice: realPrice,
            signal: "動態獨立查詢",
            sigClass: "sig-right",
            instBuy: "無預設", volume: "無預設", maTrend: "無預設"
        };
    } else if (match && realPrice) {
        // 為了不影響原始 stockPool 物件，我們做個淺層複製再修改
        match = { ...match, defaultPrice: realPrice };
    }

    if (match) {
        globalSearchResult.innerHTML = `
            <div class="stock-card" style="border-color: var(--accent-blue);">
                <div class="stock-header">
                    <span style="font-size:1.2rem; font-weight:bold; color:var(--text-main);">${match.name}</span>
                    <span class="signal-tag sig-right">● 獨立即時查詢結果</span>
                </div>
                <div class="pnl-panel">
                    <div class="pnl-col">
                        <span>預設參考價：<strong style="color:var(--accent-yellow); font-size:1.2rem;">${match.defaultPrice} 元</strong></span>
                        <span>籌碼動能：<strong>${match.instBuy || '-'}</strong></span>
                    </div>
                    <div class="pnl-col" style="text-align: right;">
                        <span>量價結構：<strong>${match.volume || '-'}</strong></span>
                        <span>均線型態：<strong>${match.maTrend || '-'}</strong></span>
                    </div>
                </div>
            </div>
        `;
    } else {
        globalSearchResult.innerHTML = `<div style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--accent-red); padding: 12px; border-radius: 8px; text-align: center; color: var(--accent-red);">⚠️ 未在資料庫中查到「${query}」之標的，且無法取得即時股價。</div>`;
    }
    btnGlobalSearch.textContent = "⚡ 查詢即時股價";
});

window.stockDataCache = window.stockDataCache || {};

async function fetchRealDataUnified(ticker, stockName, prefix = '') {
    const statusEl = document.getElementById(`${prefix}live-status-${ticker}`);
    const highInput = document.getElementById(`${prefix}high-${ticker}`);
    const nameInput = document.getElementById(`${prefix}name-${ticker}`);
    const costInput = document.getElementById(`${prefix}cost-${ticker}`);
    const suppInput = document.getElementById(`${prefix}supp-${ticker}`);
    const mockAlertEl = document.getElementById(`${prefix}mock-alert-${ticker}`);
    
    if (statusEl) statusEl.innerHTML = "⏳ 同步中...";
    if (mockAlertEl) mockAlertEl.style.display = "none";
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/stock/${ticker}`);
        const data = await response.json();
        window.stockDataCache[ticker] = data;

        if (data.latest_close) {
            if (statusEl) statusEl.innerHTML = `<span class="live-price">收盤: ${data.latest_close}</span> <span>5MA: ${data.ma5}</span>`;
            if (nameInput) nameInput.dataset.close = data.latest_close;
            if (highInput) highInput.value = data.latest_close;
            
            if (costInput && !costInput.value) {
                costInput.value = data.latest_close;
            }
            if (suppInput && !suppInput.value) {
                suppInput.value = data.recent_low;
            }
            
            if (data.is_mock && mockAlertEl) {
                mockAlertEl.style.display = "block";
            }
            
            const instBuyEl = document.getElementById(`${prefix}instBuy-${ticker}`);
            const volumeEl = document.getElementById(`${prefix}volume-${ticker}`);
            const maTrendEl = document.getElementById(`${prefix}maTrend-${ticker}`);

            if (instBuyEl || volumeEl || maTrendEl) {
                let instStr = "法人動向不明";
                if (data.inst_data && data.inst_data.length > 0) {
                    let lastInst = data.inst_data[data.inst_data.length - 1];
                    if (lastInst.foreign > 0 && lastInst.trust > 0) instStr = "外資/投信同買";
                    else if (lastInst.foreign < 0 && lastInst.trust < 0) instStr = "外資/投信雙賣";
                    else if (lastInst.foreign > 0) instStr = "外資偏多操作";
                    else if (lastInst.trust > 0) instStr = "投信進駐護盤";
                    else instStr = "法人保守觀望";
                }
                let volStr = "量能穩定";
                let maStr = "均線糾結";
                if (data.latest_close > data.ma5) {
                    maStr = "站穩 5MA 短多";
                    if (data.latest_close >= data.recent_high * 0.98) volStr = "高檔強勢整理";
                    else volStr = "溫和上攻";
                } else {
                    maStr = "跌破 5MA 短空";
                    if (data.latest_close <= data.recent_low * 1.02) volStr = "低檔弱勢探底";
                    else volStr = "回測支撐";
                }
                if (instBuyEl) instBuyEl.textContent = instStr;
                if (volumeEl) volumeEl.textContent = volStr;
                if (maTrendEl) maTrendEl.textContent = maStr;
            }
            
            const existsInPortfolio = myPortfolio.find(item => item.ticker === ticker && item.type === (prefix === 'sell-' ? 'short' : 'long'));
            if (existsInPortfolio) {
                existsInPortfolio.closePrice = data.latest_close;
                if (data.latest_close > 0) {
                    if (existsInPortfolio.type === 'short') {
                        existsInPortfolio.high = existsInPortfolio.high > 0 ? Math.min(existsInPortfolio.high, data.latest_close) : data.latest_close;
                    } else {
                        existsInPortfolio.high = Math.max(existsInPortfolio.high || 0, data.latest_close);
                    }
                }
                existsInPortfolio.inst_data = data.inst_data || [];
                existsInPortfolio.margin_data = data.margin_data || [];
                existsInPortfolio.history_dates = data.history_dates || [];
                existsInPortfolio.history_prices = data.history_prices || [];
                existsInPortfolio.is_mock = data.is_mock;
                savePortfolioToStorage();
            }
            
            if (costInput) calcStockUnified(ticker, prefix);
        } else {
            if (statusEl) statusEl.innerHTML = "⚠️ 數據失敗";
        }
    } catch (error) {
        if (statusEl) statusEl.innerHTML = "❌ 伺服器未開放";
        if (mockAlertEl) mockAlertEl.style.display = "block";
    }
}

function calcStockUnified(ticker, prefix = '') {
    const costInput = document.getElementById(`${prefix}cost-${ticker}`);
    if (!costInput) return;

    const cost = parseFloat(costInput.value) || 0;
    const supp = parseFloat(document.getElementById(`${prefix}supp-${ticker}`).value) || 0;
    const highOrLow = parseFloat(document.getElementById(`${prefix}high-${ticker}`).value) || 0;
    const discountRate = parseFloat(discountRateInput.value) || 0.95;
    
    const resA = document.getElementById(`${prefix}resA-${ticker}`);
    const resB = document.getElementById(`${prefix}resB-${ticker}`);
    const resWin = document.getElementById(`${prefix}resWin-${ticker}`);
    const resDD = document.getElementById(`${prefix}resDD-${ticker}`);
    
    // Update total cost preview
    const sharesInput = document.getElementById(`${prefix}shares-${ticker}`);
    const totalCostSpan = document.getElementById(`${prefix}total-cost-${ticker}`);
    if (sharesInput && totalCostSpan) {
        const shares = parseFloat(sharesInput.value) || 0;
        const totalCostAmt = Math.round(cost * shares * 1000);
        totalCostSpan.textContent = `$${new Intl.NumberFormat('zh-TW').format(totalCostAmt)}`;
    }

    const data = window.stockDataCache && window.stockDataCache[ticker] ? window.stockDataCache[ticker] : {};
    const sl_pct = data.stop_loss_pct || 0.08;
    const tp_pct = data.take_profit_pct || 0.15;

    if (prefix === 'sell-') {
        if (cost > 0) {
            resA.textContent = `${(cost * (1 + sl_pct)).toFixed(1)} ~ ${(cost * (1 + sl_pct + 0.02)).toFixed(1)}`;
            resWin.textContent = `跌達 ${(cost * (1 - tp_pct)).toFixed(1)} 鎖 ${(cost * (1 - (tp_pct - 0.10))).toFixed(1)}`;
        } else { resA.textContent = "-"; resWin.textContent = "-"; }
        
        resB.textContent = supp > 0 ? `${supp.toFixed(1)} (連2天)` : "-";
        
        if (highOrLow > 0) {
            const effectiveLow = highOrLow * (1 + (1 - discountRate)); 
            resDD.textContent = `${(effectiveLow * (1 + sl_pct)).toFixed(1)} ~ ${(effectiveLow * (1 + sl_pct + 0.02)).toFixed(1)}`;
        } else { resDD.textContent = "-"; }
    } else {
        if (cost > 0) {
            resA.textContent = `${(cost * (1 - sl_pct)).toFixed(1)} ~ ${(cost * (1 - sl_pct - 0.02)).toFixed(1)}`;
            resWin.textContent = `達 ${(cost * (1 + tp_pct)).toFixed(1)} 鎖 ${(cost * (1 + (tp_pct - 0.10))).toFixed(1)}`;
        } else { resA.textContent = "-"; resWin.textContent = "-"; }
        
        resB.textContent = supp > 0 ? `${supp.toFixed(1)} (連2天)` : "-";
        
        if (highOrLow > 0) {
            const effectiveHigh = highOrLow * discountRate;
            resDD.textContent = `${(effectiveHigh * (1 - sl_pct)).toFixed(1)} ~ ${(effectiveHigh * (1 - sl_pct - 0.02)).toFixed(1)}`;
        } else { resDD.textContent = "-"; }
    }
}

window.addToPortfolioByTicker = function(ticker, prefix = '', type = 'long') {
    const nameInput = document.getElementById(`${prefix}name-${ticker}`);
    const name = nameInput.value;
    const closePrice = parseFloat(nameInput.dataset.close) || 0;
    const cost = parseFloat(document.getElementById(`${prefix}cost-${ticker}`).value) || 0;
    const shares = parseFloat(document.getElementById(`${prefix}shares-${ticker}`).value) || 1;
    const supp = parseFloat(document.getElementById(`${prefix}supp-${ticker}`).value) || 0;
    const high = parseFloat(document.getElementById(`${prefix}high-${ticker}`).value) || 0;
    const sigClass = nameInput.dataset.sigclass;
    const signal = nameInput.dataset.signal;
    const is_mock = false;

    if (cost <= 0) {
        alert("⚠️ 請先輸入『購買/放空成本 ($C$)』後再加入追蹤！");
        return;
    }

    const exists = myPortfolio.findIndex(item => item.ticker === ticker && item.type === type);
    if (exists !== -1) {
        const oldItem = myPortfolio[exists];
        const oldShares = oldItem.shares || 0;
        const oldCost = oldItem.cost || 0;
        const newShares = shares;
        const newCost = cost;
        const totalShares = oldShares + newShares;
        
        let avgCost = 0;
        if (totalShares > 0) {
            avgCost = ((oldCost * oldShares) + (newCost * newShares)) / totalShares;
        }
        
        let updatedHigh = high;
        if (oldItem.high > 0 && high > 0) {
            updatedHigh = type === 'long' ? Math.max(oldItem.high, high) : Math.min(oldItem.high, high);
        } else if (oldItem.high > 0) {
            updatedHigh = oldItem.high;
        }
        
        myPortfolio[exists] = { ...oldItem, name, closePrice, cost: avgCost, shares: totalShares, supp, high: updatedHigh, sigClass, signal };
        alert(`✅ 偵測到已有 ${name} 庫存，已執行加碼攤平計算！\n最新平均成本為: ${avgCost.toFixed(2)}\n總張數為: ${totalShares}`);
    } else {
        myPortfolio.push({ name, ticker, closePrice, cost, shares, supp, high, sigClass, signal, type, inst_data: [], margin_data: [], history_dates: [], history_prices: [], is_mock, reason: '', journal: '' });
        alert(`✅ 已將 ${name} 加入追蹤！請至「我的操盤室」查看詳細損益與圖表。`);
    }
    
    savePortfolioToStorage();
    
    fetchRealDataUnified(ticker, name, prefix);
};

window.removeFromPortfolio = async function(index) {
    const item = myPortfolio[index];
    const outcome = prompt(`準備將 ${item.name} 移至歷史庫房。\n請輸入最終出場結果 (例如：獲利 / 停損 / 平盤):`, "獲利");
    if (outcome === null) return;
    
    const historyRecord = {
        ...item,
        outcome: outcome,
        exitDate: new Date().toISOString().split('T')[0]
    };
    
    try {
        const res = await fetch(`${API_BASE_URL}/api/history`);
        let historyData = await res.json();
        if (!Array.isArray(historyData)) historyData = [];
        historyData.push(historyRecord);
        await fetch(`${API_BASE_URL}/api/history`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(historyData)
        });
    } catch (e) {
        console.error("歸檔失敗", e);
    }
    
    myPortfolio.splice(index, 1);
    savePortfolioToStorage();
    alert(`✅ 已將 ${item.name} 歸檔至歷史交易庫房！`);
};

async function renderStockCards(count) {
    let targetCount = parseInt(count) || 5;
    if (targetCount > 60) targetCount = 60;
    if (targetCount < 1) targetCount = 1;
    stockCountInput.value = targetCount;
    
    const rangeKey = buyPriceRange.value;
    stocksGrid.innerHTML = '<div class="empty-msg" style="grid-column: 1/-1;">⌛ 正在透過 AI 演算法進行全市場量價動能掃描...</div>';

    let filteredStocks = [];
    try {
        // 顯示掃描 UI
        const progressContainer = document.getElementById('scanProgressContainer');
        const progressBar = document.getElementById('scanProgressBar');
        const statusText = document.getElementById('scanStatusText');
        if (progressContainer) {
            progressContainer.style.display = 'block';
            progressBar.style.width = '20%';
            statusText.textContent = "🚀 正在請求後端執行 AI 籌碼深度掃描 (約需 15 秒)...";
            setTimeout(() => { if(progressBar.style.width === '20%') progressBar.style.width = '60%'; }, 5000);
            setTimeout(() => { if(progressBar.style.width === '60%') progressBar.style.width = '90%'; }, 10000);
        }

        const tickers = stockPool.map(s => s.ticker);
        const res = await fetch(`${API_BASE_URL}/api/scan_all`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tickers })
        });
        
        if (!res.ok) {
            let errMsg = `HTTP ${res.status}`;
            try {
                const errJson = await res.json();
                errMsg += ` - ${errJson.detail || res.statusText}`;
            } catch (je) {
                errMsg += ` - ${res.statusText}`;
            }
            throw new Error(errMsg);
        }
        
        const scanResult = await res.json();
        const scanData = scanResult.data || [];
        
        if (progressContainer) {
            progressBar.style.width = '100%';
            statusText.textContent = "✅ 掃描完成！正在為您挑選最強勢標的...";
            setTimeout(() => { progressContainer.style.display = 'none'; }, 1000);
        }
        
        let above20MA = 0;
        let validStocks = 0;

        stockPool.forEach(stock => {
            let s = { ...stock };
            const sd = scanData.find(d => d.ticker === s.ticker);
            if (sd) {
                s.momentum = sd.momentum;
                s.volRatio = sd.vol_ratio;
                s.latestClose = sd.latest_close;
                
                // 使用後端傳回的真實籌碼狀態
                s.chipScore = sd.chip_score;
                s.signal = `${sd.signal} (積分: ${sd.chip_score})`;
                s.instBuy = `外:${sd.last_foreign} 投:${sd.last_trust}`;
                
                if (sd.chip_score > 0) s.sigClass = "sig-profit";
                else if (sd.chip_score < 0) s.sigClass = "sig-loss";
                else s.sigClass = "sig-neutral";
                
                validStocks++;
                if (sd.momentum > 0) above20MA++;
                
                // 排分邏輯：籌碼優先，動能次之
                s.aiScore = (sd.chip_score * 100) + sd.momentum;
                
                if (filterByPriceRange(s.latestClose, rangeKey)) {
                    filteredStocks.push(s);
                }
            }
        });
        
        filteredStocks.sort((a, b) => b.aiScore - a.aiScore);
        
        const breadthRatio = validStocks > 0 ? (above20MA / validStocks) * 100 : 0;
        updateMarketWeather(breadthRatio);
    } catch (e) {
        console.error("Dynamic ranking failed:", e);
        const progressContainer = document.getElementById('scanProgressContainer');
        if (progressContainer) progressContainer.style.display = 'none';
        
        stocksGrid.innerHTML = `<div class="empty-msg" style="grid-column: 1/-1; color: var(--accent-red);">
            ⚠️ 掃描失敗！無法連線至後端伺服器 (API_BASE_URL: ${API_BASE_URL})<br>
            請確認您的 <code>uvicorn main:app --port 58888</code> 是否正在運行，或是伺服器是否需要密碼驗證 (401 Unauthorized)。<br>
            詳細錯誤: ${e.message}
        </div>`;
        return;
    }

    stocksGrid.innerHTML = '';
    const selectedStocks = filteredStocks.slice(0, targetCount);

    if (selectedStocks.length === 0) {
        stocksGrid.innerHTML = `<div class="empty-msg" style="grid-column: 1/-1;">⚠️ 目前無法取得真實資料，無法推薦！(可能遭到阻擋或假日無連線)</div>`;
        return;
    }

function updateMarketWeather(ratio) {
    let container = document.getElementById('market-weather-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'market-weather-container';
        container.style.cssText = 'margin: 0px 0 20px 0; padding: 15px; border-radius: 12px; font-weight: bold; text-align: center; font-size: 1.1rem; grid-column: 1/-1; border-width: 2px; border-style: solid;';
        stocksGrid.parentNode.insertBefore(container, stocksGrid);
    }
    
    if (ratio > 75) {
        container.style.background = 'rgba(249, 115, 22, 0.15)';
        container.style.borderColor = '#f97316';
        container.style.color = '#f97316';
        container.innerHTML = `🟠 當前市況：高檔震盪 / 末升段 (AI 族群健康度：${ratio.toFixed(1)}%)<br><span style="font-size:0.9rem; font-weight:normal; color:var(--text-sub);">建議：市場過熱，隨時拉回，嚴格鎖利，當心拉積盤出貨。</span>`;
    } else if (ratio >= 45 && ratio <= 75) {
        container.style.background = 'rgba(239, 68, 68, 0.15)';
        container.style.borderColor = '#ef4444';
        container.style.color = '#ef4444';
        container.innerHTML = `🔴 當前市況：穩定多頭 (AI 族群健康度：${ratio.toFixed(1)}%)<br><span style="font-size:0.9rem; font-weight:normal; color:var(--text-sub);">建議：全面進攻，採等權重分配買滿排名前三標的。</span>`;
    } else if (ratio >= 25 && ratio < 45) {
        container.style.background = 'rgba(245, 158, 11, 0.15)';
        container.style.borderColor = '#f59e0b';
        container.style.color = '#f59e0b';
        container.innerHTML = `🟡 當前市況：破底翻 / 築底期 (AI 族群健康度：${ratio.toFixed(1)}%)<br><span style="font-size:0.9rem; font-weight:normal; color:var(--text-sub);">建議：多頭初醒，可小額試單前三名黑馬，分批佈局。</span>`;
    } else if (ratio >= 10 && ratio < 25) {
        container.style.background = 'rgba(16, 185, 129, 0.15)';
        container.style.borderColor = '#10b981';
        container.style.color = '#10b981';
        container.innerHTML = `🟢 當前市況：無差別股災 (AI 族群健康度：${ratio.toFixed(1)}%)<br><span style="font-size:0.9rem; font-weight:normal; color:var(--text-sub);">建議：覆巢之下無完卵，空手觀望，保留現金。</span>`;
    } else {
        container.style.background = 'rgba(5, 150, 105, 0.15)';
        container.style.borderColor = '#059669';
        container.style.color = '#059669';
        container.innerHTML = `🟢 當前市況：極度恐慌 / 融資斷頭期 (AI 族群健康度：${ratio.toFixed(1)}%)<br><span style="font-size:0.9rem; font-weight:normal; color:var(--text-sub);">建議：乖離過大，隨時有暴力反彈 (V轉)，準備搶短。</span>`;
    }
}

    selectedStocks.forEach((stock, rankIdx) => {
        const card = document.createElement('div');
        card.className = 'stock-card';
        card.innerHTML = `
            <div class="rank-badge">推薦順位 #${rankIdx + 1}</div>
            <div class="stock-header">
                <input type="text" class="stock-name-input" id="name-${stock.ticker}" value="${stock.name}" readonly data-close="0" data-sigclass="${stock.sigClass}" data-signal="${stock.signal}">
                <div class="real-data-bar" id="live-status-${stock.ticker}">等待連線...</div>
                <div class="alert-box alert-mock" id="mock-alert-${stock.ticker}" style="display:none; font-size:0.75rem; padding:4px;">⚠️ 籌碼模擬數據</div>
                <span class="signal-tag ${stock.sigClass}">● ${stock.signal} (做多)</span>
            </div>

            <div class="card-results" style="border-color: var(--accent-purple); background: rgba(139, 92, 246, 0.1);">
                <div class="res-row"><span style="color:var(--text-sub);">籌碼動能:</span><span id="instBuy-${stock.ticker}" style="color:var(--text-main); font-weight:bold;">${stock.instBuy}</span></div>
                <div class="res-row"><span style="color:var(--text-sub);">量價結構:</span><span id="volume-${stock.ticker}" style="color:var(--text-main); font-weight:bold;">${stock.volume}</span></div>
                <div class="res-row"><span style="color:var(--text-sub);">均線共振:</span><span id="maTrend-${stock.ticker}" style="color:var(--text-main); font-weight:bold;">${stock.maTrend}</span></div>
            </div>
            
            <div class="inputs-container">
                <div class="input-box"><label>購買成本 ($C$)</label><input type="number" id="cost-${stock.ticker}" value="" placeholder="自動填入最新價"></div>
                <div class="input-box"><label>操作張數 (張) <span id="total-cost-${stock.ticker}" style="color:var(--accent-green); font-size:0.8rem; float:right;">$0</span></label><input type="number" id="shares-${stock.ticker}" value="1" min="0.001" step="0.001"></div>
                <div class="input-box"><label>關鍵支撐 ($S_{key}$)</label><input type="number" id="supp-${stock.ticker}" value="" placeholder="自動填入前低"></div>
                <div class="input-box"><label>波段最高收盤價</label><input type="number" id="high-${stock.ticker}" value="0" readonly title="系統將自動根據收盤價更新最高水位"></div>
            </div>

            <div class="card-results">
                <div class="res-row"><span>防線A (成本-8%~10%):</span><span class="val-red" id="resA-${stock.ticker}">-</span></div>
                <div class="res-row"><span>防線B (破 $S_{key}$ 停損):</span><span class="val-red" id="resB-${stock.ticker}">-</span></div>
                <div class="res-row"><span>保本停利 (+15%鎖+5%):</span><span class="val-green" id="resWin-${stock.ticker}">-</span></div>
                <div class="res-row"><span>實質高點打折鎖利:</span><span class="val-yellow" id="resDD-${stock.ticker}">-</span></div>
            </div>
            <button class="btn-add" onclick="addToPortfolioByTicker('${stock.ticker}', '', 'long')">📥 加入多單追蹤</button>
        `;
        stocksGrid.appendChild(card);

        document.getElementById(`cost-${stock.ticker}`).addEventListener('input', (e) => {
            calcStockUnified(stock.ticker, '');
        });
        document.getElementById(`supp-${stock.ticker}`).addEventListener('input', () => calcStockUnified(stock.ticker, ''));
        document.getElementById(`high-${stock.ticker}`).addEventListener('input', () => calcStockUnified(stock.ticker, ''));
        document.getElementById(`shares-${stock.ticker}`).addEventListener('input', () => calcStockUnified(stock.ticker, ''));
        
        calcStockUnified(stock.ticker, '');
        fetchRealDataUnified(stock.ticker, stock.name, '');
    });
}

async function renderSellCards(count) {
    let targetCount = parseInt(count) || 4;
    if (targetCount > 60) targetCount = 60;
    if (targetCount < 1) targetCount = 1;
    sellCountInput.value = targetCount;
    
    const rangeKey = sellPriceRange.value;
    sellGrid.innerHTML = '<div class="empty-msg" style="grid-column: 1/-1;">⌛ 正在透過 AI 演算法進行全市場量價動能掃描...</div>';

    let selectedSellStocks = [];
    try {
        const tickers = sellPool.map(s => s.ticker);
        const res = await fetch(`${API_BASE_URL}/api/scan_all`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tickers })
        });
        const scanResult = await res.json();
        const scanData = scanResult.data || [];
        
        let filteredSellStocks = [];
        
        sellPool.forEach(stock => {
            let s = { ...stock };
            const sd = scanData.find(d => d.ticker === s.ticker);
            if (sd) {
                s.latestClose = sd.latest_close;
            } else {
                s.latestClose = s.defaultPrice;
            }
            if (filterByPriceRange(s.latestClose, rangeKey)) {
                filteredSellStocks.push(s);
            }
        });
        
        selectedSellStocks = filteredSellStocks.slice(0, targetCount);
    } catch (e) {
        console.error("Sell cards dynamic fetching failed:", e);
    }

    if (selectedSellStocks.length === 0) {
        sellGrid.innerHTML = `<div class="empty-msg" style="grid-column: 1/-1;">⚠️ 在「${sellPriceRange.options[sellPriceRange.selectedIndex].text}」區間內，無符合轉弱條件之標的。</div>`;
        return;
    }

    selectedSellStocks.forEach((stock, rankIdx) => {
        const card = document.createElement('div');
        card.className = 'stock-card sell-card';
        card.innerHTML = `
            <div class="sell-badge">${stock.priority}</div>
            <div class="stock-header">
                <input type="text" class="stock-name-input" id="sell-name-${stock.ticker}" value="${stock.name}" readonly data-close="0" data-sigclass="sig-sell" data-signal="${stock.signal}">
                <div class="real-data-bar" id="sell-live-status-${stock.ticker}">等待連線...</div>
                <div class="alert-box alert-mock" id="sell-mock-alert-${stock.ticker}" style="display:none; font-size:0.75rem; padding:4px;">⚠️ 籌碼模擬數據</div>
                <span class="sell-signal-tag">● ${stock.signal} (放空)</span>
            </div>

            <div class="card-results" style="border-color: var(--sell-accent); background: rgba(13, 148, 136, 0.1);">
                <div class="res-row"><span style="color:var(--text-sub);">籌碼動能:</span><span id="sell-instBuy-${stock.ticker}" style="color:var(--text-main); font-weight:bold;">${stock.instBuy}</span></div>
                <div class="res-row"><span style="color:var(--text-sub);">量價結構:</span><span id="sell-volume-${stock.ticker}" style="color:var(--text-main); font-weight:bold;">${stock.volume}</span></div>
                <div class="res-row"><span style="color:var(--text-sub);">均線共振:</span><span id="sell-maTrend-${stock.ticker}" style="color:var(--text-main); font-weight:bold;">${stock.maTrend}</span></div>
            </div>
            
            <div class="inputs-container">
                <div class="input-box"><label>放空成本 ($C$)</label><input type="number" id="sell-cost-${stock.ticker}" value="" placeholder="自動填入最新價"></div>
                <div class="input-box"><label>操作張數 (張) <span id="sell-total-cost-${stock.ticker}" style="color:var(--accent-red); font-size:0.8rem; float:right;">$0</span></label><input type="number" id="sell-shares-${stock.ticker}" value="1" min="0.001" step="0.001"></div>
                <div class="input-box"><label>關鍵壓力 ($R_{key}$)</label><input type="number" id="sell-supp-${stock.ticker}" value=""></div>
                <div class="input-box"><label>波段最低收盤價</label><input type="number" id="sell-high-${stock.ticker}" value="0" readonly title="系統將自動根據收盤價更新最低水位"></div>
            </div>

            <div class="card-results">
                <div class="res-row"><span>防線A (成本+8%~10%):</span><span class="val-red" id="sell-resA-${stock.ticker}">-</span></div>
                <div class="res-row"><span>防線B (過 $R_{key}$ 停損):</span><span class="val-red" id="sell-resB-${stock.ticker}">-</span></div>
                <div class="res-row"><span>保本停利 (-15%鎖-5%):</span><span class="val-green" id="sell-resWin-${stock.ticker}">-</span></div>
                <div class="res-row"><span>實質低點反彈鎖利:</span><span class="val-yellow" id="sell-resDD-${stock.ticker}">-</span></div>
            </div>

            <div class="card-results" style="border-color: var(--sell-accent); background-color: rgba(13, 148, 136, 0.1); margin-top: 8px;">
                <div class="res-row"><span>技術壓力區 R1:</span><span style="color:var(--sell-accent); font-weight:bold;">${stock.r1}</span></div>
                <div class="res-row"><span>5日均線:</span><span style="color:var(--sell-accent); font-weight:bold;">${stock.ma5}</span></div>
                <div class="res-row" style="margin-top: 5px; border-top: 1px dashed var(--sell-accent); padding-top: 5px;">
                    <span style="color:var(--text-main);">AI 推薦動作：</span>
                    <span style="color:var(--sell-border); font-weight:bold;">${stock.action}</span>
                </div>
            </div>

            <button class="btn-add" style="border-color: var(--sell-border); color: var(--sell-border); background-color: rgba(234, 88, 12, 0.1);" onclick="addToPortfolioByTicker('${stock.ticker}', 'sell-', 'short')">📥 加入空單追蹤</button>
        `;
        sellGrid.appendChild(card);

        document.getElementById(`sell-cost-${stock.ticker}`).addEventListener('input', (e) => {
            calcStockUnified(stock.ticker, 'sell-');
        });
        document.getElementById(`sell-supp-${stock.ticker}`).addEventListener('input', () => calcStockUnified(stock.ticker, 'sell-'));
        document.getElementById(`sell-high-${stock.ticker}`).addEventListener('input', () => calcStockUnified(stock.ticker, 'sell-'));
        document.getElementById(`sell-shares-${stock.ticker}`).addEventListener('input', () => calcStockUnified(stock.ticker, 'sell-'));
        
        calcStockUnified(stock.ticker, 'sell-');
        fetchRealDataUnified(stock.ticker, stock.name, 'sell-');
    });
}


btnScanAI.addEventListener('click', async () => {
    btnScanAI.textContent = `⌛ 正在執行全市場動能掃描...`;
    btnScanAI.disabled = true;
    try {
        await renderStockCards(stockCountInput.value);
    } catch(e) {}
    btnScanAI.textContent = "⚡ 載入並同步真實盤後數據";
    btnScanAI.disabled = false;
});

document.getElementById('btnScanSell').addEventListener('click', async () => {
    const btnScanSell = document.getElementById('btnScanSell');
    btnScanSell.textContent = `⌛ 掃描中...`;
    btnScanSell.disabled = true;
    try {
        await renderSellCards(sellCountInput.value);
    } catch(e) {}
    btnScanSell.textContent = "⚡ 掃描市場轉弱/放空標的";
    btnScanSell.disabled = false;
});

buyPriceRange.addEventListener('change', () => renderStockCards(stockCountInput.value));
sellPriceRange.addEventListener('change', () => renderSellCards(sellCountInput.value));

window.addEventListener('DOMContentLoaded', () => {
    loadPortfolioFromStorage();
    renderStockCards(15);
});
