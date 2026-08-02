const API_BASE = "http://127.0.0.1:58889";
let scatterChart = null;

let allExperiments = [];

async function loadExperiments() {
    try {
        const res = await fetch(`${API_BASE}/api/analysis/experiments`);
        const json = await res.json();
        allExperiments = json.data || [];
        renderExperimentsList();
    } catch (e) {
        document.getElementById('experimentList').innerHTML = '<div style="color:#f85149; padding:20px;">無法連線至伺服器</div>';
    }
}

window.renderExperimentsList = function() {
    const listDiv = document.getElementById('experimentList');
    if (!listDiv) return;
    
    if (allExperiments.length === 0) {
        listDiv.innerHTML = '<div style="text-align:center; padding:20px; color:#8b949e;">目前尚無回測紀錄，請先至回測實驗室執行一次回測。</div>';
        return;
    }
    
    const sortVal = document.getElementById('sortExperiments').value;
    const sorted = [...allExperiments];
    if (sortVal === 'id') {
        sorted.sort((a, b) => b.id - a.id);
    } else {
        sorted.sort((a, b) => (b[sortVal] || 0) - (a[sortVal] || 0));
    }
    
    listDiv.innerHTML = '';
    sorted.forEach(exp => {
        const capStr = (exp.capital / 10000).toFixed(0) + "萬";
        const holdStr = exp.max_hold_days === 999 ? "無限制" : exp.max_hold_days + "天";
        
        const card = document.createElement('div');
        card.className = 'exp-card';
        card.onclick = () => loadTrades(exp.id, card);
        
        let oosBadge = exp.is_out_of_sample ? `<div class="badge-oos">OOS 盲測區間</div>` : '';
        
        const returnColor = exp.total_return >= 0 ? 'profit-pos' : 'profit-neg';
        const r2022Color = exp.return_2022 >= 0 ? 'profit-pos' : 'profit-neg';
        const r2023Color = exp.return_2023 >= 0 ? 'profit-pos' : 'profit-neg';
        
        card.innerHTML = `
            ${oosBadge}
            <div class="exp-title">方案 ${exp.exit_strategy} 測試 (ID: ${exp.id})</div>
            <div class="exp-meta">
                <span>${exp.start_date.substring(0,7)} ~ ${exp.end_date.substring(0,7)}</span>
                <span>${exp.timestamp.substring(0,16)}</span>
            </div>
            <div style="font-size:11px; color:#8b949e; margin-bottom:8px;">資金:${capStr} | 持倉:${exp.max_positions} | 期限:${holdStr}</div>
            <div class="exp-stats">
                <div class="stat-box">
                    <span>2022(空頭)</span>
                    <strong class="${r2022Color}">${exp.return_2022 ?? 0}%</strong>
                </div>
                <div class="stat-box">
                    <span>2023(多頭)</span>
                    <strong class="${r2023Color}">${exp.return_2023 ?? 0}%</strong>
                </div>
                <div class="stat-box">
                    <span>總報酬</span>
                    <strong class="${returnColor}">${exp.total_return}%</strong>
                </div>
            </div>
        `;
        listDiv.appendChild(card);
    });
}

async function loadTrades(expId, cardElement) {
    // UI Highlight
    document.querySelectorAll('.exp-card').forEach(c => c.classList.remove('active'));
    if(cardElement) cardElement.classList.add('active');
    
    try {
        const res = await fetch(`${API_BASE}/api/analysis/trades/${expId}`);
        const json = await res.json();
        const trades = json.data || [];
        
        // 1. Update Table
        const tbody = document.querySelector('#tradeTable tbody');
        tbody.innerHTML = '';
        if (trades.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">無交易紀錄</td></tr>';
        } else {
            trades.forEach(t => {
                const isProfit = t.pnl_pct >= 0;
                const pColor = isProfit ? '#f85149' : '#3fb950';
                tbody.innerHTML += `
                    <tr>
                        <td>${t.ticker} <span style="font-size:11px; color:#8b949e;">${t.name}</span></td>
                        <td>${t.buy_date.substring(5)}</td>
                        <td>${t.sell_date.substring(5)}</td>
                        <td>${t.hold_days}</td>
                        <td style="font-size:11px; color:#8b949e;">${t.macro_trend}</td>
                        <td style="color:${pColor}; font-weight:bold;">${t.pnl_pct}%</td>
                        <td style="color:#f85149;">${t.mfe}%</td>
                        <td style="color:#3fb950;">${t.mae}%</td>
                        <td style="font-size:11px;">${t.reason}</td>
                    </tr>
                `;
            });
        }
        
        // 2. Update Scatter Chart (MFE vs MAE)
        drawScatterChart(trades);
        
    } catch (e) {
        console.error(e);
    }
}

