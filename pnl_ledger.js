// 損益總帳：讀寫同一份 /api/history（= 我的操盤室的退役結案紀錄），
// 提供篩選、逐筆編輯／刪除／手動新增、統計、月結與 CSV 匯出。
const API_BASE_URL = (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost" || window.location.protocol === "file:")
    ? "http://127.0.0.1:58888"
    : window.location.origin;

const FEE_RATE = 0.001425;   // 手續費牌告費率（買賣各一次）
const TAX_RATE = 0.003;      // 證交稅（賣出時）
const FEE_DISCOUNT_KEY = 'ai_trading_fee_discount';

let ledger = [];        // 伺服器上的完整清單（順序與 history.json 相同）
let editingIndex = null;
let cumChart = null;

// ---------- 登入 ----------
function getAuthHeader() {
    try {
        const c = JSON.parse(localStorage.getItem('ai_trading_user') || 'null');
        return c ? c.authHeader : '';
    } catch (e) { return ''; }
}
if (!getAuthHeader()) {
    alert('請先登入後再查看損益總帳！將帶您回首頁登入。');
    location.href = 'index.html';
    throw new Error('Unauthenticated');
}

// ---------- 工具 ----------
function localDateStr(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function money(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString('zh-TW'); }
function pct(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(2) + '%'; }
function cls(n) { return n > 0 ? 'pos' : n < 0 ? 'neg' : ''; }

function getFeeDiscount() {
    const v = parseFloat(document.getElementById('feeDiscount').value);
    return v > 0 && v <= 1 ? v : 1;
}

function calc(item) {
    const isShort = item.type === 'short';
    const shareCount = (Number(item.shares) || 0) * 1000;
    const cost = Number(item.cost) || 0;
    const exitPrice = Number(item.exitPrice || item.closePrice) || 0;
    const buyAmt = cost * shareCount;
    const sellAmt = exitPrice * shareCount;
    const gross = isShort ? (buyAmt - sellAmt) : (sellAmt - buyAmt);
    const disc = getFeeDiscount();
    const fee = Math.round(buyAmt * FEE_RATE * disc) + Math.round(sellAmt * FEE_RATE * disc);
    const tax = Math.round((isShort ? buyAmt : sellAmt) * TAX_RATE);
    const net = Math.round(gross) - fee - tax;
    let holdDays = null;
    if (item.buy_date && item.exitDate) {
        const d = Math.round((new Date(item.exitDate + 'T00:00:00') - new Date(item.buy_date + 'T00:00:00')) / 86400000);
        if (!isNaN(d)) holdDays = d;
    }
    return { isShort, shareCount, cost, exitPrice, buyAmt, gross: Math.round(gross), fee, tax, cost_total: fee + tax,
             net, netPct: buyAmt > 0 ? net / buyAmt * 100 : 0, holdDays };
}

function splitName(item) {
    const name = String(item.name || '');
    const ticker = item.ticker || (name.match(/^(\w+)/) || [])[1] || '';
    const pure = name.startsWith(ticker) ? name.slice(ticker.length).trim() : name;
    return { ticker, pure };
}

// ---------- 載入 / 儲存 ----------
async function loadLedger() {
    const st = document.getElementById('loadStatus');
    try {
        const res = await fetch(`${API_BASE_URL}/api/history`, { headers: { 'Authorization': getAuthHeader() } });
        if (res.status === 403) {
            alert('登入已失效，請回首頁重新登入。');
            location.href = 'index.html';
            return;
        }
        const data = await res.json();
        ledger = Array.isArray(data) ? data : [];
        st.textContent = `共 ${ledger.length} 筆紀錄`;
    } catch (e) {
        console.error(e);
        st.textContent = '❌ 無法連線到伺服器，請確認 start.command 是否已執行';
        ledger = [];
    }
    buildStrategyFilter();
    render();
}

async function saveLedger(msg) {
    const res = await fetch(`${API_BASE_URL}/api/history`, {
        method: 'POST',
        headers: { 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(ledger)
    });
    if (!res.ok) throw new Error('save failed ' + res.status);
    document.getElementById('loadStatus').textContent = `${msg || '已儲存'}（共 ${ledger.length} 筆）`;
}

// ---------- 篩選 ----------
function buildStrategyFilter() {
    const sel = document.getElementById('fStrategy');
    const keep = sel.value;
    const set = new Set(ledger.map(r => r.exit_strategy || '').filter(Boolean));
    sel.innerHTML = '<option value="all">全部</option>' + [...set].sort().map(s => `<option value="${esc(s)}">方案 ${esc(s)}</option>`).join('') +
        (ledger.some(r => !r.exit_strategy) ? '<option value="__none">未指定</option>' : '');
    if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
}

function periodRange() {
    const p = document.getElementById('fPeriod').value;
    const now = new Date();
    const y = now.getFullYear();
    if (p === 'ytd') return [`${y}-01-01`, '9999-12-31'];
    if (p === 'lastyear') return [`${y - 1}-01-01`, `${y - 1}-12-31`];
    if (p === 'm1' || p === 'm3') {
        const d = new Date(now); d.setMonth(d.getMonth() - (p === 'm1' ? 1 : 3));
        return [localDateStr(d), '9999-12-31'];
    }
    if (p === 'custom') return [document.getElementById('fFrom').value || '0000-01-01', document.getElementById('fTo').value || '9999-12-31'];
    return ['0000-01-01', '9999-12-31'];
}

function filteredRows() {
    const [from, to] = periodRange();
    const type = document.getElementById('fType').value;
    const strat = document.getElementById('fStrategy').value;
    const q = document.getElementById('fSearch').value.trim().toLowerCase();
    return ledger.map((item, index) => ({ item, index })).filter(({ item }) => {
        const d = item.exitDate || '';
        if (d && (d < from || d > to)) return false;
        if (!d && document.getElementById('fPeriod').value !== 'all') return false;
        if (type !== 'all' && (item.type === 'short' ? 'short' : 'long') !== type) return false;
        if (strat === '__none' && item.exit_strategy) return false;
        if (strat !== 'all' && strat !== '__none' && item.exit_strategy !== strat) return false;
        if (q && !(`${item.ticker || ''} ${item.name || ''}`.toLowerCase().includes(q))) return false;
        return true;
    }).sort((a, b) => String(b.item.exitDate || '').localeCompare(String(a.item.exitDate || '')) || b.index - a.index);
}

// ---------- 畫面 ----------
function render() {
    const rows = filteredRows();
    const figs = rows.map(r => ({ ...r, f: calc(r.item) }));
    renderTable(figs);
    renderStats(figs);
    renderMonthly(figs);
    renderChart(figs);
    updateBulkButton();
}

function renderTable(figs) {
    const body = document.getElementById('ledgerBody');
    const foot = document.getElementById('ledgerFoot');
    document.getElementById('chkAll').checked = false;
    if (figs.length === 0) {
        body.innerHTML = `<tr><td class="l" colspan="16" style="color:var(--text-sub); padding:20px;">${ledger.length === 0 ? '目前還沒有結清的交易。在「我的操盤室」結清持倉，或按上方「＋ 手動新增一筆」。' : '沒有符合篩選條件的紀錄。'}</td></tr>`;
        foot.innerHTML = '';
        return;
    }
    body.innerHTML = figs.map(({ item, index, f }) => `
        <tr>
            <td class="l"><input type="checkbox" class="row-chk" data-index="${index}" onchange="updateBulkButton()"></td>
            <td class="l">${esc(item.exitDate || '—')}</td>
            <td class="l">${esc(item.buy_date || '—')}</td>
            <td class="l">${esc(item.name || item.ticker || '')}</td>
            <td class="l">${f.isShort ? '空單' : '多單'}</td>
            <td class="l">${esc(item.exit_strategy || '—')}</td>
            <td>${f.holdDays ?? '—'}</td>
            <td>${Number(item.shares) || 0}</td>
            <td>${f.cost.toLocaleString('zh-TW')}</td>
            <td>${f.exitPrice.toLocaleString('zh-TW')}</td>
            <td class="${cls(f.gross)}">${money(f.gross)}</td>
            <td>${f.cost_total.toLocaleString('zh-TW')}</td>
            <td class="${cls(f.net)}"><strong>${money(f.net)}</strong></td>
            <td class="${cls(f.netPct)}">${pct(f.netPct)}</td>
            <td class="l" title="${esc(item.journal || '')}">${esc(item.outcome || '')}</td>
            <td class="l row-act"><a onclick="openEditor(${index})">編輯</a><a class="del" onclick="deleteOne(${index})">刪除</a></td>
        </tr>`).join('');
    const sum = k => figs.reduce((s, r) => s + r.f[k], 0);
    const totalBuy = sum('buyAmt');
    const net = sum('net');
    foot.innerHTML = `<tr>
        <td class="l" colspan="10">合計（${figs.length} 筆）</td>
        <td class="${cls(sum('gross'))}">${money(sum('gross'))}</td>
        <td>${sum('cost_total').toLocaleString('zh-TW')}</td>
        <td class="${cls(net)}">${money(net)}</td>
        <td class="${cls(net)}">${totalBuy > 0 ? pct(net / totalBuy * 100) : '—'}</td>
        <td colspan="2"></td></tr>`;
}

function renderStats(figs) {
    const n = figs.length;
    const nets = figs.map(r => r.f.net);
    const wins = nets.filter(v => v > 0), losses = nets.filter(v => v < 0);
    const totalNet = nets.reduce((a, b) => a + b, 0);
    const totalGross = figs.reduce((a, r) => a + r.f.gross, 0);
    const totalCost = figs.reduce((a, r) => a + r.f.cost_total, 0);
    const totalBuy = figs.reduce((a, r) => a + r.f.buyAmt, 0);
    const sumWin = wins.reduce((a, b) => a + b, 0), sumLoss = losses.reduce((a, b) => a + b, 0);
    const holds = figs.map(r => r.f.holdDays).filter(v => v !== null);
    const box = (k, v, c = '') => `<div class="stat-box"><div class="k">${k}</div><div class="v ${c}">${v}</div></div>`;
    document.getElementById('statGrid').innerHTML = [
        box('淨損益合計（元）', n ? money(totalNet) : '—', cls(totalNet)),
        box('淨報酬率（淨損益 ÷ 投入成本）', totalBuy > 0 ? pct(totalNet / totalBuy * 100) : '—', cls(totalNet)),
        box('毛損益合計（元）', n ? money(totalGross) : '—', cls(totalGross)),
        box('手續費＋稅（元）', n ? totalCost.toLocaleString('zh-TW') : '—'),
        box('交易筆數', n),
        box('勝率', n ? (wins.length / n * 100).toFixed(1) + '%' : '—'),
        box('獲利 / 虧損筆數', `${wins.length} / ${losses.length}`),
        box('平均每筆獲利', wins.length ? money(sumWin / wins.length) : '—', 'pos'),
        box('平均每筆虧損', losses.length ? money(sumLoss / losses.length) : '—', 'neg'),
        box('獲利因子（總獲利 ÷ 總虧損）', losses.length ? (sumWin / Math.abs(sumLoss)).toFixed(2) : (wins.length ? '∞' : '—')),
        box('最大單筆獲利', wins.length ? money(Math.max(...wins)) : '—', 'pos'),
        box('最大單筆虧損', losses.length ? money(Math.min(...losses)) : '—', 'neg'),
        box('平均持有天數', holds.length ? (holds.reduce((a, b) => a + b, 0) / holds.length).toFixed(1) + ' 天' : '—')
    ].join('');
}

function renderMonthly(figs) {
    const map = {};
    figs.forEach(({ item, f }) => {
        const m = (item.exitDate || '未知').slice(0, 7);
        map[m] = map[m] || { n: 0, w: 0, gross: 0, cost: 0, net: 0 };
        const o = map[m];
        o.n++; if (f.net > 0) o.w++;
        o.gross += f.gross; o.cost += f.cost_total; o.net += f.net;
    });
    const months = Object.keys(map).sort();
    let cum = 0;
    const rows = months.map(m => { cum += map[m].net; return { m, ...map[m], cum }; }).reverse();
    document.getElementById('monthBody').innerHTML = rows.length ? rows.map(r => `
        <tr><td class="l">${esc(r.m)}</td><td>${r.n}</td><td>${(r.w / r.n * 100).toFixed(0)}%</td>
        <td class="${cls(r.gross)}">${money(r.gross)}</td><td>${r.cost.toLocaleString('zh-TW')}</td>
        <td class="${cls(r.net)}"><strong>${money(r.net)}</strong></td><td class="${cls(r.cum)}">${money(r.cum)}</td></tr>`).join('')
        : '<tr><td class="l" colspan="7" style="color:var(--text-sub);">—</td></tr>';
}

function renderChart(figs) {
    const pts = [...figs].sort((a, b) => String(a.item.exitDate || '').localeCompare(String(b.item.exitDate || '')) || a.index - b.index);
    let cum = 0;
    const labels = [], data = [];
    pts.forEach(({ item, f }) => { cum += f.net; labels.push(`${item.exitDate || '?'} ${item.name || ''}`); data.push(cum); });
    const ctx = document.getElementById('cumChart');
    if (!window.Chart) return;
    if (cumChart) cumChart.destroy();
    const last = data.length ? data[data.length - 1] : 0;
    const color = last >= 0 ? '#ef4444' : '#10b981';
    cumChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ data, borderColor: color, backgroundColor: color + '22', fill: true, tension: 0.2, pointRadius: 3, borderWidth: 2 }] },
        options: {
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => '累計淨損益 ' + money(c.parsed.y) + ' 元' } } },
            scales: {
                x: { ticks: { color: '#94a3b8', maxRotation: 0, autoSkip: true, maxTicksLimit: 8, callback: function (v) { return String(this.getLabelForValue(v)).slice(0, 10); } }, grid: { display: false } },
                y: { ticks: { color: '#94a3b8', callback: v => Number(v).toLocaleString('zh-TW') }, grid: { color: 'rgba(148,163,184,0.12)' } }
            }
        }
    });
}

