const IS_LOCAL = (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost" || window.location.protocol === "file:");

const BACKTEST_API_URL = IS_LOCAL
    ? "http://127.0.0.1:58889"
    : window.location.origin;

const API_BASE_URL = (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost" || window.location.protocol === "file:")
    ? "http://127.0.0.1:58888"
    : window.location.origin;

// 會寫入/清空資料庫、跑重運算的 backtest_engine API 現在要求非本機呼叫必須帶管理者
// 憑證（見 backtest_engine.py 的 require_local_or_admin）；本機不需要，這裡回傳的
// header 在本機情境下就算是空字串也不影響，後端只有非 127.0.0.1 才會檢查這個值
function getAuthHeader() {
    try {
        const saved = localStorage.getItem('ai_trading_user');
        if (saved) return (JSON.parse(saved).authHeader) || '';
    } catch (e) {}
    return '';
}

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
            const covered = data.covered ?? 0;
            const pool = data.pool_size ?? 70;
            const isComplete = covered >= pool;
            const dateRange = (data.date_start && data.date_end) ? `${data.date_start} ~ ${data.date_end}` : '未知';
            const scoreHtml = `<span style="font-weight:bold; background:rgba(0,0,0,0.25); padding:1px 8px; border-radius:5px;">${covered}/${pool}</span>`;

            if (isComplete) {
                dbDateStatus.innerHTML = `<span style="color: #4ade80;">✅ 已就緒 ${scoreHtml}，資料期間 ${dateRange}（最後更新: ${data.last_updated}）</span>`;
            } else {
                const missingPreview = (data.missing_tickers || []).slice(0, 8).join('、') + ((data.missing_tickers || []).length > 8 ? ' 等' : '');
                dbDateStatus.innerHTML = `<span style="color: #fbbf24;">⚠️ 資料不完整 ${scoreHtml}，資料期間 ${dateRange}（最後更新: ${data.last_updated}）<br><span style="font-size:0.85em;">缺：${missingPreview}，建議再次點擊「同步歷史資料庫」補齊（已抓到的檔位不會重抓，只會補缺）</span></span>`;
            }
        } else {
            dbDateStatus.innerHTML = `<span style="color: #f87171;">❌ 找不到資料庫，請點擊同步</span>`;
        }
    } catch (e) {
        dbDateStatus.innerHTML = `<span style="color: #f87171;">❌ 無法連線至回測引擎 (Port 58889)</span>`;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    // 大數據回測運算刻意只在本機執行，不在雲端跑。但畫面本身（1~5 區塊的版面、
    // 預設值）不管本機或雲端都要長得一模一樣，只差在雲端這邊操作元件是鎖住的，
    // 而不是整塊消失——避免使用者看到兩種完全不同的畫面而搞混。
    if (!IS_LOCAL) {
        ['opSection1', 'opSection2', 'opSection3', 'opSection4', 'opSection5'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.querySelectorAll('input, select, button').forEach(field => { field.disabled = true; });
            el.style.opacity = '0.55';
            el.style.pointerEvents = 'none';
        });
        // 清空/發布快照是本機才有意義的破壞性/資料庫操作，雲端上一樣顯示、但鎖住不能按
        const clearBtn = document.getElementById('btnClearLeaderboard');
        if (clearBtn) clearBtn.disabled = true;
        const publishBtn = document.getElementById('btnPublishSnapshot');
        if (publishBtn) publishBtn.disabled = true;
        const notice = document.getElementById('remoteOnlyNotice');
        if (notice) notice.style.display = 'block';
        // 「檢查本地資料庫狀態」需要連到本機回測引擎，雲端上必定連不到，
        // 不特地去嘗試連線、直接顯示鎖定說明即可
        if (dbDateStatus) dbDateStatus.innerHTML = '<span style="color:#94a3b8;">🔒 僅本機執行時可查詢</span>';
        const buyholdDbStatusEl = document.getElementById('buyholdDbStatus');
        if (buyholdDbStatusEl) buyholdDbStatusEl.innerHTML = '<span style="color:#94a3b8;">🔒 僅本機執行時可查詢</span>';
    } else {
        checkDbStatus();
    }

    initDateDropdowns('Start', '2021-01-01');
    const todayStr = new Date().toISOString().slice(0, 10); // 用「今天」當預設結束日，避免寫死日期久了變成過去式，導致同步時誤判成「還沒抓到最新資料」而每次重抓
    initDateDropdowns('End', todayStr);
    renderMegaDays();

    // 大數據回測（區塊4）本身沒有獨立的資金/手續費/日期設定，實際送出時是直接沿用
    // 區塊2「單次回測」的設定，容易讓人誤以為兩者互不相關。這裡即時同步顯示目前沿用的數值。
    updateMegaSharedConditionsInfo();
    ['btCapital', 'btFee', 'btStartYear', 'btStartMonth', 'btStartDay', 'btEndYear', 'btEndMonth', 'btEndDay'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateMegaSharedConditionsInfo);
        if (el) el.addEventListener('change', updateMegaSharedConditionsInfo);
    });
});

