// State variables
let autoOrders = [];
let manualOrders = [];
let filteredBuys = []; // Scheme A backups

let activeEditType = ''; // 'auto' or 'manual'
let activeEditIndex = -1;

function getAuthCredentials() {
    const saved = localStorage.getItem('ai_trading_user');
    if (saved) {
        try { return JSON.parse(saved); } catch(e) {}
    }
    return { username: "cyc58612", authHeader: "Basic " + btoa("cyc58612:***REMOVED_LEAKED_PASSWORD***") };
}

function getAuthHeader() {
    const creds = getAuthCredentials();
    return creds ? creds.authHeader : "";
}

// Helper to look up and format stock Chinese names
function formatStockName(ticker, currentName) {
    if (!ticker) return currentName || '';
    // Look up in STOCKS_CONFIG
    const match = STOCKS_CONFIG.find(s => s.ticker === ticker);
    if (match) {
        // If currentName is just ticker, replace it. Otherwise format nicely
        return `${ticker} ${match.name}`;
    }
    return currentName || ticker;
}

// Fetch data on load
async function loadPlannerData() {
    const cashVal = parseFloat(document.getElementById('cashInput').value) || 100;
    
    try {
        const res = await fetch(`${API_BASE_URL}/api/planner/recommendations?cash=${cashVal}`, {
            headers: { 'Authorization': getAuthHeader() }
        });
        
        if (res.ok) {
            const data = await res.json();
            if (data.status === 'success') {
                document.getElementById('targetTradingDay').textContent = data.target_day;
                
                // Render Market Weather Banner
                const weatherBanner = document.getElementById('marketWeatherBanner');
                if (weatherBanner && data.market_status) {
                    const statusColor = data.market_color;
                    let solidBg = statusColor;
                    let borderCol = statusColor;
                    if (statusColor === '#ef4444') { solidBg = '#dc2626'; borderCol = '#b91c1c'; }
                    else if (statusColor === '#10b981') { solidBg = '#16a34a'; borderCol = '#15803d'; }
                    else if (statusColor === '#f97316') { solidBg = '#ea580c'; borderCol = '#c2410c'; }
                    else if (statusColor === '#f59e0b') { solidBg = '#d97706'; borderCol = '#b45309'; }
                    else { solidBg = '#059669'; borderCol = '#047857'; }

                    weatherBanner.style.background = solidBg;
                    weatherBanner.style.borderColor = borderCol;
                    weatherBanner.style.color = '#ffffff';
                    weatherBanner.style.boxShadow = '0 4px 16px rgba(0,0,0,0.3)';
                    weatherBanner.style.padding = '16px 20px';
                    weatherBanner.style.borderRadius = '12px';
                    weatherBanner.innerHTML = `當前市況：${data.market_status} (AI 族群健康度：${data.health_ratio.toFixed(1)}%)<br><span style="font-size:0.95rem; font-weight:500; color: rgba(255, 255, 255, 0.95); margin-top: 4px; display: inline-block;">建議：${data.market_advice}</span>`;
                    weatherBanner.style.display = 'block';
                }
                
                // 1. Process Auto Orders
                autoOrders = [];
                // Add buy orders
                data.buys.forEach(b => {
                    autoOrders.push({
                        ticker: b.ticker,
                        name: formatStockName(b.ticker, b.name),
                        price: b.price,
                        shares: b.shares, // in 張
                        type: 'buy',
                        stage: b.stage,
                        reason: '',
                        checked: true
                    });
                });
                // Add sell orders
                data.sells.forEach(s => {
                    autoOrders.push({
                        ticker: s.ticker,
                        name: formatStockName(s.ticker, s.name),
                        price: s.price,
                        shares: s.shares, // in 張
                        type: 'sell',
                        stage: '',
                        reason: s.reason,
                        checked: true
                    });
                });
                
                // 2. Manual Orders start empty by default (no cloning left column)
                if (!manualOrders || manualOrders.length === 0) {
                    manualOrders = [];
                }
                
                // 3. Process filtered backups
                filteredBuys = data.filtered_buys.map(fb => ({
                    ...fb,
                    name: formatStockName(fb.ticker, fb.name)
                }));
                
                // Render Warnings if any
                renderWarnings(data.warning);
                
                // Render both columns
                renderOrders();
            }
        }
    } catch (e) {
        console.error("載入下單中心數據失敗", e);
        document.getElementById('autoOrderList').innerHTML = '<div style="color:var(--accent-green); text-align:center; padding:20px;">無法取得推薦數據，請檢查伺服器連線。</div>';
    }
}