// ---------- 刪除 ----------
function updateBulkButton() {
    const n = document.querySelectorAll('.row-chk:checked').length;
    const b = document.getElementById('btnBulkDelete');
    b.style.display = n ? 'inline-block' : 'none';
    b.textContent = `🗑 刪除勾選的 ${n} 筆`;
}
function toggleAll(on) {
    document.querySelectorAll('.row-chk').forEach(c => { c.checked = on; });
    updateBulkButton();
}
async function deleteIndices(indices, label) {
    const backup = ledger.slice();
    [...indices].sort((a, b) => b - a).forEach(i => ledger.splice(i, 1));
    try {
        await saveLedger(`✅ 已刪除 ${label}`);
    } catch (e) {
        ledger = backup;
        alert('❌ 刪除失敗，請確認伺服器是否在執行');
    }
    buildStrategyFilter();
    render();
}
window.deleteOne = function (index) {
    const it = ledger[index];
    if (!it) return;
    if (!confirm(`確定刪除「${it.name}」（賣出日 ${it.exitDate || '未知'}）這筆紀錄嗎？\n刪除後「我的操盤室」的結案紀錄也會一起移除，無法復原。`)) return;
    deleteIndices([index], it.name);
};
window.deleteSelected = function () {
    const idx = [...document.querySelectorAll('.row-chk:checked')].map(c => Number(c.dataset.index));
    if (!idx.length) return;
    if (!confirm(`確定刪除勾選的 ${idx.length} 筆紀錄嗎？無法復原。`)) return;
    deleteIndices(idx, `${idx.length} 筆`);
};

