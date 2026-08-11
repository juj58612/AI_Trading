// 2. 買入持有回測（獨立於 A/B/C/D 模型之外的純算術計算機）
// BACKTEST_API_URL / IS_LOCAL 由先載入的 backtest.js 宣告，這裡直接沿用同一份，不重複宣告。

let buyholdPoolTickers = [];
let buyholdPoolItems = []; // [{ticker, name_cn, category, subcategory}]
let buyholdSelectedTickers = [];
let buyholdPoolPrices = {}; // ticker -> {buy_price, buy_date, sell_price, sell_date}

const BUYHOLD_CAT_ORDER = [
    "一、晶片與IC設計", "二、晶圓製造與先進封裝", "三、關鍵零組件與上游原料",
    "四、伺服器與硬體設備", "五、散熱與電力能源", "六、軟體、軟硬整合與趨勢應用", "七、ETF"
];

function renderBuyholdPoolCheckboxes() {
    const box = document.getElementById('buyholdPoolCheckboxList');
    if (!box) return;
    if (buyholdPoolItems.length === 0) {
        box.innerHTML = '股池是空的';
        return;
    }

    // 依「大類/小類」分組，組內依代號排序
    const groups = {};
    buyholdPoolItems.forEach(item => {
        const key = item.subcategory ? `${item.category}｜${item.subcategory}` : item.category;
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
    });

    const orderedKeys = Object.keys(groups).sort((a, b) => {
        const catA = a.split('｜')[0], catB = b.split('｜')[0];
        const idxA = BUYHOLD_CAT_ORDER.indexOf(catA), idxB = BUYHOLD_CAT_ORDER.indexOf(catB);
        if (idxA !== idxB) return idxA - idxB;
        return a.localeCompare(b, 'zh-Hant');
    });

    const renderItemLabel = (item) => {
        const t = item.ticker;
        const p = buyholdPoolPrices[t];
        let priceText = '';
        if (p) {
            priceText = (p.buy_price != null && p.sell_price != null)
                ? ` <span style="color:var(--text-sub);">買${p.buy_price}/賣${p.sell_price}</span>`
                : ` <span style="color:var(--accent-red);">查無資料</span>`;
        }
        return `<label>
            <input type="checkbox" class="buyholdPoolCheckbox" value="${t}" ${buyholdSelectedTickers.includes(t) ? 'checked' : ''}>
            <span class="ticker-code">${t}</span><span>${item.name_cn}</span>${priceText}
        </label>`;
    };

    box.innerHTML = orderedKeys.map(key => {
        const title = key.replace('｜', ' — ');
        const itemsHtml = groups[key]
            .sort((a, b) => a.ticker.localeCompare(b.ticker))
            .map(renderItemLabel)
            .join('');
        return `<div class="buyhold-cat-group">
            <div class="buyhold-cat-title">${title}</div>
            <div class="buyhold-cat-items">${itemsHtml}</div>
        </div>`;
    }).join('');
}

function updateBuyholdSelectedSummary() {
    const el = document.getElementById('buyholdSelectedSummary');
    if (!el) return;
    if (buyholdSelectedTickers.length === 0) {
        el.textContent = '尚未選擇股票';
        return;
    }
    const names = buyholdSelectedTickers.map(t => {
        const item = buyholdPoolItems.find(i => i.ticker === t);
        return item ? item.name_cn : t;
    });
    el.textContent = `已選擇 ${buyholdSelectedTickers.length} 檔：${names.join('、')}`;
}

async function loadBuyholdPool() {
    try {
        const res = await fetch(`${BACKTEST_API_URL}/api/buyhold/pool`);
        const data = await res.json();
        buyholdPoolTickers = data.tickers || [];
        buyholdPoolItems = data.items || buyholdPoolTickers.map(t => ({ ticker: t, name_cn: t, category: '未分類', subcategory: '' }));
        buyholdSelectedTickers = buyholdSelectedTickers.filter(t => buyholdPoolTickers.includes(t));
        renderBuyholdPoolCheckboxes();
        updateBuyholdSelectedSummary();
    } catch (e) {
        console.error('讀取買入持有股池失敗', e);
    }
}

