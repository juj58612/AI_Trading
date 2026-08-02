const BACKTEST_API_URL = (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost" || window.location.protocol === "file:")
    ? "http://127.0.0.1:58889"
    : window.location.origin;

const API_BASE_URL = (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost" || window.location.protocol === "file:")
    ? "http://127.0.0.1:58888"
    : window.location.origin;

const btnSyncDB = document.getElementById('btnSyncDB');
const dbDateStatus = document.getElementById('dbDateStatus');
const btnRunBacktest = document.getElementById('btnRunBacktest');
const lbBody = document.getElementById('lbBody');
const emptyRow = document.getElementById('emptyRow');

function initDateDropdowns(prefix, defaultDate) {
    const ySel = document.getElementById(`bt${prefix}Year`);
    const mSel = document.getElementById(`bt${prefix}Month`);
    const dSel = document.getElementById(`bt${prefix}Day`);
    
    // Years: 2010 to 2026
    for (let y = 2010; y <= 2026; y++) ySel.add(new Option(y + "年", y));
    // Months: 1 to 12
    for (let m = 1; m <= 12; m++) mSel.add(new Option(m + "月", m.toString().padStart(2, '0')));
    // Days: 1 to 31
    for (let d = 1; d <= 31; d++) dSel.add(new Option(d + "日", d.toString().padStart(2, '0')));
    
    const [defY, defM, defD] = defaultDate.split('-');
    ySel.value = defY;
    mSel.value = defM;
    dSel.value = defD;
}

function getDateStr(prefix) {
    const y = document.getElementById(`bt${prefix}Year`).value;
    const m = document.getElementById(`bt${prefix}Month`).value;
    const d = document.getElementById(`bt${prefix}Day`).value;
    return `${y}-${m}-${d}`;
}

let leaderboardData = [];

// Check DB Status on load
async function checkDbStatus() {
    try {
        const res = await fetch(`${BACKTEST_API_URL}/api/backtest/status`);
        const data = await res.json();
        if (data.status === 'ok') {
            dbDateStatus.innerHTML = `<span style="color: #4ade80;">✅ 已就緒 (最後更新: ${data.last_updated})</span>`;
        } else {
            dbDateStatus.innerHTML = `<span style="color: #f87171;">❌ 找不到資料庫，請點擊同步</span>`;
        }
    } catch (e) {
        dbDateStatus.innerHTML = `<span style="color: #f87171;">❌ 無法連線至回測引擎 (Port 58889)</span>`;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    checkDbStatus();
    initDateDropdowns('Start', '2021-01-01');
    initDateDropdowns('End', '2026-08-01');
    renderMegaDays();
});

// Sync DB
btnSyncDB.addEventListener('click', async () => {
    btnSyncDB.disabled = true;
    const originalText = btnSyncDB.textContent;
    btnSyncDB.textContent = '⏳ 正在斷點續傳歷史資料 (中斷可接續)...';
    
    try {
        const start = getDateStr('Start');
        const end = getDateStr('End');
        
        const res = await fetch(`${BACKTEST_API_URL}/api/backtest/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ start_date: start, end_date: end })
        });
        
        if (res.ok) {
            alert("✅ 歷史資料庫同步完成！");
            checkDbStatus();
        } else {
            const error = await res.json();
            alert("❌ 同步失敗: " + (error.detail || "未知錯誤"));
        }
    } catch (e) {
        alert("❌ 無法連線至伺服器");
    }
    
    btnSyncDB.disabled = false;
    btnSyncDB.textContent = originalText;
});

// Run Backtest
btnRunBacktest.addEventListener('click', async () => {
    btnRunBacktest.disabled = true;
    const originalText = btnRunBacktest.textContent;
    btnRunBacktest.textContent = '⏳ 正在執行歷史回測...';
    
    const payload = {
        capital: parseFloat(document.getElementById('btCapital').value.replace(/,/g, '')),
        max_positions: parseInt(document.getElementById('btMaxPositions').value),
        fee_rate: parseFloat(document.getElementById('btFee').value),
        start_date: getDateStr('Start'),
        end_date: getDateStr('End'),
        max_hold_days: parseInt(document.getElementById('btMaxHoldDays').value),
        exit_strategy: document.getElementById('btExitStrategy').value
    };
    
    try {
        const res = await fetch(`${BACKTEST_API_URL}/api/backtest/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            const result = await res.json();
            
            // Format parameter string
            const capStr = (payload.capital / 10000).toFixed(0) + "萬";
            const holdStr = payload.max_hold_days === 999 ? "無限制" : payload.max_hold_days + "天";
            const paramStr = `${payload.start_date} ~ ${payload.end_date}<br><span style="color:#9ca3af; font-size:0.85em;">資金:${capStr} | 持倉:${payload.max_positions}檔 | 期限:${holdStr}</span>`;

            // Add to leaderboard
            const record = {
                strategy: document.getElementById('btExitStrategy').options[document.getElementById('btExitStrategy').selectedIndex].text,
                paramsHtml: paramStr,
                trades: result.metrics.total_trades,
                winrate: result.metrics.win_rate,
                pf: result.metrics.profit_factor,
                mdd: result.metrics.mdd,
                return: result.metrics.total_return,
                daily_equity: result.daily_equity,
                capital: payload.capital,
                trades_detail: result.trades // Store for export
            };
            
            leaderboardData.push(record);
            renderLeaderboard();
            if (record.daily_equity && record.daily_equity.length > 0) {
                document.getElementById('chartContainer').style.display = 'block';
                renderChart(leaderboardData.length - 1);
            }
        } else {
            const err = await res.json();
            alert("❌ 回測失敗: " + err.detail);
        }
    } catch (e) {
        alert("❌ 無法連線至伺服器");
    }
    
    btnRunBacktest.disabled = false;
    btnRunBacktest.textContent = originalText;
});

window.runGridSearch = async function() {
    const btn = document.getElementById('btnRunGridSearch');
    if (!btn) return;
    const originalText = btn.textContent;
    btn.textContent = "⏳ AI 網格運算中 (約需 10~30 秒)...";
    btn.disabled = true;

    try {
        const payload = {
            capital: parseFloat(document.getElementById('btCapital').value.replace(/,/g, '')),
            fee_rate: parseFloat(document.getElementById('btFee').value),
            start_date: `${document.getElementById('btStartYear').value}-${document.getElementById('btStartMonth').value}-${document.getElementById('btStartDay').value}`,
            end_date: `${document.getElementById('btEndYear').value}-${document.getElementById('btEndMonth').value}-${document.getElementById('btEndDay').value}`
        };

        const res = await fetch(`${BACKTEST_API_URL}/api/backtest/grid_search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            alert("網格搜索完成！請前往「大數據戰情室」查看最新結果分佈圖！");
            window.location.href = "analysis.html";
        } else {
            const err = await res.json();
            alert(`執行失敗: ${err.detail}`);
        }
    } catch (e) {
        console.error(e);
        alert(`連線失敗: ${e.message}`);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
};

function renderLeaderboard() {
    if (emptyRow) emptyRow.style.display = 'none';
    
    // Sort by return (or could be sharpe/mdd)
    // Here we find the best one by combining Return and MDD
    // Simple score: Return - MDD (higher is better)
    let bestIndex = -1;
    let bestScore = -9999;
    
    leaderboardData.forEach((row, idx) => {
        const score = row.return - (row.mdd * 2); // Penalize MDD
        if (score > bestScore) {
            bestScore = score;
            bestIndex = idx;
        }
    });
    
    // Reverse so newest is top, but keep best highlighted
    const tbody = document.getElementById('lbBody');
    tbody.innerHTML = '';
    
    // To display newest first
    const reversedData = [...leaderboardData].reverse();
    const reversedBestIndex = leaderboardData.length - 1 - bestIndex;
    
    reversedData.forEach((row, i) => {
        const isBest = (i === reversedBestIndex && leaderboardData.length > 1);
        
        const tr = document.createElement('tr');
        if (isBest) tr.className = 'best-row';
        
        const winColor = row.winrate > 50 ? '#ef4444' : '#22c55e'; // TW standard
        const retColor = row.return > 0 ? '#ef4444' : (row.return < 0 ? '#22c55e' : '#fff');
        
        tr.innerHTML = `
            <td>${row.strategy} ${isBest ? '👑' : ''}</td>
            <td style="font-size: 0.9em; line-height: 1.4;">${row.paramsHtml}</td>
            <td>${row.trades}</td>
            <td style="color: ${winColor}">${row.winrate}%</td>
            <td style="font-size: 0.9em; line-height: 1.4;">${row.paramsHtml || '-'}</td>
            <td>${row.trades || row.total_trades || '-'}</td>
            <td style="color: ${winColor}">${row.winrate || row.win_rate || 0}%</td>
            <td>${row.pf || row.profit_factor || 0}</td>
            <td>${row.mdd || 0}%</td>
            <td style="color: ${retColor}">${row.return || 0}%</td>
            <td>
                <button class="btn-blue" style="padding: 5px 10px; font-size: 0.8rem; margin-right: 5px;" onclick="renderChart(${leaderboardData.length - 1 - i})">📊 圖表</button>
                <button class="btn-blue" style="padding: 5px 10px; font-size: 0.8rem; margin-right: 5px;" onclick="exportCSV(${leaderboardData.length - 1 - i})">📥 匯出</button>
                <button class="btn-blue" style="background-color: #ef4444; padding: 5px 10px; font-size: 0.8rem;" onclick="deleteRecord(${leaderboardData.length - 1 - i})">刪除</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

let currentChart = null;
window.renderChart = function(index) {
    const record = leaderboardData[index];
    if (!record) {
        alert("找不到該筆紀錄");
        return;
    }
    
    const chartBox = document.getElementById('chartContainer');
    chartBox.style.display = 'block';
    chartBox.scrollIntoView({ behavior: 'smooth' });
    
    let dates = [];
    let equities = [];
    let drawdowns = [];
    
    if (record.daily_equity && record.daily_equity.length > 0) {
        dates = record.daily_equity.map(d => d.date);
        equities = record.daily_equity.map(d => d.equity);
        let peak = record.capital || 1000000;
        drawdowns = record.daily_equity.map(d => {
            if (d.equity > peak) peak = d.equity;
            return peak > 0 ? ((d.equity - peak) / peak * 100) : 0;
        });
    } else {
        // Fallback yearly points
        dates = ['起點', '2021末', '2022末', '2023末', '2024末', '2025末', '2026迄今'];
        let cum = record.capital || 1000000;
        equities = [cum];
        const years = ['2021', '2022', '2023', '2024', '2025', '2026'];
        years.forEach(y => {
            const ret = record.returns_yearly ? record.returns_yearly[y] : 0;
            cum *= (1 + ret / 100);
            equities.push(Math.round(cum));
        });
        drawdowns = [0, 0, -record.mdd || 0, 0, 0, 0, 0];
    }
    
    const ctx = document.getElementById('equityChart').getContext('2d');
    if (currentChart) currentChart.destroy();
    
    currentChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [
                {
                    label: `權益曲線 (${record.strategy || '最佳策略'}, 總報酬 +${record.return || 0}%)`,
                    data: equities,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.2,
                    pointRadius: 2,
                    yAxisID: 'y'
                },
                {
                    label: '最大回撤 (Drawdown %)',
                    data: drawdowns,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    borderWidth: 1,
                    fill: true,
                    pointRadius: 0,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af' } },
                y: { type: 'linear', display: true, position: 'left', grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af' } },
                y1: { type: 'linear', display: true, position: 'right', min: -50, max: 5, grid: { drawOnChartArea: false }, ticks: { color: '#ef4444' } }
            },
            plugins: { legend: { labels: { color: '#fff' } } }
        }
    });
};

window.exportCSV = async function(index) {
    const record = leaderboardData[index];
    if (!record) {
        alert("找不到該筆紀錄");
        return;
    }
    
    let csv = "\uFEFF"; // BOM for excel
    csv += "【回測績效總結報告】\n";
    csv += `總報酬率(%),${record.return}%\n`;
    csv += `勝率(%),${record.winrate}%\n`;
    csv += `最大虧損MDD(%),${record.mdd}%\n`;
    csv += `獲利因子,${record.pf}\n`;
    csv += `總交易次數,${record.trades}\n\n`;
    
    // Part 2: Detailed Trade Logs
    csv += "【大數據決策節點明細】\n";
    csv += "股票代號,股票名稱,買入日期,買入價,進場籌碼積分,進場動能(%),進場ATR,賣出日期,賣出價,賣出原因,持有天數,損益(NTD),損益率(%),最大潛在獲利MFE(%),最大潛在虧損MAE(%),出場防線價位\n";
    
    record.trades_detail.forEach(t => {
        csv += `${t.ticker},${t.name},${t.buy_date},${t.buy_price},${t.buy_score},${t.buy_momentum},${t.buy_atr},${t.sell_date},${t.sell_price},${t.reason},${t.hold_days},${t.pnl},${t.pnl_pct},${t.mfe},${t.mae},${t.trailing_stop_at_exit}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backtest_result_${record.strategy}_${new Date().getTime()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
};

window.deleteRecord = function(index) {
    if (confirm("確定要刪除這筆回測紀錄嗎？")) {
        leaderboardData.splice(index, 1);
        if (leaderboardData.length === 0 && emptyRow) {
            emptyRow.style.display = 'table-row';
        }
        renderLeaderboard();
    }
};

document.getElementById('btnClearLeaderboard').addEventListener('click', async () => {
    if (confirm('確定要清空排行榜、歷史圖表與後端 SQLite 回測資料庫嗎？')) {
        try {
            await fetch(`${BACKTEST_API_URL}/api/analysis/clear_db`, { method: 'POST' });
        } catch(e) {}
        leaderboardData = [];
        document.getElementById('chartContainer').style.display = 'none';
        renderLeaderboard();
        alert('回測紀錄與 SQLite 資料庫已成功清空！');
    }
});

// Event listeners
if (document.getElementById('btnRunGridSearch')) {
    document.getElementById('btnRunGridSearch').addEventListener('click', runGridSearch);
}

// Mega Grid Search Functions
const megaDays = [2, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 360];

function renderMegaDays() {
    const container = document.getElementById('megaDaysContainer');
    if (!container) return;
    container.innerHTML = '';
    megaDays.forEach(day => {
        const checked = [15, 30, 60, 90, 180].includes(day) ? 'checked' : '';
        container.innerHTML += `
            <label style="display: flex; align-items: center; gap: 4px; font-size: 0.85rem; cursor:pointer;">
                <input type="checkbox" class="mega-day-cb" value="${day}" ${checked}> ${day}天
            </label>
        `;
    });
}

window.selectMegaRange = function(rangeType) {
    const cbs = document.querySelectorAll('.mega-day-cb');
    cbs.forEach(cb => {
        const val = parseInt(cb.value);
        if (rangeType === 'short') {
            cb.checked = (val >= 2 && val <= 15);
        } else if (rangeType === 'swing') {
            cb.checked = (val >= 20 && val <= 60);
        } else if (rangeType === 'long') {
            cb.checked = (val >= 90 && val <= 360);
        } else if (rangeType === 'all') {
            cb.checked = true;
        } else if (rangeType === 'none') {
            cb.checked = false;
        }
    });
};

window.toggleAllMegaDays = function(checked) {
    document.querySelectorAll('.mega-day-cb').forEach(cb => cb.checked = checked);
};

window.runMegaGrid = async function() {
    const btn = document.getElementById('btnStartMegaGrid');
    const progressPanel = document.getElementById('megaProgressPanel');
    const progressMsg = document.getElementById('megaProgressMsg');
    const progressBar = document.getElementById('megaProgressBar');
    
    if (!btn) return;
    
    // Read selections
    const selectedPos = Array.from(document.querySelectorAll('input[name="megaPos"]:checked')).map(cb => parseInt(cb.value));
    const selectedStrat = Array.from(document.querySelectorAll('input[name="megaStrat"]:checked')).map(cb => cb.value);
    const selectedDays = Array.from(document.querySelectorAll('.mega-day-cb:checked')).map(cb => parseInt(cb.value));
    
    if (selectedPos.length === 0 || selectedStrat.length === 0 || selectedDays.length === 0) {
        alert("請至少各勾選一個最大持倉數、出場方案與持倉天數！");
        return;
    }
    
    const payload = {
        capital: parseFloat(document.getElementById('btCapital').value.replace(/,/g, '')),
        fee_rate: parseFloat(document.getElementById('btFee').value),
        start_date: `${document.getElementById('btStartYear').value}-${document.getElementById('btStartMonth').value}-${document.getElementById('btStartDay').value}`,
        end_date: `${document.getElementById('btEndYear').value}-${document.getElementById('btEndMonth').value}-${document.getElementById('btEndDay').value}`,
        positions: selectedPos,
        hold_days: selectedDays,
        strategies: selectedStrat
    };
    
    btn.disabled = true;
    progressPanel.style.display = 'block';
    
    try {
        const res = await fetch(`${BACKTEST_API_URL}/api/backtest/mega_grid`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            pollMegaGridStatus();
        } else {
            const err = await res.json();
            alert(`啟動失敗: ${err.detail}`);
            btn.disabled = false;
        }
    } catch (e) {
        alert(`連線失敗: ${e.message}`);
        btn.disabled = false;
    }
};

async function fetchLeaderboardFromDB() {
    try {
        const res = await fetch(`${BACKTEST_API_URL}/api/analysis/experiments`);
        if (res.ok) {
            const data = await res.json();
            if (data.data && Array.isArray(data.data)) {
                leaderboardData = data.data.map(exp => ({
                    strategy: exp.exit_strategy,
                    positions: exp.max_positions,
                    holdDays: exp.max_hold_days,
                    return: exp.total_return,
                    mdd: exp.mdd,
                    winRate: exp.win_rate,
                    profitFactor: exp.profit_factor,
                    isOOS: exp.is_out_of_sample,
                    returns_yearly: {
                        '2021': exp.return_2021 || 0,
                        '2022': exp.return_2022 || 0,
                        '2023': exp.return_2023 || 0,
                        '2024': exp.return_2024 || 0,
                        '2025': exp.return_2025 || 0,
                        '2026': exp.return_2026 || 0
                    }
                }));
                renderLeaderboard();
            }
        }
    } catch (e) {
        console.error("Failed to fetch leaderboard from DB:", e);
    }
}

// 頁面初次載入時自動從 DB 讀取歷史排行榜
document.addEventListener('DOMContentLoaded', () => {
    fetchLeaderboardFromDB();
});

let megaPollInterval = null;
function pollMegaGridStatus() {
    if (megaPollInterval) clearInterval(megaPollInterval);
    
    const btn = document.getElementById('btnStartMegaGrid');
    const progressPanel = document.getElementById('megaProgressPanel');
    const progressMsg = document.getElementById('megaProgressMsg');
    const progressBar = document.getElementById('megaProgressBar');
    
    megaPollInterval = setInterval(async () => {
        try {
            const res = await fetch(`${BACKTEST_API_URL}/api/backtest/mega_grid/status`);
            if (res.ok) {
                const status = await res.json();
                
                if (status.running) {
                    const pct = status.total > 0 ? (status.current / status.total * 100).toFixed(1) : 0;
                    progressMsg.textContent = status.message;
                    progressBar.style.width = `${pct}%`;
                    btn.textContent = `⏳ 大數據運算中... (${pct}%)`;
                } else {
                    clearInterval(megaPollInterval);
                    progressMsg.innerHTML = `<span style="color:#4ade80; font-weight:bold;">🎉 巨量大數據網格搜索完成！已自動載入最新「綜合策略排行榜」與「AI 決策歸因看板」！</span>`;
                    progressBar.style.width = `100%`;
                    btn.textContent = `🎉 運算完成！`;
                    btn.disabled = false;
                    
                    // 重新從資料庫載入最新榜單
                    fetchLeaderboardFromDB();
                }
            }
        } catch (e) {
            console.error(e);
        }
    }, 1500);
}

if (document.getElementById('btnStartMegaGrid')) {
    document.getElementById('btnStartMegaGrid').addEventListener('click', window.runMegaGrid);
}