// ---------- 新增 / 編輯 ----------
const $ = id => document.getElementById(id);
window.openEditor = function (index) {
    editingIndex = index;
    const it = index === null ? {} : ledger[index];
    const { ticker, pure } = splitName(it);
    $('editorTitle').textContent = index === null ? '手動新增一筆交易' : `編輯：${it.name || ''}`;
    $('eTicker').value = ticker;
    $('eName').value = pure;
    $('eType').value = it.type === 'short' ? 'short' : 'long';
    $('eStrategy').value = it.exit_strategy || '';
    $('eBuyDate').value = it.buy_date || '';
    $('eExitDate').value = it.exitDate || localDateStr();
    $('eCost').value = it.cost ?? '';
    $('eExitPrice').value = it.exitPrice ?? it.closePrice ?? '';
    $('eShares').value = it.shares ?? '';
    $('eOutcome').value = it.outcome || '';
    $('eJournal').value = it.journal || '';
    $('editorBg').style.display = 'flex';
};
window.closeEditor = function () { $('editorBg').style.display = 'none'; };

function autoOutcome(type, cost, exitPrice) {
    const pnl = type === 'short' ? cost - exitPrice : exitPrice - cost;
    const p = cost > 0 ? (pnl / cost * 100).toFixed(1) : 0;
    return pnl > 0 ? `獲利 (+${p}%)` : pnl < 0 ? `停損 (${p}%)` : '平盤 (0%)';
}