// 股池「買入時股價／賣出時股價」在勾選畫面就要看得到，不用等按下計算
async function fetchBuyholdPoolPrices() {
    if (buyholdPoolTickers.length === 0) return;
    try {
        const start = getBuyholdDateStr('Start');
        const end = getBuyholdDateStr('End');
        const res = await fetch(`${BACKTEST_API_URL}/api/buyhold/pool_prices?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}`);
        if (!res.ok) return;
        const data = await res.json();
        buyholdPoolPrices = data.prices || {};
        renderBuyholdPoolCheckboxes();
    } catch (e) {
        console.error('查詢股池買賣價失敗', e);
    }
}

window.toggleBuyholdPoolDropdown = function() {
    const panel = document.getElementById('buyholdPoolDropdownPanel');
    if (!panel) return;
    const opening = panel.style.display === 'none';
    panel.style.display = opening ? 'block' : 'none';
    if (opening) fetchBuyholdPoolPrices();
};

// 勾選/取消勾選當下就即時同步進 buyholdSelectedTickers，不用等按「確定」才生效——
// 之前的版本只有點「確定」才會存，使用者勾完不小心點到別處（外層自動收合）就會整批被重置，
// 這裡改成每次勾選狀態改變都立刻同步，「確定」純粹只是收合選單的方便按鈕，不是必要動作。
function syncBuyholdSelectionFromCheckboxes() {
    const checked = document.querySelectorAll('.buyholdPoolCheckbox:checked');
    buyholdSelectedTickers = Array.from(checked).map(cb => cb.value);
    updateBuyholdSelectedSummary();
}

document.addEventListener('change', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('buyholdPoolCheckbox')) {
        syncBuyholdSelectionFromCheckboxes();
        refreshBuyholdPricePreview();
    }
});

window.confirmBuyholdPoolSelection = function() {
    syncBuyholdSelectionFromCheckboxes();
    document.getElementById('buyholdPoolDropdownPanel').style.display = 'none';
    refreshBuyholdPricePreview();
};

// 點擊下拉選單以外的地方時自動收合（選取狀態已經即時同步過了，收合不會遺失勾選）
document.addEventListener('click', (e) => {
    const panel = document.getElementById('buyholdPoolDropdownPanel');
    const btn = document.getElementById('btnBuyholdPoolDropdown');
    if (!panel || panel.style.display === 'none') return;
    if (panel.contains(e.target) || (btn && btn.contains(e.target))) return;
    panel.style.display = 'none';
});

// ============================================================
// 張數／總價雙向試算：手續費／證交稅一律計入（後端已寫死不提供關閉選項），
// 只接受整張，總價欄位換算張數時一律無條件捨去、自動刪去湊不滿一張的零頭金額。
// ============================================================
const BUYHOLD_FEE_RATE_PREVIEW = 0.001425; // 僅供前端即時試算預覽，正式數字仍以後端 /api/buyhold/calculate 為準
let buyholdPreviewPrice = null;

function fmtBuyholdMoney(n) {
    return new Intl.NumberFormat('zh-TW').format(Math.round(n));
}

async function refreshBuyholdPricePreview() {
    const previewEl = document.getElementById('buyholdPricePreview');
    const summaryEl = document.getElementById('buyholdCostSummary');
    if (!previewEl) return;

    if (buyholdSelectedTickers.length === 0) {
        buyholdPreviewPrice = null;
        previewEl.textContent = '請先選擇股票並設定買入日期，才能試算張數與費用';
        if (summaryEl) summaryEl.textContent = '';
        return;
    }

    const ticker = buyholdSelectedTickers[0];
    const date = getBuyholdDateStr('Start');
    previewEl.textContent = '⏳ 查詢牌價中...';
    try {
        const res = await fetch(`${BACKTEST_API_URL}/api/buyhold/price_on_date?ticker=${encodeURIComponent(ticker)}&date=${encodeURIComponent(date)}`);
        if (!res.ok) {
            const err = await res.json();
            buyholdPreviewPrice = null;
            previewEl.innerHTML = `<span style="color:var(--accent-red);">⚠️ ${err.detail || '查詢失敗'}</span>`;
            return;
        }
        const data = await res.json();
        buyholdPreviewPrice = data.price;
        const multiNote = buyholdSelectedTickers.length > 1
            ? `（其餘 ${buyholdSelectedTickers.length - 1} 檔股票張數相同，但各自依自己的股價計算總金額，實際各檔金額以下方計算結果為準）`
            : '';
        previewEl.innerHTML = `依 <b>${data.ticker}</b> 於 ${data.date} 收盤價 <b>${data.price}</b> 元試算（已內含手續費／證交稅）${multiNote}`;

        // 牌價查到後，依目前已經填的那一欄重新換算一次
        const lotsVal = document.getElementById('buyholdLots').value;
        const totalVal = document.getElementById('buyholdTotalCost').value;
        if (lotsVal) {
            recomputeBuyholdFromLots();
        } else if (totalVal) {
            recomputeBuyholdFromTotalCost();
        }
    } catch (e) {
        buyholdPreviewPrice = null;
        previewEl.innerHTML = `<span style="color:var(--accent-red);">⚠️ 無法連線查詢牌價</span>`;
    }
}