function updateMegaSharedConditionsInfo() {
    const el = document.getElementById('megaSharedConditionsText');
    if (!el) return;
    const capitalEl = document.getElementById('btCapital');
    const feeEl = document.getElementById('btFee');
    if (!capitalEl || !feeEl) return;
    const capital = capitalEl.value || '-';
    const feeLabel = feeEl.options[feeEl.selectedIndex] ? feeEl.options[feeEl.selectedIndex].text : '-';
    const start = getDateStr('Start');
    const end = getDateStr('End');
    el.textContent = `資金 ${capital} 元｜手續費 ${feeLabel}｜期間 ${start} ~ ${end}`;
}

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
            headers: { 'Content-Type': 'application/json', 'Authorization': getAuthHeader() },
            body: JSON.stringify({ start_date: start, end_date: end })
        });
        
        if (res.ok) {
            const data = await res.json();
            if (data.skipped) {
                alert(`⏭️ ${data.message}`);
            } else {
                alert("✅ 歷史資料庫同步完成！");
            }
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
            headers: { 'Content-Type': 'application/json', 'Authorization': getAuthHeader() },
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
                trades_detail: result.trades, // Store for export
                timestamp: new Date().toISOString().slice(0, 19).replace('T', ' ')
            };

            leaderboardData.push(record);
            renderLeaderboard();
            updateLeaderboardTimestampInfo();
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
            headers: { 'Content-Type': 'application/json', 'Authorization': getAuthHeader() },
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
    const tbody = document.getElementById('lbBody');
    tbody.innerHTML = '';

    if (leaderboardData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-sub);">尚未執行任何回測，請在上方設定條件後點擊開始。</td></tr>';
        const viewAllBtn = document.getElementById('btnViewFullLeaderboard');
        if (viewAllBtn) viewAllBtn.style.display = 'none';
        return;
    }

    // 依總報酬率由高到低排序，表現最佳的排最上面；每一列仍記住它在
    // leaderboardData 裡的原始 index，讓「匯出」「刪除」按鈕操作到正確的那一筆
    const indexed = leaderboardData.map((row, idx) => ({ row, idx }));
    indexed.sort((a, b) => (b.row.return ?? 0) - (a.row.return ?? 0));

    // 主頁只顯示前 15 筆，其餘的透過「全部排行榜名單」連結到獨立頁面查看
    const MAX_VISIBLE_ROWS = 15;
    const visible = indexed.slice(0, MAX_VISIBLE_ROWS);

    const viewAllBtn = document.getElementById('btnViewFullLeaderboard');
    if (viewAllBtn) {
        if (indexed.length > MAX_VISIBLE_ROWS) {
            viewAllBtn.style.display = 'inline-block';
            viewAllBtn.textContent = `📋 按此顯示全部排行榜名單（共 ${indexed.length} 筆）`;
        } else {
            viewAllBtn.style.display = 'none';
        }
    }

    visible.forEach(({ row, idx: i }, displayPos) => {
        const isBest = (displayPos === 0 && leaderboardData.length > 1);
        
        const tr = document.createElement('tr');
        if (isBest) tr.className = 'best-row';
        
        const winColor = row.winrate > 50 ? '#ef4444' : '#22c55e'; // TW standard
        const retColor = row.return > 0 ? '#ef4444' : (row.return < 0 ? '#22c55e' : '#fff');
        
        tr.innerHTML = `
            <td><span style="color:var(--text-sub); font-weight:normal;">#${displayPos + 1}</span> ${row.strategy} ${isBest ? '👑' : ''}</td>
            <td style="font-size: 0.9em; line-height: 1.4;">${row.paramsHtml || '-'}</td>
            <td>${row.trades ?? row.total_trades ?? '-'}</td>
            <td style="color: ${winColor}">${row.winrate ?? row.win_rate ?? 0}%</td>
            <td>${row.pf ?? row.profit_factor ?? 0}</td>
            <td>${row.mdd ?? 0}%</td>
            <td style="color: ${retColor}">${row.return ?? 0}%</td>
            <td>
                <button class="btn-blue" style="padding: 5px 10px; font-size: 0.8rem; margin-right: 5px;" onclick="exportCSV(${i})">📥 匯出</button>
                <button class="btn-blue" style="background-color: #ef4444; padding: 5px 10px; font-size: 0.8rem;" onclick="deleteRecord(${i})">刪除</button>
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

    // 剛跑完的單次回測，記憶體裡本來就有完整交易明細（含進場籌碼積分/動能/ATR 這些
    // 只有跑當下才算得出來的欄位），直接用；DB 裡撈出來的舊紀錄沒有這幾欄（從來沒有寫進
    // 資料庫過），改成即時查 /api/analysis/trades/{id}，永遠抓當下資料庫最新的內容
    let trades;
    let fullDetail = true;

    if (record.trades_detail && record.trades_detail.length > 0) {
        trades = record.trades_detail;
    } else if (record.id) {
        if (!IS_LOCAL) {
            alert('這筆是資料庫裡的既有紀錄，個股交易明細只能在管理者電腦端使用。可以到「數據總匯」頁面的「2. 自訂條件匯出」查看這筆的完整明細。');
            return;
        }
        try {
            const res = await fetch(`${BACKTEST_API_URL}/api/analysis/trades/${record.id}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            trades = data.data || [];
            fullDetail = false;
        } catch (e) {
            alert('查詢交易明細失敗：' + e.message);
            return;
        }
    } else {
        alert('找不到這筆的交易明細，請重新整理排行榜後再試一次');
        return;
    }

    if (!trades || trades.length === 0) {
        alert('這筆結果沒有交易紀錄可以匯出');
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
    csv += "【個股買賣交易明細】\n";
    if (fullDetail) {
        csv += "股票代號,股票名稱,買入日期,買入價,進場籌碼積分,進場動能(%),進場ATR,賣出日期,賣出價,賣出原因,持有天數,損益(NTD),損益率(%),最大潛在獲利MFE(%),最大潛在虧損MAE(%),出場防線價位\n";
        trades.forEach(t => {
            csv += `${t.ticker},${t.name},${t.buy_date},${t.buy_price},${t.buy_score},${t.buy_momentum},${t.buy_atr},${t.sell_date},${t.sell_price},${t.reason},${t.hold_days},${t.pnl},${t.pnl_pct},${t.mfe},${t.mae},${t.trailing_stop_at_exit}\n`;
        });
    } else {
        // 資料庫裡沒有存進場籌碼積分/動能/ATR/出場防線價位這幾欄，不放注定空白的欄位
        csv += "股票代號,股票名稱,買入日期,買入價,賣出日期,賣出價,賣出原因,持有天數,損益(NTD),損益率(%),最大潛在獲利MFE(%),最大潛在虧損MAE(%)\n";
        trades.forEach(t => {
            csv += `${t.ticker},${t.name},${t.buy_date},${t.buy_price},${t.sell_date},${t.sell_price},${t.reason},${t.hold_days},${t.pnl},${t.pnl_pct},${t.mfe},${t.mae}\n`;
        });
    }

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
        updateLeaderboardTimestampInfo();
    }
};