// Render warnings and Scheme A backup text
function renderWarnings(apiWarning) {
    const container = document.getElementById('budgetWarningContainer');
    container.innerHTML = '';
    
    let html = '';
    
    // Show API scan cache warning if present
    if (apiWarning) {
        html += `<div style="background:rgba(239,68,68,0.1); border:1px dashed var(--accent-green); color:var(--accent-green); padding:10px; border-radius:6px; margin-bottom:12px;">${apiWarning}</div>`;
    }
    
    // Show Scheme A backups (filtered buys due to budget limit)
    if (filteredBuys && filteredBuys.length > 0) {
        html += `
            <div class="budget-warning-box">
                <strong>💡 資金不足自動剔除之備份標的 (方案 A 參考)：</strong><br>
                ${filteredBuys.map(fb => {
                    const costWan = (fb.price * fb.shares * 1000 / 10000).toFixed(1);
                    return `• <b>${fb.name}</b> (預估價格 ${fb.price} 元 | 推薦 <b>${(fb.shares * 1000).toLocaleString()} 股</b> | 需資金約 ${costWan} 萬元 | 籌碼積分 +${fb.score})`;
                }).join('<br>')}
                <br><span style="font-size:0.75rem; color:var(--text-sub); margin-top:4px; display:inline-block;">※ 如明日補足交割款，可點選右側「新增自訂交易」手動下單上述備用標的。</span>
            </div>
        `;
    }
    
    if (html) {
        container.innerHTML = html;
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }
}

// Render Lists
function renderOrders() {
    // 1. Render Auto List
    const autoList = document.getElementById('autoOrderList');
    autoList.innerHTML = '';
    
    if (autoOrders.length === 0) {
        autoList.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-sub);">明日大盤或個股籌碼無做多/做空訊號，建議觀望。</div>';
    } else {
        autoOrders.forEach((o, idx) => {
            const isBuy = o.type === 'buy';
            const costTwd = o.price * o.shares * 1000;
            const costWan = (costTwd / 10000).toFixed(2);
            const cardClass = isBuy ? 'buy-card' : 'sell-card';
            const actionText = isBuy ? `<span style="color:var(--accent-green)">買進做多 (${o.stage})</span>` : `<span style="color:var(--accent-red)">賣出平倉 (原因: ${o.reason})</span>`;
            
            const div = document.createElement('div');
            div.className = `order-card ${cardClass}`;
            div.innerHTML = `
                <div class="order-info">
                    <div class="order-ticker">
                        <input type="checkbox" id="autoCheck-${idx}" ${o.checked ? 'checked' : ''} onchange="toggleOrderCheck('auto', ${idx})">
                        <label for="autoCheck-${idx}" style="cursor:pointer; margin-left:6px;">${o.name}</label>
                    </div>
                    <div class="order-details">
                        動作: ${actionText} | 推薦量: <b>${(o.shares * 1000).toLocaleString()} 股</b> | 預定價: <b>${o.price} 元</b><br>
                        預估交割金額: <b>${costTwd.toLocaleString('zh-TW')} 元</b> (約 ${costWan} 萬元)
                    </div>
                </div>
                <div class="order-actions">
                    <button class="btn-edit-order" onclick="openEditModal('auto', ${idx})">✏️ 調整成交</button>
                </div>
            `;
            autoList.appendChild(div);
        });
    }

    // 2. Render Manual List
    const manualList = document.getElementById('manualOrderList');
    manualList.innerHTML = '';
    
    if (manualOrders.length === 0) {
        manualList.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-sub);">無手訂交易。可點選上方「新增自訂交易」手動掛單。</div>';
    } else {
        manualOrders.forEach((o, idx) => {
            const isBuy = o.type === 'buy';
            const costTwd = o.price * o.shares * 1000;
            const costWan = (costTwd / 10000).toFixed(2);
            const cardClass = isBuy ? 'buy-card' : 'sell-card';
            const actionText = isBuy ? `<span style="color:var(--accent-green)">自訂買進</span>` : `<span style="color:var(--accent-red)">自訂賣出 (原因: ${o.reason || '手動'})</span>`;
            
            const div = document.createElement('div');
            div.className = `order-card ${cardClass}`;
            div.innerHTML = `
                <div class="order-info">
                    <div class="order-ticker">
                        <input type="checkbox" id="manualCheck-${idx}" ${o.checked ? 'checked' : ''} onchange="toggleOrderCheck('manual', ${idx})">
                        <label for="manualCheck-${idx}" style="cursor:pointer; margin-left:6px;">${o.name}</label>
                    </div>
                    <div class="order-details">
                        動作: ${actionText} | 股數: <b>${(o.shares * 1000).toLocaleString()} 股</b> | 單價: <b>${o.price} 元</b><br>
                        預估交割金額: <b>${costTwd.toLocaleString('zh-TW')} 元</b> (約 ${costWan} 萬元)
                    </div>
                </div>
                <div class="order-actions">
                    <button class="btn-edit-order" onclick="openEditModal('manual', ${idx})">✏️ 調整</button>
                    <button class="btn-gray" style="padding:4px 8px; font-size:0.8rem;" onclick="removeManualOrder(${idx})">🗑️ 刪除</button>
                </div>
            `;
            manualList.appendChild(div);
        });
    }

    // Update Totals
    updateTotalCosts();
}