function recomputeBuyholdFromLots() {
    const lotsInput = document.getElementById('buyholdLots');
    const totalInput = document.getElementById('buyholdTotalCost');
    const summaryEl = document.getElementById('buyholdCostSummary');
    const lots = Math.floor(parseFloat(lotsInput.value) || 0);
    if (lots !== parseFloat(lotsInput.value)) lotsInput.value = lots || '';

    if (!buyholdPreviewPrice) return;
    if (!lots || lots <= 0) {
        totalInput.value = '';
        if (summaryEl) summaryEl.textContent = '';
        return;
    }
    const cost = lots * 1000 * buyholdPreviewPrice * (1 + BUYHOLD_FEE_RATE_PREVIEW);
    totalInput.value = fmtBuyholdMoney(cost);
    if (summaryEl) summaryEl.textContent = `📌 購買 ${lots} 張，費用共 ${fmtBuyholdMoney(cost)} 元（依第一檔所選股票試算）`;
}

function recomputeBuyholdFromTotalCost() {
    const lotsInput = document.getElementById('buyholdLots');
    const totalInput = document.getElementById('buyholdTotalCost');
    const summaryEl = document.getElementById('buyholdCostSummary');
    const rawBudget = parseFloat((totalInput.value || '').replace(/,/g, '')) || 0;

    if (!buyholdPreviewPrice) return;
    if (!rawBudget || rawBudget <= 0) {
        lotsInput.value = '';
        if (summaryEl) summaryEl.textContent = '';
        return;
    }

    const costPerLot = 1000 * buyholdPreviewPrice * (1 + BUYHOLD_FEE_RATE_PREVIEW);
    const lots = Math.floor(rawBudget / costPerLot);

    if (lots <= 0) {
        lotsInput.value = '';
        totalInput.value = '';
        if (summaryEl) summaryEl.innerHTML = `<span style="color:var(--accent-red);">⚠️ 預算不足以購買一整張（至少需要 ${fmtBuyholdMoney(costPerLot)} 元）</span>`;
        return;
    }

    const actualCost = lots * costPerLot;
    const unused = rawBudget - actualCost;
    lotsInput.value = lots;
    totalInput.value = fmtBuyholdMoney(actualCost); // 自動刪去湊不滿一張的零頭金額
    if (summaryEl) summaryEl.textContent = `📌 可購買 ${lots} 張，實際費用共 ${fmtBuyholdMoney(actualCost)} 元（依第一檔所選股票試算，多餘 ${fmtBuyholdMoney(unused)} 元不足一張未使用）`;
}

async function checkBuyholdDbStatus() {
    const statusEl = document.getElementById('buyholdDbStatus');
    if (!statusEl) return;
    try {
        const res = await fetch(`${BACKTEST_API_URL}/api/buyhold/status`);
        const data = await res.json();
        if (data.status === 'empty') {
            statusEl.innerHTML = '<span style="color:#94a3b8;">📭 股池目前是空的（固定名單尚未設定，請於 custom_stock_list.txt 設定）</span>';
        } else if (data.status === 'ok') {
            const covered = data.covered ?? 0;
            const pool = data.pool_size ?? 0;
            const isComplete = covered >= pool;
            const dateRange = (data.date_start && data.date_end) ? `${data.date_start} ~ ${data.date_end}` : '未知';
            const scoreHtml = `<span style="font-weight:bold; background:rgba(0,0,0,0.25); padding:1px 8px; border-radius:5px;">${covered}/${pool}</span>`;
            if (isComplete) {
                statusEl.innerHTML = `<span style="color: #4ade80;">✅ 已就緒 ${scoreHtml}，資料期間 ${dateRange}（最後更新: ${data.last_updated}）</span>`;
            } else {
                const missingPreview = (data.missing_tickers || []).slice(0, 8).join('、') + ((data.missing_tickers || []).length > 8 ? ' 等' : '');
                statusEl.innerHTML = `<span style="color: #fbbf24;">⚠️ 資料不完整 ${scoreHtml}，資料期間 ${dateRange}（最後更新: ${data.last_updated}）<br><span style="font-size:0.85em;">缺：${missingPreview}，建議再次點擊「同步歷史資料庫」補齊</span></span>`;
            }
        } else {
            statusEl.innerHTML = `<span style="color: #f87171;">❌ 找不到資料庫，請點擊同步</span>`;
        }
    } catch (e) {
        statusEl.innerHTML = `<span style="color: #f87171;">❌ 無法連線至回測引擎 (Port 58889)</span>`;
    }
}