if (document.getElementById('btnClearLeaderboard')) {
    document.getElementById('btnClearLeaderboard').addEventListener('click', async () => {
        if (confirm('確定要清空排行榜與後端 SQLite 回測資料庫嗎？此動作無法復原！')) {
            try {
                const res = await fetch(`${BACKTEST_API_URL}/api/analysis/clear_db`, {
                    method: 'POST',
                    headers: { 'Authorization': getAuthHeader() }
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    alert(`❌ 清空失敗：${err.detail || `HTTP ${res.status}`}`);
                    return;
                }
            } catch (e) {
                alert(`❌ 清空失敗：${e.message}`);
                return;
            }
            leaderboardData = [];
            renderLeaderboard();
            updateLeaderboardTimestampInfo();
            alert('回測紀錄與 SQLite 資料庫已成功清空！');
        }
    });
}

if (document.getElementById('btnPublishSnapshot')) {
    document.getElementById('btnPublishSnapshot').addEventListener('click', async () => {
        const btn = document.getElementById('btnPublishSnapshot');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ 產生快照中...';
        try {
            const res = await fetch(`${BACKTEST_API_URL}/api/backtest/publish_snapshot`, {
                method: 'POST',
                headers: { 'Authorization': getAuthHeader() }
            });
            const data = await res.json();
            if (res.ok && data.status === 'success') {
                alert(`✅ ${data.message}\n\n下一步：請自行在終端機執行 git add / commit / push（或請 Claude 幫忙），推上 GitHub 後 Render 才會真正顯示這份快照。`);
            } else {
                alert(`❌ 產生快照失敗：${data.message || data.detail || '未知錯誤'}`);
            }
        } catch (e) {
            alert(`❌ 無法連線至本機回測引擎：${e.message}`);
        }
        btn.disabled = false;
        btn.textContent = originalText;
    });
}

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

    progressBar.classList.remove('indeterminate');
    progressBar.style.width = '0%';

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
    lastMegaGridPayload = payload;

    try {
        const res = await fetch(`${BACKTEST_API_URL}/api/backtest/mega_grid`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': getAuthHeader() },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            const data = await res.json();
            if (data.status === 'already_up_to_date') {
                progressMsg.innerHTML = `<span style="color:#4ade80; font-weight:bold;">${data.message}</span>`;
                progressBar.style.width = `100%`;
                btn.textContent = `✅ 已是最新資料，無需重跑`;
                btn.disabled = false;
                const progressTiming = document.getElementById('megaProgressTiming');
                if (progressTiming) progressTiming.textContent = '';
            } else {
                pollMegaGridStatus();
            }
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
        // 正式站沒有永久硬碟，自己的即時資料庫每次重啟都會被清空；改讀本機發布的靜態快照
        // （見 backtest.html「📤 發布快照到正式站」按鈕），本機開啟時則維持讀即時 API
        let list;
        if (IS_LOCAL) {
            const res = await fetch(`${BACKTEST_API_URL}/api/analysis/experiments`);
            if (res.ok) {
                const data = await res.json();
                list = data.data;
            }
        } else {
            const res = await fetch('published_snapshot.json');
            if (res.ok) {
                const snap = await res.json();
                list = snap.experiments;
            }
        }

        if (list && Array.isArray(list)) {
            leaderboardData = list.map(exp => {
                    const capStr = (exp.capital / 10000).toFixed(0) + "萬";
                    const holdStr = exp.max_hold_days === 999 ? "無限制" : exp.max_hold_days + "天";
                    const oosTag = exp.is_out_of_sample ? ' <span style="color:#f59e0b;">[OOS]</span>' : '';
                    const poolStr = exp.pool_size ? ` | 股票池:${exp.pool_size}檔` : '';
                    return {
                        id: exp.id,
                        strategy: `方案 ${exp.exit_strategy}`,
                        paramsHtml: `${exp.start_date} ~ ${exp.end_date}${oosTag}<br><span style="color:#9ca3af; font-size:0.85em;">資金:${capStr} | 持倉:${exp.max_positions}檔 | 期限:${holdStr}${poolStr}</span>`,
                        trades: exp.total_trades,
                        winrate: exp.win_rate,
                        pf: exp.profit_factor,
                        mdd: exp.mdd,
                        return: exp.total_return,
                        capital: exp.capital,
                        isOOS: exp.is_out_of_sample,
                        timestamp: exp.timestamp,
                        returns_yearly: {
                            '2021': exp.return_2021 || 0,
                            '2022': exp.return_2022 || 0,
                            '2023': exp.return_2023 || 0,
                            '2024': exp.return_2024 || 0,
                            '2025': exp.return_2025 || 0,
                            '2026': exp.return_2026 || 0
                        }
                    };
                });
            renderLeaderboard();
            updateLeaderboardTimestampInfo();
        }
    } catch (e) {
        console.error("Failed to fetch leaderboard from DB:", e);
    }
}

function updateLeaderboardTimestampInfo() {
    const el = document.getElementById('lbTimestampInfo');
    if (!el) return;
    const timestamps = leaderboardData.map(r => r.timestamp).filter(Boolean).sort();
    if (timestamps.length === 0) {
        el.textContent = '';
        return;
    }
    const earliest = timestamps[0];
    const latest = timestamps[timestamps.length - 1];
    el.textContent = earliest === latest
        ? `🕒 資料執行於 ${latest}`
        : `🕒 資料執行區間 ${earliest} ~ ${latest}（共 ${leaderboardData.length} 筆）`;
}

// 頁面初次載入時自動從 DB 讀取歷史排行榜
document.addEventListener('DOMContentLoaded', () => {
    fetchLeaderboardFromDB();
});

let megaPollInterval = null;
let megaPollStartTime = null;
let lastMegaGridPayload = null;

function formatDuration(ms) {
    const totalSec = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`;
}

// 記住上次跑完的「平均每組耗時」，讓這次一開始（第一組都還沒跑完時）就能估算剩餘時間，
// 不用乾等到第一組完成才有數字可以看
const MEGA_AVG_MS_KEY = 'megaGridAvgMsPerCombo';
function getStoredAvgMsPerCombo() {
    const v = localStorage.getItem(MEGA_AVG_MS_KEY);
    return v ? parseFloat(v) : null;
}
function storeAvgMsPerCombo(avgMs) {
    if (avgMs > 0) localStorage.setItem(MEGA_AVG_MS_KEY, String(avgMs));
}

function pollMegaGridStatus() {
    if (megaPollInterval) clearInterval(megaPollInterval);
    megaPollStartTime = Date.now();

    const btn = document.getElementById('btnStartMegaGrid');
    const progressPanel = document.getElementById('megaProgressPanel');
    const progressMsg = document.getElementById('megaProgressMsg');
    const progressBar = document.getElementById('megaProgressBar');
    const progressTiming = document.getElementById('megaProgressTiming');

    megaPollInterval = setInterval(async () => {
        try {
            const res = await fetch(`${BACKTEST_API_URL}/api/backtest/mega_grid/status`);
            if (res.ok) {
                const status = await res.json();
                const elapsedMs = Date.now() - megaPollStartTime;

                if (status.running) {
                    progressMsg.textContent = status.message;

                    if (status.current > 0 && status.total > 0) {
                        // 已經有至少 1 組跑完，用實際速度算出來的百分比最準確
                        const pct = (status.current / status.total * 100).toFixed(1);
                        progressBar.classList.remove('indeterminate');
                        progressBar.style.width = `${pct}%`;
                        btn.textContent = `⏳ 大數據運算中... (${pct}%)`;

                        const estTotalMs = elapsedMs / (status.current / status.total);
                        const remainingMs = Math.max(0, estTotalMs - elapsedMs);
                        if (progressTiming) progressTiming.textContent = `⏱️ 已耗時 ${formatDuration(elapsedMs)}，預估剩餘 ${formatDuration(remainingMs)}（${status.current}/${status.total} 組）`;
                    } else {
                        // 第一組都還沒跑完：如果上次跑過，用歷史速度換算成百分比讓長條照樣跑動；
                        // 完全沒有歷史速度可用時（例如第一次使用），改用一直滑動的動畫，
                        // 讓使用者確定系統還活著、不是卡住當機
                        const storedAvg = getStoredAvgMsPerCombo();
                        if (storedAvg && status.total > 0) {
                            const estTotalMs = storedAvg * status.total;
                            const pct = Math.min(97, (elapsedMs / estTotalMs * 100)).toFixed(1);
                            progressBar.classList.remove('indeterminate');
                            progressBar.style.width = `${pct}%`;
                            btn.textContent = `⏳ 大數據運算中... (約 ${pct}%)`;

                            const estRemainingMs = Math.max(0, estTotalMs - elapsedMs);
                            if (progressTiming) progressTiming.textContent = `⏱️ 已耗時 ${formatDuration(elapsedMs)}，預估剩餘 ${formatDuration(estRemainingMs)}（依上次運算速度估算，共 ${status.total} 組）`;
                        } else {
                            progressBar.classList.add('indeterminate');
                            btn.textContent = `⏳ 大數據運算中...`;
                            if (progressTiming) progressTiming.textContent = `⏱️ 已耗時 ${formatDuration(elapsedMs)}，正在運算第 1 組（尚無歷史速度紀錄，跑完第一組後才會出現剩餘時間估算，系統仍在正常運算中，請耐心等候）...`;
                        }
                    }
                } else {
                    clearInterval(megaPollInterval);
                    let conditionSummary = '';
                    if (lastMegaGridPayload) {
                        const p = lastMegaGridPayload;
                        conditionSummary = `<br><span style="font-size:0.85rem; color:var(--text-sub); font-weight:normal;">本次條件：${p.start_date} ~ ${p.end_date}｜持倉檔數 ${p.positions.join('/')}｜策略 ${p.strategies.join('/')}｜持倉天數 ${p.hold_days.join('/')}｜共 ${p.positions.length * p.strategies.length * p.hold_days.length} 組組合</span>`;
                    }
                    progressMsg.innerHTML = `<span style="color:#4ade80; font-weight:bold;">🎉 巨量大數據網格搜索完成！已自動載入最新「綜合策略排行榜」與「AI 決策歸因看板」！</span>${conditionSummary}`;
                    progressBar.classList.remove('indeterminate');
                    progressBar.style.width = `100%`;
                    btn.textContent = `🎉 運算完成！`;
                    btn.disabled = false;
                    if (progressTiming) progressTiming.textContent = `⏱️ 總耗時 ${formatDuration(elapsedMs)}`;
                    if (status.current > 0) storeAvgMsPerCombo(elapsedMs / status.current);

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
