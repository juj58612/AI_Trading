const API_BASE = "http://127.0.0.1:58889";
let scatterChart = null;

async function loadExperiments() {
    try {
        const res = await fetch(`${API_BASE}/api/analysis/experiments`);
        const json = await res.json();
        const listDiv = document.getElementById('experimentList');
        
        if (!json.data || json.data.length === 0) {
            listDiv.innerHTML = '<div style="text-align:center; padding:20px; color:#8b949e;">目前尚無回測紀錄，請先至回測實驗室執行一次回測。</div>';
            return;
        }
        
        listDiv.innerHTML = '';
        json.data.forEach(exp => {
            const isProfit = exp.total_return > 0;
            const returnColor = isProfit ? 'profit-pos' : 'profit-neg';
            
            const capStr = (exp.capital / 10000).toFixed(0) + "萬";
            const holdStr = exp.max_hold_days === 999 ? "無限制" : exp.max_hold_days + "天";
            
            const card = document.createElement('div');
            card.className = 'exp-card';
            card.onclick = () => loadTrades(exp.id, card);
            card.innerHTML = `
                <div class="exp-title">方案 ${exp.exit_strategy} 測試</div>
                <div class="exp-meta">
                    <span>${exp.start_date.substring(0,7)} ~ ${exp.end_date.substring(0,7)}</span>
                    <span>${exp.timestamp.substring(0,16)}</span>
                </div>
                <div style="font-size:11px; color:#8b949e; margin-bottom:8px;">資金:${capStr} | 持倉:${exp.max_positions} | 期限:${holdStr}</div>
                <div class="exp-stats">
                    <div class="stat-box">
                        <span>總報酬率</span>
                        <strong class="${returnColor}">${exp.total_return}%</strong>
                    </div>
                    <div class="stat-box">
                        <span>勝率</span>
                        <strong>${exp.win_rate}%</strong>
                    </div>
                    <div class="stat-box">
                        <span>MDD</span>
                        <strong>${exp.mdd}%</strong>
                    </div>
                </div>
            `;
            listDiv.appendChild(card);
        });
    } catch (e) {
        console.error(e);
        document.getElementById('experimentList').innerHTML = '<div style="color:#f85149; padding:20px;">無法連線至伺服器</div>';
    }
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
                const isProfit = t.pnl_pct > 0;
                const pColor = isProfit ? '#3fb950' : '#f85149';
                tbody.innerHTML += `
                    <tr>
                        <td>${t.ticker} <span style="font-size:11px; color:#8b949e;">${t.name}</span></td>
                        <td>${t.buy_date.substring(5)}</td>
                        <td>${t.sell_date.substring(5)}</td>
                        <td>${t.hold_days}</td>
                        <td style="color:${pColor}; font-weight:bold;">${t.pnl_pct}%</td>
                        <td style="color:#3fb950;">${t.mfe}%</td>
                        <td style="color:#f85149;">${t.mae}%</td>
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
                    backgroundColor: 'rgba(63, 185, 80, 0.6)',
                    borderColor: '#3fb950',
                    pointRadius: 6,
                    pointHoverRadius: 8
                },
                {
                    label: '虧損交易',
                    data: lossTrades,
                    backgroundColor: 'rgba(248, 81, 73, 0.6)',
                    borderColor: '#f85149',
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

// Init
loadExperiments();