window.saveEditor = async function () {
    const ticker = $('eTicker').value.trim();
    const name = $('eName').value.trim();
    const cost = parseFloat($('eCost').value);
    const exitPrice = parseFloat($('eExitPrice').value);
    const shares = parseFloat($('eShares').value);
    const buyDate = $('eBuyDate').value;
    const exitDate = $('eExitDate').value;
    const type = $('eType').value;
    if (!ticker) return alert('請填股票代號');
    if (!(cost > 0) || !(exitPrice > 0)) return alert('成本與平倉價必須大於 0');
    if (!(shares > 0)) return alert('張數必須大於 0');
    if (!buyDate || !exitDate) return alert('請填買進與賣出日期');
    if (exitDate < buyDate && !confirm('賣出日期早於買進日期，確定要這樣存嗎？')) return;

    const prev = editingIndex === null ? null : ledger[editingIndex];
    let outcome = $('eOutcome').value.trim();
    // 空白、或原本就是系統自動產生的「獲利/停損/平盤 (x%)」→ 依新數字重算
    if (!outcome || /^(獲利|停損|平盤) \([^)]*\)$/.test(outcome)) outcome = autoOutcome(type, cost, exitPrice);

    const record = {
        ...(prev || { signal: '手動補記', source: 'manual', reason: '', is_mock: false }),
        ticker,
        name: name ? `${ticker} ${name}` : ticker,
        type,
        exit_strategy: $('eStrategy').value || undefined,
        buy_date: buyDate,
        exitDate,
        cost,
        exitPrice,
        shares,
        outcome,
        journal: $('eJournal').value
    };
    if (!record.exit_strategy) delete record.exit_strategy;
    if (!prev) record.closePrice = exitPrice;

    const backup = ledger.slice();
    if (prev) ledger[editingIndex] = record; else ledger.push(record);
    try {
        await saveLedger(prev ? `✅ 已更新 ${record.name}` : `✅ 已新增 ${record.name}`);
        closeEditor();
    } catch (e) {
        ledger = backup;
        alert('❌ 儲存失敗，請確認伺服器是否在執行');
    }
    buildStrategyFilter();
    render();
};

