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
    return null;
}

function getAuthHeader() {
    const creds = getAuthCredentials();
    return creds ? creds.authHeader : "";
}

if (!getAuthCredentials()) {
    alert('請先登入後再查看下單建議！將帶您回首頁登入。');
    location.href = 'index.html';
    throw new Error('Unauthenticated: redirecting to index.html');
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

    // 總預算是 A（系統推薦）與 B（手動自訂）共用的一個池子：
    // B 目前已勾選要買進的金額，要從總預算裡先扣掉，剩下的才是給 A 用的額度。
    let manualBuyWan = 0;
    (manualOrders || []).forEach(o => {
        if (o.checked && o.type === 'buy') {
            manualBuyWan += (o.price * o.shares * 1000) / 10000;
        }
    });
    const cashForAuto = Math.max(0, cashVal - manualBuyWan);

    // 記住目前 A 清單裡的勾選狀態，以及「使用者自己手動調整過」的成交價量
    // （只保留真的被手動編輯過的價量，否則每次重新計算後，即使後端已經算出正確
    // 的縮減股數，也會被舊的股數覆蓋掉，導致預算沒有真的平均分配）
    const prevAutoByTicker = {};
    (autoOrders || []).forEach(o => {
        prevAutoByTicker[o.ticker] = { checked: o.checked, price: o.price, shares: o.shares, userEdited: !!o.userEdited };
    });

    const exitStrategySelect = document.getElementById('exitStrategySelect');
    const exitStrategy = exitStrategySelect ? exitStrategySelect.value : 'E';

    try {
        const res = await fetch(`${API_BASE_URL}/api/planner/recommendations?cash=${cashForAuto}&exit_strategy=${exitStrategy}`, {
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

                // 顯示目前套用的出場方案（2026-08-13起：不再依regime自動切換整包方案，
                // 個案研究⑤⑦⑧⑮證實切換設計反而輸給固定使用單一方案，改為使用者直接選）
                const strategyNote = document.getElementById('exitStrategyNote');
                if (strategyNote) {
                    const usedStrategy = data.exit_strategy || 'E';
                    const strategyLabels = { A: '方案A（固定%停損）', B: '方案B（關鍵支撐破位）', C: '方案C（動態收縮防線）', D: '方案D（自適應吊燈鎖利）', E: '方案E（快穩雙軌）' };
                    strategyNote.style.display = 'block';
                    strategyNote.textContent = `🛡️ 本次新建倉/加碼建議皆採用 ${strategyLabels[usedStrategy] || usedStrategy}，此規則會固定跟著該筆持倉到賣出為止。`;
                }

                // 1. Process Auto Orders (保留勾選狀態；只有使用者手動編輯過的價量才保留舊值，
                //    否則一律採用後端剛算好的新股數，確保 A 的預算縮減會真的反映出來)
                autoOrders = [];
                // Add buy orders
                data.buys.forEach(b => {
                    const prev = prevAutoByTicker[b.ticker];
                    const useEditedValues = prev && prev.userEdited;
                    autoOrders.push({
                        ticker: b.ticker,
                        name: formatStockName(b.ticker, b.name),
                        price: useEditedValues ? prev.price : b.price,
                        shares: useEditedValues ? prev.shares : b.shares, // in 張
                        type: 'buy',
                        stage: b.stage,
                        reason: '',
                        checked: prev ? prev.checked : true,
                        userEdited: useEditedValues,
                        atr: b.atr,
                        live_price: b.live_price,
                        gap_amount: b.gap_amount,
                        gap_atr_ratio: b.gap_atr_ratio,
                        exit_strategy: b.exit_strategy || 'E'
                    });
                });
                // Add sell orders
                data.sells.forEach(s => {
                    const prev = prevAutoByTicker[s.ticker];
                    const useEditedValues = prev && prev.userEdited;
                    autoOrders.push({
                        ticker: s.ticker,
                        name: formatStockName(s.ticker, s.name),
                        price: useEditedValues ? prev.price : s.price,
                        shares: useEditedValues ? prev.shares : s.shares, // in 張
                        type: 'sell',
                        stage: '',
                        reason: s.reason,
                        buy_price: s.buy_price,
                        pnl_pct: s.pnl_pct,
                        checked: prev ? prev.checked : true,
                        userEdited: useEditedValues
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
            } else {
                document.getElementById('targetTradingDay').textContent = '-';
                document.getElementById('autoOrderList').innerHTML = `<div style="color:var(--accent-green); text-align:center; padding:20px;">⚠️ ${data.message || '取得下單建議失敗。'}</div>`;
            }
        } else {
            let errMsg = `HTTP ${res.status}`;
            try {
                const errJson = await res.json();
                errMsg = errJson.detail || errMsg;
            } catch (je) {}
            const hint = (res.status === 401 || res.status === 403)
                ? '登入憑證可能已失效，請登出後重新登入一次。'
                : '請檢查伺服器連線。';
            document.getElementById('targetTradingDay').textContent = '-';
            document.getElementById('autoOrderList').innerHTML = `<div style="color:var(--accent-green); text-align:center; padding:20px;">⚠️ 無法取得下單建議 (${errMsg})<br>${hint}</div>`;
        }
    } catch (e) {
        console.error("載入下單中心數據失敗", e);
        document.getElementById('targetTradingDay').textContent = '-';
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

// 跳空/ATR比警示：推薦價是掃描當下的收盤價，使用者實際下單通常是隔一個交易日，這中間如果
// 開盤跳空，用推薦價去追價的風險就跟回測沒驗證過的價位差很多了。門檻依 ATR 倍數判斷：
// 0.5倍以內算正常雜訊、0.5~1倍提醒留意、1倍以上明確不建議追價（除非有明確利多支撐）。
function buildGapWarningHtml(o) {
    if (typeof o.gap_atr_ratio !== 'number' || !isFinite(o.gap_atr_ratio)) return '';
    const ratio = o.gap_atr_ratio;
    const absRatio = Math.abs(ratio);
    if (ratio <= 0 || absRatio < 0.5) return ''; // 持平、下跌、或跳空幅度在容許雜訊範圍內，不用特別警示

    const gapText = `現價 ${o.live_price} 元，較推薦時 (${o.price} 元) 高了 ${o.gap_amount} 元（${ratio.toFixed(2)} 倍 ATR）`;
    if (absRatio >= 1.0) {
        return `<div class="status-banner status-banner-danger status-banner-sm">🚨 跳空追高警示：${gapText}，已超過 1 倍 ATR，追價風險高，建議等拉回或放棄，除非有明確籌碼/消息面支撐</div>`;
    }
    return `<div class="status-banner status-banner-warning status-banner-sm">⚠️ 跳空提醒：${gapText}，追價前留意成本已偏高</div>`;
}

// Render Lists
function renderOrders() {
    // 0. Render Urgent Sell Signals (觸發停損/時間到期) — 獨立醒目區塊，跟一般加碼建議分開
    const urgentContainer = document.getElementById('urgentSellContainer');
    const urgentList = document.getElementById('urgentSellList');
    const urgentIndexes = [];
    if (urgentList) {
        urgentList.innerHTML = '';
        autoOrders.forEach((o, idx) => {
            if (o.type !== 'sell') return;
            urgentIndexes.push(idx);
            // 台股慣例：賺=紅、賠=綠，整個標題列直接反色塊，一眼看出是賺是賠
            const pnlPct = typeof o.pnl_pct === 'number' ? o.pnl_pct : null;
            const isProfit = pnlPct !== null ? pnlPct >= 0 : null;
            const headerBg = isProfit === null ? '#64748b' : (isProfit ? '#dc2626' : '#16a34a');
            const pnlText = pnlPct !== null ? `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%` : '';

            const div = document.createElement('div');
            div.className = 'order-card sell-card';
            div.style.cssText = 'display:block; padding:0; overflow:hidden; border:2px solid ' + headerBg + ';';
            div.innerHTML = `
                <div style="background:${headerBg}; color:#fff; padding:10px 15px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                    <span style="font-weight:bold; font-size:1.05rem;">
                        <input type="checkbox" id="autoCheck-${idx}" ${o.checked ? 'checked' : ''} onchange="toggleOrderCheck('auto', ${idx})" style="margin-right:6px;">
                        <label for="autoCheck-${idx}" style="cursor:pointer;">${o.name}</label>
                    </span>
                    <span style="font-weight:bold;">${pnlText}</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 15px; gap:10px; flex-wrap:wrap;">
                    <div class="order-info">
                        <div class="order-details">
                            動作: <b>賣出平倉 (原因: ${o.reason})</b> | 數量: <b>${(o.shares * 1000).toLocaleString()} 股</b> | 目前價: <b>${o.price} 元</b>${o.buy_price ? ` | 買進成本: <b>${o.buy_price} 元</b>` : ''}
                        </div>
                    </div>
                    <div class="order-actions">
                        <button class="btn-edit-order" onclick="openEditModal('auto', ${idx})">✏️ 調整成交</button>
                    </div>
                </div>
            `;
            urgentList.appendChild(div);
        });
        if (urgentContainer) urgentContainer.style.display = urgentIndexes.length > 0 ? 'block' : 'none';
    }

    // 1. Render Auto List (只留買進/加碼建議，急迫性賣出已經拉到上面獨立區塊)
    const autoList = document.getElementById('autoOrderList');
    autoList.innerHTML = '';

    const buyOnlyOrders = autoOrders.map((o, idx) => ({ o, idx })).filter(({ o }) => o.type === 'buy');

    if (buyOnlyOrders.length === 0) {
        autoList.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-sub);">明日大盤或個股籌碼無做多/做空訊號，建議觀望。</div>';
    } else {
        buyOnlyOrders.forEach(({ o, idx }) => {
            const costTwd = o.price * o.shares * 1000;
            const costWan = (costTwd / 10000).toFixed(2);
            const actionText = `<span style="color:var(--accent-green)">買進做多 (${o.stage})</span>`;
            const gapWarningHtml = buildGapWarningHtml(o);

            const div = document.createElement('div');
            div.className = 'order-card buy-card';
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
                    ${gapWarningHtml}
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

    // 總預算是 A + B 共用的：顯示總預算、B 已佔用多少、A 剩餘可用多少，超支時標紅提醒
    const budgetSummaryEl = document.getElementById('budgetSummary');
    if (budgetSummaryEl) {
        const totalWan = parseFloat(document.getElementById('cashInput').value) || 0;
        const manualWan = manualSum / 10000;
        const autoWan = autoSum / 10000;
        const availableForAutoWan = Math.max(0, totalWan - manualWan);
        const combinedWan = autoWan + manualWan;
        const overBudget = combinedWan > totalWan + 0.005;

        budgetSummaryEl.style.color = overBudget ? 'var(--accent-red)' : 'var(--text-sub)';
        budgetSummaryEl.innerHTML = `總預算 ${totalWan.toFixed(2)} 萬元｜B 手動掛單已佔用 ${manualWan.toFixed(2)} 萬元｜A 可用預算 ${availableForAutoWan.toFixed(2)} 萬元｜目前 A+B 合計已勾選 ${combinedWan.toFixed(2)} 萬元` +
            (overBudget ? `　⚠️ 已超出總預算 ${(combinedWan - totalWan).toFixed(2)} 萬元！` : '');

        // 步驟二按鈕旁邊也放一份合計，方便按下確認下單前最後確認
        const commitTotalEl = document.getElementById('commitCombinedTotal');
        if (commitTotalEl) {
            commitTotalEl.style.color = overBudget ? 'var(--accent-red)' : 'var(--text-sub)';
            commitTotalEl.textContent = `(A+B) = ${combinedWan.toFixed(2)} 萬元` + (overBudget ? ' ⚠️ 超支' : '');
        }
    }
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
    if (activeEditType === 'auto') {
        o.userEdited = true; // 使用者手動改過，之後重新計算 A 時要保留這筆的價量
    }

    const editedManual = activeEditType === 'manual';
    closeEditModal();

    if (editedManual) {
        // B 的金額變了，總預算裡留給 A 的額度也跟著變，重新跟後端算一次 A
        loadPlannerData();
    } else {
        renderOrders();
    }
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
// 2026-08-13修正：此清單原本只有60檔，跟app.js的AI_STOCKS_CONFIG(126檔)長期沒同步，
// 導致這頁對66檔股票的formatStockName()找不到中文名、只顯示股票代號。改成跟app.js
// 同步的126檔完整清單（欄位格式不同：這裡name不含代號前綴，formatStockName自己會組合）。
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
    { ticker: "2303", name: "聯電" }, { ticker: "6230", name: "尼得科超眾" },
    { ticker: "3081", name: "聯亞" }, { ticker: "3105", name: "穩懋" },
    { ticker: "2455", name: "全新" }, { ticker: "3163", name: "波若威" },
    { ticker: "3363", name: "上詮" }, { ticker: "6442", name: "光聖" },
    { ticker: "3380", name: "明泰" }, { ticker: "6830", name: "汎銓" },
    { ticker: "3587", name: "閎康" }, { ticker: "3289", name: "宜特" },
    { ticker: "1503", name: "士林電機" }, { ticker: "1513", name: "中興電工" },
    { ticker: "1514", name: "亞力電機" }, { ticker: "1519", name: "華城電機" },
    { ticker: "1560", name: "中砂科技" }, { ticker: "1609", name: "大亞電線電纜" },
    { ticker: "2301", name: "光寶科技" }, { ticker: "2337", name: "旺宏電子" },
    { ticker: "2355", name: "敬鵬工業" }, { ticker: "2385", name: "群光電子" },
    { ticker: "2404", name: "漢唐集成" }, { ticker: "2412", name: "中華電信" },
    { ticker: "2436", name: "偉詮電子" }, { ticker: "2458", name: "義隆電子" },
    { ticker: "2480", name: "敦陽科技" }, { ticker: "2492", name: "華新科技" },
    { ticker: "3005", name: "神基科技" }, { ticker: "3413", name: "京鼎精密" },
    { ticker: "3532", name: "台勝科" }, { ticker: "4755", name: "三福化工" },
    { ticker: "4958", name: "臻鼎-KY" }, { ticker: "5388", name: "中磊電子" },
    { ticker: "5434", name: "崇越科技" }, { ticker: "6166", name: "凌華科技" },
    { ticker: "6183", name: "關貿網路" }, { ticker: "6196", name: "帆宣系統" },
    { ticker: "6202", name: "盛群半導體" }, { ticker: "6206", name: "Flytech" },
    { ticker: "6214", name: "精誠資訊" }, { ticker: "6239", name: "力成科技" },
    { ticker: "6257", name: "矽格科技" }, { ticker: "6269", name: "台郡科技" },
    { ticker: "6285", name: "啟碁科技" }, { ticker: "6412", name: "群光電能" },
    { ticker: "6415", name: "矽力*-KY" }, { ticker: "6438", name: "迅得機械" },
    { ticker: "6533", name: "晶心科技" }, { ticker: "6719", name: "力智電子" },
    { ticker: "6770", name: "力積電" }, { ticker: "8081", name: "致新科技" },
    { ticker: "8114", name: "振樺電子" }, { ticker: "3227", name: "原相科技" },
    { ticker: "3374", name: "精材科技" }, { ticker: "3438", name: "類比科技" },
    { ticker: "3680", name: "家登精密" }, { ticker: "4979", name: "LuxNet" },
    { ticker: "4991", name: "GCS Holdings" }, { ticker: "5227", name: "立凱-KY" },
    { ticker: "5347", name: "世界先進" }, { ticker: "5483", name: "中美矽晶" },
    { ticker: "6182", name: "合晶科技" }, { ticker: "6223", name: "旺矽科技" },
    { ticker: "6488", name: "環球晶圓" }, { ticker: "6510", name: "中華精測" },
    { ticker: "8050", name: "廣積科技" }, { ticker: "8086", name: "宏捷科" },
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
    // B 多了一筆，留給 A 的預算變少了，重新跟後端算一次 A
    loadPlannerData();
}

function removeManualOrder(idx) {
    manualOrders.splice(idx, 1);
    // B 少了一筆，留給 A 的預算變多了，重新跟後端算一次 A
    loadPlannerData();
}

// Commit to portfolio.json and history.json
async function commitExecutedOrders() {
    const checkedAuto = autoOrders.filter(o => o.checked);
    const checkedManual = manualOrders.filter(o => o.checked);
    const checkedOrders = [...checkedAuto, ...checkedManual];
    
    if (checkedOrders.length === 0) {
        alert("❌ 左右兩欄中沒有勾選任何已成交項目！\n(有下單才勾選，無下單勿勾選！)");
        return;
    }
    
    const finalConfirm = confirm(`確定要將已勾選的 ${checkedOrders.length} 筆成交交易記入庫存與歷史紀錄嗎？\n(包含系統推薦 ${checkedAuto.length} 筆，手動自訂 ${checkedManual.length} 筆)`);
    if (!finalConfirm) return;
    
    // Format payload
    const payload = {
        orders: checkedOrders.map(o => ({
            ticker: o.ticker,
            name: o.name,
            price: o.price,
            shares: o.shares, // float 張
            type: o.type,
            reason: o.reason || o.stage || "實戰下單",
            exit_strategy: o.exit_strategy || 'E'
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
                // Refresh planner
                loadPlannerData();
            } else {
                alert(`❌ 記帳失敗: ${data.message}`);
            }
        } else {
            alert(`❌ 伺服器錯誤，記帳失敗。`);
        }
    } catch (e) {
        console.error("Commit 失敗", e);
    }
}

window.commitAllOrders = commitExecutedOrders;

// Initialize Page Data
loadPlannerData();