// Calculate and display active totals
function updateTotalCosts() {
    let autoSum = 0;
    autoOrders.forEach(o => {
        if (o.checked && o.type === 'buy') {
            autoSum += o.price * o.shares * 1000;
        }
    });
    document.getElementById('autoTotalCost').textContent = `預估所需資金：${(autoSum / 10000).toFixed(2)} 萬元`;

    let manualSum = 0;
    manualOrders.forEach(o => {
        if (o.checked && o.type === 'buy') {
            manualSum += o.price * o.shares * 1000;
        }
    });
    document.getElementById('manualTotalCost').textContent = `預估所需資金：${(manualSum / 10000).toFixed(2)} 萬元`;
}

// Toggle checkbox state
function toggleOrderCheck(type, idx) {
    if (type === 'auto') {
        autoOrders[idx].checked = !autoOrders[idx].checked;
    } else {
        manualOrders[idx].checked = !manualOrders[idx].checked;
    }
    updateTotalCosts();
}

// Edit Price/Shares Modal Control
function openEditModal(type, index) {
    activeEditType = type;
    activeEditIndex = index;
    
    const o = type === 'auto' ? autoOrders[index] : manualOrders[index];
    
    document.getElementById('modalTitle').textContent = `✏️ 調整 ${o.name} 實際成交價量`;
    document.getElementById('modalPrice').value = o.price;
    document.getElementById('modalShares').value = Math.round(o.shares * 1000);
    
    const reasonGroup = document.getElementById('reasonGroup');
    if (o.type === 'sell') {
        reasonGroup.style.display = 'block';
        document.getElementById('modalReason').value = o.reason || '時間到期';
    } else {
        reasonGroup.style.display = 'none';
    }
    
    document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
}

function saveOrderEdits() {
    const price = parseFloat(document.getElementById('modalPrice').value) || 0;
    const sharesVal = parseFloat(document.getElementById('modalShares').value) || 0;
    
    if (price <= 0 || sharesVal <= 0) {
        alert("價格與股數必須大於 0！");
        return;
    }
    
    const sharesZhang = sharesVal / 1000.0;
    const o = activeEditType === 'auto' ? autoOrders[activeEditIndex] : manualOrders[activeEditIndex];
    
    o.price = price;
    o.shares = sharesZhang;
    if (o.type === 'sell') {
        o.reason = document.getElementById('modalReason').value;
    }
    
    closeEditModal();
    renderOrders();
}