// ---------- 匯出 ----------
window.exportLedgerCSV = function () {
    const rows = filteredRows().reverse();
    if (!rows.length) return alert('目前清單沒有資料可匯出。');
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    let csv = '﻿代號與名稱,多空,出場方案,買進日期,賣出日期,持有天數,進場成本,平倉價,張數,股數,毛損益(元),手續費+稅(元),淨損益(元),淨報酬率(%),出場結果,交易日誌\n';
    rows.forEach(({ item }) => {
        const f = calc(item);
        csv += [q(item.name), f.isShort ? '空單' : '多單', q(item.exit_strategy || ''), q(item.buy_date || ''), q(item.exitDate || ''),
            f.holdDays ?? '', f.cost, f.exitPrice, Number(item.shares) || 0, f.shareCount, f.gross, f.cost_total, f.net,
            f.netPct.toFixed(2), q(item.outcome), q(item.journal)].join(',') + '\n';
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `損益總帳_${localDateStr()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
};

// ---------- 事件 ----------
(function init() {
    try {
        const saved = localStorage.getItem(FEE_DISCOUNT_KEY);
        if (saved) $('feeDiscount').value = saved;
    } catch (e) {}
    $('feeDiscount').addEventListener('change', () => {
        try { localStorage.setItem(FEE_DISCOUNT_KEY, String(getFeeDiscount())); } catch (e) {}
        render();
    });
    $('fPeriod').addEventListener('change', () => {
        $('customRange').style.display = $('fPeriod').value === 'custom' ? 'inline' : 'none';
        render();
    });
    ['fFrom', 'fTo', 'fType', 'fStrategy'].forEach(id => $(id).addEventListener('change', render));
    $('fSearch').addEventListener('input', render);
    $('editorBg').addEventListener('click', e => { if (e.target.id === 'editorBg') closeEditor(); });
    loadLedger();
})();