let buyholdLastResults = []; // 供「匯出」按鈕使用，記住最近一次計算結果（已依報酬率排序）

function buyholdTickerName(ticker) {
    const item = buyholdPoolItems.find(i => i.ticker === ticker);
    return item ? item.name_cn : ticker;
}

function renderBuyholdResults(results) {
    const container = document.getElementById('buyholdResultsContainer');
    const body = document.getElementById('buyholdResultsBody');
    if (!container || !body) return;

    if (!results || results.length === 0) {
        container.style.display = 'none';
        buyholdLastResults = [];
        return;
    }

    // 依報酬率由高到低排序，查詢失敗（沒有 pnl_pct）的排到最後面
    const sorted = [...results].sort((a, b) => {
        if (a.error && b.error) return 0;
        if (a.error) return 1;
        if (b.error) return -1;
        return b.pnl_pct - a.pnl_pct;
    });
    buyholdLastResults = sorted;

    body.innerHTML = sorted.map(r => {
        const nameCn = buyholdTickerName(r.ticker);
        if (r.error) {
            return `<tr><td style="text-align:left;">${r.ticker} ${nameCn}</td><td colspan="11" style="color:var(--accent-green); text-align:left;">⚠️ ${r.error}</td></tr>`;
        }
        const pnlColor = r.pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
        const fmt = (n) => new Intl.NumberFormat('zh-TW').format(Math.round(n));
        return `<tr>
            <td style="text-align:left;">${r.ticker} ${nameCn}</td>
            <td>${r.start_date}</td>
            <td>${r.end_date}</td>
            <td>${r.start_price}</td>
            <td>${r.end_price}</td>
            <td>${r.shares}</td>
            <td>${fmt(r.buy_cost)}</td>
            <td>${fmt(r.end_market_value)}</td>
            <td>${fmt(r.total_dividends)}</td>
            <td style="color:${pnlColor}; font-weight:bold;">${r.pnl >= 0 ? '+' : ''}${fmt(r.pnl)}</td>
            <td style="color:${pnlColor}; font-weight:bold;">${r.pnl_pct >= 0 ? '+' : ''}${r.pnl_pct}%</td>
            <td style="color:${pnlColor};">${r.annualized_pct >= 0 ? '+' : ''}${r.annualized_pct}%</td>
        </tr>`;
    }).join('');

    container.style.display = 'block';
}