function drawScatterChart(trades) {
    const ctx = document.getElementById('scatterChart').getContext('2d');
    
    // Destroy previous instance
    if (scatterChart) {
        scatterChart.destroy();
    }
    
    // Prepare Data
    const winTrades = trades.filter(t => t.pnl > 0).map(t => ({ x: t.mae, y: t.mfe, t: t }));
    const lossTrades = trades.filter(t => t.pnl <= 0).map(t => ({ x: t.mae, y: t.mfe, t: t }));
    
    scatterChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: '獲利交易',
                    data: winTrades,
                    backgroundColor: 'rgba(248, 81, 73, 0.6)',
                    borderColor: '#f85149',
                    pointRadius: 6,
                    pointHoverRadius: 8
                },
                {
                    label: '虧損交易',
                    data: lossTrades,
                    backgroundColor: 'rgba(63, 185, 80, 0.6)',
                    borderColor: '#3fb950',
                    pointRadius: 6,
                    pointHoverRadius: 8
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'MAE 最大潛在虧損 (%)', color: '#8b949e' },
                    grid: { color: '#30363d' },
                    ticks: { color: '#8b949e' },
                    reverse: true // MAE is negative impact, reverse to show zero on right or just keep it standard
                },
                y: {
                    title: { display: true, text: 'MFE 最大潛在獲利 (%)', color: '#8b949e' },
                    grid: { color: '#30363d' },
                    ticks: { color: '#8b949e' }
                }
            },
            plugins: {
                legend: { labels: { color: '#c9d1d9' } },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            const d = ctx.raw.t;
                            return `${d.ticker} (${d.name}): 獲利 ${d.pnl_pct}%, MFE ${d.mfe}%, MAE ${d.mae}%, 理由: ${d.reason}`;
                        }
                    }
                }
            }
        }
    });
}

let holdChartInstance = null;
let posChartInstance = null;

async function loadAttribution() {
    try {
        const res = await fetch(`${API_BASE}/api/analysis/attribution`);
        const json = await res.json();
        
        if (json.status === 'success') {
            const contentDiv = document.getElementById('aiAttributionContent');
            if (!json.decisions || json.decisions.length === 0) {
                contentDiv.innerHTML = '<div style="color:#8b949e; text-align:center;">大數據樣本不足，請先跑完巨量排列組合回測。</div>';
            } else {
                contentDiv.innerHTML = json.decisions.map(d => `<div style="margin-bottom:8px;">${d}</div>`).join('');
            }
            
            drawHoldSensChart(json.hold_sens);
            drawPosSensChart(json.pos_sens);
        } else {
            document.getElementById('aiAttributionContent').innerHTML = `<div style="color:#f85149; text-align:center;">${json.message}</div>`;
        }
    } catch (e) {
        console.error(e);
        document.getElementById('aiAttributionContent').innerHTML = '<div style="color:#f85149; text-align:center;">無法載入 AI 歸因報告，伺服器連線失敗</div>';
    }
}

function drawHoldSensChart(data) {
    data.sort((a, b) => a.max_hold_days - b.max_hold_days);
    const cleanData = data.filter(d => d.max_hold_days <= 120); // Limit to 120 days for clear plotting
    
    const labels = cleanData.map(d => `${d.max_hold_days}天`);
    const returns = cleanData.map(d => d.total_return);
    const mdds = cleanData.map(d => d.mdd);
    
    const ctx = document.getElementById('holdSensChart').getContext('2d');
    if (holdChartInstance) holdChartInstance.destroy();
    
    holdChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '平均總報酬率 (%)',
                    data: returns,
                    borderColor: '#f85149',
                    backgroundColor: 'rgba(248, 81, 73, 0.1)',
                    tension: 0.2,
                    yAxisID: 'y',
                    fill: false
                },
                {
                    label: '平均最大回撤 (MDD %)',
                    data: mdds,
                    borderColor: '#2ea043',
                    backgroundColor: 'rgba(46, 160, 67, 0.1)',
                    tension: 0.2,
                    yAxisID: 'y1',
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { ticks: { color: '#8b949e', font: { size: 9 } }, grid: { color: '#30363d' } },
                y: { type: 'linear', position: 'left', ticks: { color: '#f85149', font: { size: 9 } }, grid: { color: '#30363d' } },
                y1: { type: 'linear', position: 'right', ticks: { color: '#2ea043', font: { size: 9 } }, grid: { drawOnChartArea: false } }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function drawPosSensChart(data) {
    data.sort((a, b) => a.max_positions - b.max_positions);
    const labels = data.map(d => `${d.max_positions}檔`);
    const mdds = data.map(d => d.mdd);
    
    const ctx = document.getElementById('posSensChart').getContext('2d');
    if (posChartInstance) posChartInstance.destroy();
    
    posChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '平均最大回撤 (MDD %)',
                    data: mdds,
                    backgroundColor: 'rgba(46, 160, 67, 0.6)',
                    borderColor: '#2ea043',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { ticks: { color: '#8b949e', font: { size: 9 } }, grid: { display: false } },
                y: { ticks: { color: '#2ea043', font: { size: 9 } }, grid: { color: '#30363d' } }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

// Init
loadExperiments();
loadAttribution();