// Manual Add Modal Control
function openManualAddModal() {
    document.getElementById('addTicker').value = '';
    document.getElementById('addName').value = '';
    document.getElementById('addPrice').value = '';
    document.getElementById('addShares').value = '';
    document.getElementById('manualAddModal').style.display = 'flex';
}

function closeManualAddModal() {
    document.getElementById('manualAddModal').style.display = 'none';
}

// Auto fill stock name based on config
const STOCKS_CONFIG = [
    { ticker: "2330", name: "台積電" }, { ticker: "2317", name: "鴻海" },
    { ticker: "2382", name: "廣達" }, { ticker: "3231", name: "緯創" },
    { ticker: "6669", name: "緯穎" }, { ticker: "2376", name: "技嘉" },
    { ticker: "2356", name: "英業達" }, { ticker: "2324", name: "仁寶" },
    { ticker: "3706", name: "神達" }, { ticker: "2357", name: "華碩" },
    { ticker: "2353", name: "宏碁" }, { ticker: "3017", name: "奇鋐" },
    { ticker: "3324", name: "雙鴻" }, { ticker: "2421", name: "建準" },
    { ticker: "3653", name: "健策" }, { ticker: "3338", name: "泰碩" },
    { ticker: "8996", name: "高力" }, { ticker: "3013", name: "晟銘電" },
    { ticker: "6117", name: "迎廣" }, { ticker: "3693", name: "營邦" },
    { ticker: "8210", name: "勤誠" }, { ticker: "2059", name: "川湖" },
    { ticker: "2308", name: "台達電" }, { ticker: "6282", name: "康舒" },
    { ticker: "2345", name: "智邦" }, { ticker: "2368", name: "金像電" },
    { ticker: "3044", name: "健鼎" }, { ticker: "2313", name: "華通" },
    { ticker: "3037", name: "欣興" }, { ticker: "8046", name: "南電" },
    { ticker: "3189", name: "景碩" }, { ticker: "2383", name: "台光電" },
    { ticker: "6274", name: "台燿" }, { ticker: "6213", name: "聯茂" },
    { ticker: "3661", name: "世芯-KY" }, { ticker: "3443", name: "創意" },
    { ticker: "3035", name: "智原" }, { ticker: "6643", name: "M31" },
    { ticker: "3529", name: "力旺" }, { ticker: "6531", name: "愛普*" },
    { ticker: "2454", name: "聯發科" }, { ticker: "3034", name: "聯詠" },
    { ticker: "8299", name: "群聯" }, { ticker: "5269", name: "祥碩" },
    { ticker: "4966", name: "譜瑞-KY" }, { ticker: "3711", name: "日月光投控" },
    { ticker: "2449", name: "京元電子" }, { ticker: "3131", name: "弘塑" },
    { ticker: "3583", name: "辛耘" }, { ticker: "6187", name: "萬潤" },
    { ticker: "6515", name: "穎崴" }, { ticker: "2360", name: "致茂" },
    { ticker: "3533", name: "嘉澤" }, { ticker: "2359", name: "所羅門" },
    { ticker: "6414", name: "樺漢" }, { ticker: "2395", name: "研華" },
    { ticker: "6139", name: "亞翔" }, { ticker: "5443", name: "均豪" },
    { ticker: "2303", name: "聯電" }, { ticker: "6230", name: "尼得科超眾" }
];

window.autoFillTickerNameAndPrice = function() {
    const ticker = document.getElementById('addTicker').value.trim();
    if (!ticker) return;
    
    const match = STOCKS_CONFIG.find(s => s.ticker === ticker);
    if (match) {
        document.getElementById('addName').value = `${ticker} ${match.name}`;
    }
    
    // Check local loaded recommendations first
    const foundInAuto = autoOrders.find(o => o.ticker === ticker);
    const foundInFiltered = filteredBuys.find(o => o.ticker === ticker);
    
    if (foundInAuto && foundInAuto.price > 0) {
        document.getElementById('addPrice').value = foundInAuto.price;
        calcManualShares();
        return;
    }
    if (foundInFiltered && foundInFiltered.price > 0) {
        document.getElementById('addPrice').value = foundInFiltered.price;
        calcManualShares();
        return;
    }
    
    fetch(`${API_BASE_URL}/api/stock/${ticker}`)
        .then(res => res.json())
        .then(data => {
            const px = data ? (data.latest_close || data.closePrice || data.price || 0) : 0;
            if (px > 0) {
                document.getElementById('addPrice').value = px;
                if (data.name && !document.getElementById('addName').value) {
                    document.getElementById('addName').value = `${ticker} ${data.name}`;
                }
                calcManualShares();
            }
        }).catch(e => {});
};