// 匯出成 CSV（帶 UTF-8 BOM，Google 試算表/Excel 都能正確讀取中文，不會亂碼）
window.exportBuyholdResultsToCSV = function() {
    if (!buyholdLastResults || buyholdLastResults.length === 0) {
        alert('目前沒有計算結果可供匯出，請先點擊「開始計算買入持有績效」。');
        return;
    }

    let csvContent = "﻿";
    csvContent += "代號,名稱,買入日,結算日,買入價,結算價,股數,投入成本,期末市值,累積配息,總損益,報酬率,年化報酬率\n";

    buyholdLastResults.forEach(r => {
        const nameCn = `"${(buyholdTickerName(r.ticker) || '').replace(/"/g, '""')}"`;
        if (r.error) {
            csvContent += `${r.ticker},${nameCn},,,,,,,,,,"${(r.error || '').replace(/"/g, '""')}",\n`;
            return;
        }
        csvContent += `${r.ticker},${nameCn},${r.start_date},${r.end_date},${r.start_price},${r.end_price},${r.shares},${r.buy_cost},${r.end_market_value},${r.total_dividends},${r.pnl},${r.pnl_pct}%,${r.annualized_pct}%\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `買入持有回測結果_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

function getBuyholdDateStr(prefix) {
    const y = document.getElementById(`btBh${prefix}Year`).value;
    const m = document.getElementById(`btBh${prefix}Month`).value;
    const d = document.getElementById(`btBh${prefix}Day`).value;
    return `${y}-${m}-${d}`;
}

window.addEventListener('DOMContentLoaded', () => {
    if (typeof initDateDropdowns === 'function') {
        initDateDropdowns('BhStart', '2021-01-01');
        const todayStr = new Date().toISOString().slice(0, 10);
        initDateDropdowns('BhEnd', todayStr);
    }

    if (IS_LOCAL) {
        loadBuyholdPool();
        checkBuyholdDbStatus();
    }

    const buyholdLotsInput = document.getElementById('buyholdLots');
    if (buyholdLotsInput) buyholdLotsInput.addEventListener('input', recomputeBuyholdFromLots);
    const buyholdTotalCostInput = document.getElementById('buyholdTotalCost');
    if (buyholdTotalCostInput) buyholdTotalCostInput.addEventListener('input', recomputeBuyholdFromTotalCost);

    // 買入日期改變時，張數/總價試算依據的牌價也要跟著重新查詢
    ['btBhStartYear', 'btBhStartMonth', 'btBhStartDay'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', refreshBuyholdPricePreview);
    });
    // 買入/結算日期改變時，勾選清單裡顯示的「買/賣價格」也要重新查詢
    ['btBhStartYear', 'btBhStartMonth', 'btBhStartDay', 'btBhEndYear', 'btBhEndMonth', 'btBhEndDay'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', fetchBuyholdPoolPrices);
    });

    const btnSyncBuyholdDB = document.getElementById('btnSyncBuyholdDB');
    if (btnSyncBuyholdDB) {
        btnSyncBuyholdDB.addEventListener('click', async () => {
            btnSyncBuyholdDB.disabled = true;
            const originalText = btnSyncBuyholdDB.textContent;
            btnSyncBuyholdDB.textContent = '⏳ 正在斷點續傳歷史資料 (中斷可接續)...';
            try {
                const res = await fetch(`${BACKTEST_API_URL}/api/buyhold/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': getAuthHeader() },
                    body: JSON.stringify({})
                });
                if (res.ok) {
                    const data = await res.json();
                    alert(data.skipped ? `⏭️ ${data.message}` : `✅ ${data.message}`);
                    checkBuyholdDbStatus();
                } else {
                    const error = await res.json();
                    alert('❌ 同步失敗: ' + (error.detail || '未知錯誤'));
                }
            } catch (e) {
                alert('❌ 同步失敗，請檢查伺服器連線 (Port 58889)');
            } finally {
                btnSyncBuyholdDB.disabled = false;
                btnSyncBuyholdDB.textContent = originalText;
            }
        });
    }

    const btnRunBuyhold = document.getElementById('btnRunBuyhold');
    if (btnRunBuyhold) {
        btnRunBuyhold.addEventListener('click', async () => {
            if (buyholdSelectedTickers.length === 0) {
                alert('請先點選「選擇要測試的股票」，勾選至少一檔並按下確定！');
                return;
            }
            // 沒設定張數（或不小心清空）時預設用 1 張計算，不擋使用者、不用跳警示
            const lotsRaw = Math.floor(parseFloat(document.getElementById('buyholdLots').value) || 0);
            const lots = lotsRaw > 0 ? lotsRaw : 1;
            const payload = {
                tickers: buyholdSelectedTickers,
                start_date: getBuyholdDateStr('Start'),
                end_date: getBuyholdDateStr('End'),
                shares: lots * 1000
            };

            btnRunBuyhold.disabled = true;
            const originalText = btnRunBuyhold.textContent;
            btnRunBuyhold.textContent = '⏳ 計算中...';
            try {
                const res = await fetch(`${BACKTEST_API_URL}/api/buyhold/calculate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    const data = await res.json();
                    renderBuyholdResults(data.results);
                } else {
                    const error = await res.json();
                    alert('❌ 計算失敗: ' + (error.detail || '未知錯誤'));
                }
            } catch (e) {
                alert('❌ 計算失敗，請檢查伺服器連線 (Port 58889)');
            } finally {
                btnRunBuyhold.disabled = false;
                btnRunBuyhold.textContent = originalText;
            }
        });
    }
});