window.calcManualShares = function() {
    const price = parseFloat(document.getElementById('addPrice').value) || 0;
    const budgetWan = parseFloat(document.getElementById('addBudget').value) || 0;
    
    if (price > 0 && budgetWan > 0) {
        const budgetTwd = budgetWan * 10000;
        const sharesExact = budgetTwd / (price * 1.0015);
        const sharesRounded = Math.max(1, Math.round(sharesExact));
        document.getElementById('addShares').value = sharesRounded;
        const zhang = (sharesRounded / 1000).toFixed(3);
        const zhangElem = document.getElementById('addSharesZhangNotice');
        if (zhangElem) zhangElem.textContent = `(約 ${zhang} 張 / ${sharesRounded.toLocaleString()} 股)`;
    }
};

function addManualOrderToList() {
    const ticker = document.getElementById('addTicker').value.trim();
    const name = document.getElementById('addName').value.trim();
    const type = document.getElementById('addType').value;
    const price = parseFloat(document.getElementById('addPrice').value) || 0;
    const sharesVal = parseFloat(document.getElementById('addShares').value) || 0;
    
    if (!ticker || !name || price <= 0 || sharesVal <= 0) {
        alert("請完整輸入正確的股票、價格與股數！");
        return;
    }
    
    manualOrders.push({
        ticker: ticker,
        name: name,
        price: price,
        shares: sharesVal / 1000.0,
        type: type,
        stage: type === 'buy' ? '手動建倉' : '',
        reason: type === 'sell' ? '手動出場' : '',
        checked: true
    });
    
    closeManualAddModal();
    renderOrders();
}

function removeManualOrder(idx) {
    manualOrders.splice(idx, 1);
    renderOrders();
}

// Commit to portfolio.json and history.json
async function commitExecutedOrders() {
    // Prompt to verify which list to commit
    const choice = confirm("請確認是否要將勾選的「✍️ 手動自訂掛單」成交明細寫入庫存？\n(取消則改為寫入「🤖 系統自動推薦掛單」成交明細)");
    
    const targetList = choice ? manualOrders : autoOrders;
    const listLabel = choice ? "手動自訂" : "系統自動";
    
    const checkedOrders = targetList.filter(o => o.checked);
    if (checkedOrders.length === 0) {
        alert(`❌ 您所選的 [${listLabel}] 清單中沒有勾選任何已成交項目！`);
        return;
    }
    
    const finalConfirm = confirm(`確定要將 [${listLabel}] 的 ${checkedOrders.length} 筆成交交易記入實戰帳本嗎？\n(此動作會扣減現金、更新庫存階段並結算歷史損益)`);
    if (!finalConfirm) return;
    
    // Format payload
    const payload = {
        orders: checkedOrders.map(o => ({
            ticker: o.ticker,
            name: o.name,
            price: o.price,
            shares: o.shares, // float 張
            type: o.type,
            reason: o.reason || o.stage || "實戰下單"
        }))
    };
    
    try {
        const res = await fetch(`${API_BASE_URL}/api/planner/commit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': getAuthHeader()
            },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            const data = await res.json();
            if (data.status === 'success') {
                alert(`🎉 恭喜！下單記帳成功！\n${data.message}`);
                // Refresh
                loadPlannerData();
            } else {
                alert(`❌ 記帳失敗: ${data.message}`);
            }
        } else {
            alert(`❌ 伺服器錯誤，記帳失敗。`);
        }
    } catch (e) {
        console.error("Commit 失敗", e);
        alert(`❌ 連線失敗，無法寫入庫存檔案。`);
    }
}

// Initialize Page Data
loadPlannerData();
