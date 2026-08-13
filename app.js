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
    { ticker: "2303", name: "2303 聯電", price: 55 }, { ticker: "6230", name: "6230 尼得科超眾", price: 150 },
    // 2026-08-05 新增：矽光子/CPO 光通訊供應鏈補強（price 為粗略參考價，首次掃描後會被即時價覆蓋）
    { ticker: "3081", name: "3081 聯亞", price: 1965 }, { ticker: "3105", name: "3105 穩懋", price: 541 },
    { ticker: "2455", name: "2455 全新", price: 180 }, { ticker: "3163", name: "3163 波若威", price: 400 },
    { ticker: "3363", name: "3363 上詮", price: 600 }, { ticker: "6442", name: "6442 光聖", price: 500 },
    { ticker: "3380", name: "3380 明泰", price: 90 }, { ticker: "6830", name: "6830 汎銓", price: 700 },
    { ticker: "3587", name: "3587 閎康", price: 300 }, { ticker: "3289", name: "3289 宜特", price: 150 },
    // 2026-08-09 新增：AI硬體供應鏈六大類擴充（晶片設計/晶圓封測/關鍵材料/伺服器/散熱電力/軟體）
    // 修正：這批56檔先前只寫進了 ai_stock_list.txt / backtest_engine.py，沒同步加進這裡，
    // 導致首頁掃描永遠只送70檔（AI_STOCKS_CONFIG舊長度）給後端，「強制重新掃描」不管按幾次
    // 都補不滿126檔，是這個bug的真正原因，不是連線不穩定。
    { ticker: "1503", name: "1503 士林電機", price: 197 }, { ticker: "1513", name: "1513 中興電工", price: 160.5 },
    { ticker: "1514", name: "1514 亞力電機", price: 102 }, { ticker: "1519", name: "1519 華城電機", price: 703 },
    { ticker: "1560", name: "1560 中砂科技", price: 687 }, { ticker: "1609", name: "1609 大亞電線電纜", price: 37.15 },
    { ticker: "2301", name: "2301 光寶科技", price: 268.5 }, { ticker: "2337", name: "2337 旺宏電子", price: 132.5 },
    { ticker: "2355", name: "2355 敬鵬工業", price: 42.5 }, { ticker: "2385", name: "2385 群光電子", price: 104.5 },
    { ticker: "2404", name: "2404 漢唐集成", price: 1150 }, { ticker: "2412", name: "2412 中華電信", price: 136 },
    { ticker: "2436", name: "2436 偉詮電子", price: 67 }, { ticker: "2458", name: "2458 義隆電子", price: 145.5 },
    { ticker: "2480", name: "2480 敦陽科技", price: 153 }, { ticker: "2492", name: "2492 華新科技", price: 300.5 },
    { ticker: "3005", name: "3005 神基科技", price: 114.5 }, { ticker: "3413", name: "3413 京鼎精密", price: 305.5 },
    { ticker: "3532", name: "3532 台勝科", price: 284 }, { ticker: "4755", name: "4755 三福化工", price: 119 },
    { ticker: "4958", name: "4958 臻鼎-KY", price: 490 }, { ticker: "5388", name: "5388 中磊電子", price: 91.1 },
    { ticker: "5434", name: "5434 崇越科技", price: 522 }, { ticker: "6166", name: "6166 凌華科技", price: 136 },
    { ticker: "6183", name: "6183 關貿網路", price: 93.5 }, { ticker: "6196", name: "6196 帆宣系統", price: 510 },
    { ticker: "6202", name: "6202 盛群半導體", price: 64.3 }, { ticker: "6206", name: "6206 Flytech", price: 143 },
    { ticker: "6214", name: "6214 精誠資訊", price: 143 }, { ticker: "6239", name: "6239 力成科技", price: 282.5 },
    { ticker: "6257", name: "6257 矽格科技", price: 204.5 }, { ticker: "6269", name: "6269 台郡科技", price: 67.4 },
    { ticker: "6285", name: "6285 啟碁科技", price: 254 }, { ticker: "6412", name: "6412 群光電能", price: 78.8 },
    { ticker: "6415", name: "6415 矽力*-KY", price: 466.5 }, { ticker: "6438", name: "6438 迅得機械", price: 145 },
    { ticker: "6533", name: "6533 晶心科技", price: 250 }, { ticker: "6719", name: "6719 力智電子", price: 206.5 },
    { ticker: "6770", name: "6770 力積電", price: 67 }, { ticker: "8081", name: "8081 致新科技", price: 270 },
    { ticker: "8114", name: "8114 振樺電子", price: 211.5 }, { ticker: "3227", name: "3227 原相科技", price: 209 },
    { ticker: "3374", name: "3374 精材科技", price: 334 }, { ticker: "3438", name: "3438 類比科技", price: 59.8 },
    { ticker: "3680", name: "3680 家登精密", price: 445 }, { ticker: "4979", name: "4979 LuxNet", price: 510 },
    { ticker: "4991", name: "4991 GCS Holdings", price: 481 }, { ticker: "5227", name: "5227 立凱-KY", price: 34.45 },
    { ticker: "5347", name: "5347 世界先進", price: 158 }, { ticker: "5483", name: "5483 中美矽晶", price: 168.5 },
    { ticker: "6182", name: "6182 合晶科技", price: 94 }, { ticker: "6223", name: "6223 旺矽科技", price: 6315 },
    { ticker: "6488", name: "6488 環球晶圓", price: 849 }, { ticker: "6510", name: "6510 中華精測", price: 2800 },
    { ticker: "8050", name: "8050 廣積科技", price: 61.6 }, { ticker: "8086", name: "8086 宏捷科", price: 116.5 }
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

function updateUserBadge() {
    const creds = getAuthCredentials();
    const badge = document.getElementById('userStatusBadge');
    if (badge) {
        if (!creds) {
            badge.innerHTML = `👤 未登入 <a href="javascript:void(0)" onclick="openAuthModal(false)" style="color:#f59e0b; margin-left:6px; font-size:0.85rem; text-decoration:underline;">🔑 邀請碼開戶/登入</a>`;
        } else if (creds.username === 'cyc58612') {
            badge.innerHTML = `👤 管理者 (cyc58612) <a href="admin_users.html" style="color:#3b82f6; margin-left:6px; font-size:0.8rem; text-decoration:underline;">🔐 帳號管理</a> <a href="javascript:void(0)" onclick="logoutUser()" style="color:#ef4444; margin-left:6px; font-size:0.8rem; text-decoration:underline;">登出</a>`;
        } else {
            badge.innerHTML = `👤 用戶 (${creds.username}) <a href="javascript:void(0)" onclick="logoutUser()" style="color:#ef4444; margin-left:6px; font-size:0.8rem; text-decoration:underline;">登出</a>`;
        }
    }
}

function logoutUser() {
    localStorage.removeItem('ai_trading_user');
    alert('已成功登出！');
    location.reload();
}

let isAuthModeLogin = false;
function openAuthModal(isLogin = false) {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    isAuthModeLogin = isLogin;
    
    const title = document.getElementById('authTitle');
    const subtitle = document.getElementById('authSubtitle');
    const inviteContainer = document.getElementById('inviteCodeContainer');
    const btnSubmit = document.getElementById('btnAuthSubmit');
    const toggleText = document.getElementById('authToggleText');
    const btnToggle = document.getElementById('btnAuthToggle');
    const errorMsg = document.getElementById('authErrorMsg');
    const passwordInput = document.getElementById('authPassword');

    if (errorMsg) errorMsg.style.display = 'none';

    if (isAuthModeLogin) {
        if (title) title.textContent = '🔒 VIP 用戶登入';
        if (subtitle) subtitle.textContent = '請輸入您開戶時自訂的帳號與密碼！';
        if (inviteContainer) inviteContainer.style.display = 'none';
        if (btnSubmit) btnSubmit.textContent = '🔑 立即登入';
        if (toggleText) toggleText.textContent = '還沒有帳號？';
        if (btnToggle) btnToggle.textContent = '輸入邀請碼開戶註冊';
        // 登入模式：提示瀏覽器「請幫我填入已儲存的密碼」
        if (passwordInput) passwordInput.setAttribute('autocomplete', 'current-password');
    } else {
        if (title) title.textContent = '🔑 VIP 邀請碼開戶註冊';
        if (subtitle) subtitle.textContent = '輸入管理者發放的專屬邀請碼，即可開立獨立帳戶！';
        if (inviteContainer) inviteContainer.style.display = 'block';
        if (btnSubmit) btnSubmit.textContent = '✨ 立即註冊並開戶';
        if (toggleText) toggleText.textContent = '已有帳號？';
        if (btnToggle) btnToggle.textContent = '切換至登入';
        // 註冊模式：提示瀏覽器「這是一組新密碼，送出成功後可以問要不要存起來」
        if (passwordInput) passwordInput.setAttribute('autocomplete', 'new-password');
    }

    modal.style.display = 'flex';
}

document.addEventListener('DOMContentLoaded', () => {
    updateUserBadge();
    const creds = getAuthCredentials();
    if (!creds) {
        openAuthModal(false);
    }
    
    const btnToggle = document.getElementById('btnAuthToggle');
    if (btnToggle) {
        btnToggle.addEventListener('click', () => {
            openAuthModal(!isAuthModeLogin);
        });
    }
    
    const authForm = document.getElementById('authForm');
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorMsg = document.getElementById('authErrorMsg');
            if (errorMsg) errorMsg.style.display = 'none';
            
            const username = document.getElementById('authUsername').value.trim();
            const password = document.getElementById('authPassword').value.trim();
            const inviteCode = document.getElementById('authInviteCode').value.trim();
            
            if (isAuthModeLogin) {
                try {
                    const res = await fetch(`${API_BASE_URL}/api/login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password })
                    });
                    const data = await res.json();
                    if (res.ok && data.status === 'success') {
                        const authHeader = "Basic " + btoa(username + ":" + password);
                        localStorage.setItem('ai_trading_user', JSON.stringify({ username: data.username, authHeader }));
                        alert(`歡迎回來，${data.username}！已載入您的獨立庫存紀錄。`);
                        document.getElementById('authModal').style.display = 'none';
                        location.reload();
                    } else {
                        if (errorMsg) {
                            errorMsg.textContent = data.detail || '登入失敗，請確認帳密！';
                            errorMsg.style.display = 'block';
                        }
                    }
                } catch(e) {
                    if (errorMsg) {
                        errorMsg.textContent = '連線失敗: ' + e.message;
                        errorMsg.style.display = 'block';
                    }
                }
            } else {
                try {
                    const res = await fetch(`${API_BASE_URL}/api/register`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ invite_code: inviteCode, username, password })
                    });
                    const data = await res.json();
                    if (res.ok && data.status === 'success') {
                        const authHeader = "Basic " + btoa(username + ":" + password);
                        localStorage.setItem('ai_trading_user', JSON.stringify({ username: data.username, authHeader }));
                        alert(`🎉 開戶成功！歡迎您，${data.username}！您已擁有獨立的個人持庫紀錄。`);
                        document.getElementById('authModal').style.display = 'none';
                        location.reload();
                    } else {
                        if (errorMsg) {
                            errorMsg.textContent = data.detail || '註冊失敗！';
                            errorMsg.style.display = 'block';
                        }
                    }
                } catch(e) {
                    if (errorMsg) {
                        errorMsg.textContent = '連線失敗: ' + e.message;
                        errorMsg.style.display = 'block';
                    }
                }
            }
        });
    }
});

// 說明文本 Modal 控制邏輯
const btnOpenDoc = document.getElementById('btnOpenDoc');
const btnCloseDoc = document.getElementById('btnCloseDoc');
const docModal = document.getElementById('docModal');
const docContent = document.getElementById('docContent');

if (btnOpenDoc) {
    btnOpenDoc.addEventListener('click', async () => {
        if (docModal) docModal.style.display = 'flex';
        if (docContent) {
            docContent.textContent = '🔄 正在載入最新策略白皮書與系統說明...';
            try {
                const res = await fetch(`${API_BASE_URL}/api/doc`);
                if (res.ok) {
                    const data = await res.json();
                    docContent.textContent = data.content;
                } else {
                    docContent.textContent = '❌ 無法讀取說明文件。';
                }
            } catch(e) {
                docContent.textContent = '❌ 連線失敗: ' + e.message;
            }
        }
    });
}

if (btnCloseDoc && docModal) {
    btnCloseDoc.addEventListener('click', () => {
        docModal.style.display = 'none';
    });
}

async function savePortfolioToStorage() {
    try {
        await fetch(`${API_BASE_URL}/api/portfolio`, {
            method: 'POST',
            headers: { 
                'Authorization': getAuthHeader(),
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify(myPortfolio)
        });
    } catch(e) {
        console.error("儲存庫存失敗", e);
    }
}

async function loadPortfolioFromStorage() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/portfolio`, {
            headers: { 'Authorization': getAuthHeader() }
        });
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

function buildSparklineSVG(prices) {
    if (!prices || prices.length < 2) return '';
    const w = 280, h = 50, pad = 4;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const stepX = (w - pad * 2) / (prices.length - 1);
    const coords = prices.map((p, i) => ({
        x: pad + i * stepX,
        y: pad + (1 - (p - min) / range) * (h - pad * 2)
    }));
    const points = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const last = coords[coords.length - 1];
    const up = prices[prices.length - 1] >= prices[0];
    const color = up ? 'var(--accent-green)' : 'var(--accent-red)';
    return `<svg viewBox="0 0 ${w} ${h}" style="width:100%; height:50px; display:block; margin-bottom:8px;">
        <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="3" fill="${color}"/>
    </svg>`;
}

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

            const history7El = document.getElementById(`${prefix}history7-${ticker}`);
            if (history7El) {
                const dates7 = (data.history_dates || []).slice(-7);
                const prices7 = (data.history_prices || []).slice(-7);
                if (dates7.length > 0) {
                    const sparklineSvg = buildSparklineSVG(prices7);
                    const rowsHtml = dates7.map((d, i) => {
                        const p = prices7[i];
                        const prevP = i > 0 ? prices7[i - 1] : p;
                        const color = p > prevP ? 'var(--accent-green)' : (p < prevP ? 'var(--accent-red)' : 'var(--text-main)');
                        return `<div style="text-align:center; flex:1;"><div style="color:var(--text-sub); font-size:0.7rem;">${d}</div><div style="color:${color}; font-weight:bold; font-size:0.8rem;">${p}</div></div>`;
                    }).join('');
                    history7El.innerHTML = `${sparklineSvg}<div style="display:flex; justify-content:space-between; gap:4px;">${rowsHtml}</div>`;
                } else {
                    history7El.innerHTML = `<span style="color:var(--text-sub); font-size:0.75rem;">無資料</span>`;
                }
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

function updateStaleDataBanner(scanResult, totalRequested) {
    const banner = document.getElementById('staleDataBanner');
    if (!banner) return;

    const count = (scanResult && scanResult.data) ? scanResult.data.length : 0;
    const total = (scanResult && scanResult.pool_size) || totalRequested || count;
    const cacheDate = (scanResult && scanResult.cache_date) || '';

    if (scanResult && scanResult.fallback) {
        banner.style.display = 'block';
        banner.style.background = 'rgba(239, 68, 68, 0.15)';
        banner.style.borderColor = 'var(--accent-red)';
        banner.style.color = 'var(--accent-red)';
        banner.textContent = `⚠️ 掃描失敗，畫面顯示的是 ${scanResult.cache_date || '先前'} 保存的舊資料，非今日最新盤後資訊。建議稍後再按一次掃描重試。`;
    } else if (scanResult && scanResult.cached && total > 0 && count < total * 0.8) {
        // 今日快取本身就不完整（例如第一次掃描只抓到部分檔數），不能用信心滿滿的藍色語氣帶過
        banner.style.display = 'block';
        banner.style.background = 'rgba(245, 158, 11, 0.15)';
        banner.style.borderColor = 'var(--accent-yellow)';
        banner.style.color = 'var(--accent-yellow)';
        banner.innerHTML = `⚠️ <span style="display:inline-block; background:rgba(0,0,0,0.25); padding:2px 10px; border-radius:6px; font-size:1.1em; margin:0 4px;">${count}/${total}</span> 今日${cacheDate ? ` (${cacheDate})` : ''} 快取尚不完整。再按一次「強制重新掃描」可以補齊缺漏的檔位，不會從頭重來。`;
    } else if (scanResult && scanResult.cached) {
        banner.style.display = 'block';
        banner.style.background = 'rgba(59, 130, 246, 0.12)';
        banner.style.borderColor = 'var(--accent-blue)';
        banner.style.color = 'var(--accent-blue)';
        banner.textContent = `⚡ 已使用今日${cacheDate ? ` (${cacheDate})` : ''} 快取資料，共 ${count} 檔，無需重新連線。`;
    } else if (total > 0 && count < total * 0.8) {
        banner.style.display = 'block';
        banner.style.background = 'rgba(245, 158, 11, 0.15)';
        banner.style.borderColor = 'var(--accent-yellow)';
        banner.style.color = 'var(--accent-yellow)';
        banner.textContent = `⚠️ 本次即時掃描${cacheDate ? `（${cacheDate}）` : ''}僅成功取得 ${count}/${total} 檔資料，可能是暫時性連線問題，建議稍後再按一次掃描補齊。`;
    } else if (total > 0) {
        banner.style.display = 'block';
        banner.style.background = 'rgba(16, 185, 129, 0.12)';
        banner.style.borderColor = '#10b981';
        banner.style.color = '#10b981';
        banner.textContent = `✅ 掃描成功${cacheDate ? `（${cacheDate}）` : ''}，取得 ${count}/${total} 檔最新盤後資料。`;
    } else {
        banner.style.display = 'none';
        banner.textContent = '';
    }

    const rescanBtn = document.getElementById('btnForceRescan');
    if (rescanBtn) {
        rescanBtn.style.display = (total > 0 && count < total && !(scanResult && scanResult.fallback)) ? 'inline-block' : 'none';
    }
}

function updateMacroStatusBanner(scanResult) {
    const banner = document.getElementById('macroStatusBanner');
    if (!banner) return;

    const macro = scanResult && scanResult.macro_status;
    if (!macro || (!macro.veto_buy && !(macro.pos_scale < 1.0))) {
        banner.style.display = 'none';
        banner.textContent = '';
        return;
    }

    banner.style.display = 'block';
    if (macro.veto_buy) {
        banner.style.background = 'rgba(5, 150, 105, 0.15)';
        banner.style.border = '1px solid #059669';
        banner.style.color = '#059669';
    } else {
        banner.style.background = 'rgba(245, 158, 11, 0.15)';
        banner.style.border = '1px solid var(--accent-yellow)';
        banner.style.color = 'var(--accent-yellow)';
    }
    banner.textContent = `${macro.title || ''}：${macro.advice || ''}`;
}

function updateMarketWeather(ratio) {
    let container = document.getElementById('market-weather-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'market-weather-container';
        container.style.cssText = 'margin: 0px 0 20px 0; padding: 16px 20px; border-radius: 12px; font-weight: bold; text-align: center; font-size: 1.15rem; grid-column: 1/-1; border-width: 2px; border-style: solid; box-shadow: 0 4px 16px rgba(0,0,0,0.3);';
        stocksGrid.parentNode.insertBefore(container, stocksGrid);
    }

    if (ratio > 75) {
        container.style.background = '#ea580c'; // 橘色實心底
        container.style.borderColor = '#c2410c';
        container.style.color = '#ffffff';
        container.innerHTML = `🟠 當前市況：高檔震盪 / 末升段 (AI 族群健康度：${ratio.toFixed(1)}%)<br><span style="font-size:0.95rem; font-weight:500; color: rgba(255, 255, 255, 0.95); margin-top: 4px; display: inline-block;">建議：市場過熱，隨時拉回，嚴格鎖利，當心拉積盤出貨。</span>`;
    } else if (ratio >= 45 && ratio <= 75) {
        container.style.background = '#dc2626'; // 紅色實心底 (多頭)
        container.style.borderColor = '#b91c1c';
        container.style.color = '#ffffff';
        container.innerHTML = `🔴 當前市況：穩定多頭 (AI 族群健康度：${ratio.toFixed(1)}%)<br><span style="font-size:0.95rem; font-weight:500; color: rgba(255, 255, 255, 0.95); margin-top: 4px; display: inline-block;">建議：全面進攻，採等權重分配買滿排名前三標的。</span>`;
    } else if (ratio >= 25 && ratio < 45) {
        container.style.background = '#d97706'; // 琥珀黃實心底
        container.style.borderColor = '#b45309';
        container.style.color = '#ffffff';
        container.innerHTML = `🟡 當前市況：破底翻 / 築底期 (AI 族群健康度：${ratio.toFixed(1)}%)<br><span style="font-size:0.95rem; font-weight:500; color: rgba(255, 255, 255, 0.95); margin-top: 4px; display: inline-block;">建議：多頭初醒，可小額試單前三名黑馬，分批佈局。</span>`;
    } else if (ratio >= 10 && ratio < 25) {
        container.style.background = '#16a34a'; // 綠色實心底 (台股股災色)
        container.style.borderColor = '#15803d';
        container.style.color = '#ffffff';
        container.innerHTML = `🟢 當前市況：無差別股災 (AI 族群健康度：${ratio.toFixed(1)}%)<br><span style="font-size:0.95rem; font-weight:500; color: rgba(255, 255, 255, 0.95); margin-top: 4px; display: inline-block;">建議：覆巢之下無完卵，空手觀望，保留現金。</span>`;
    } else {
        container.style.background = '#059669'; // 深綠實心底 (極度恐慌)
        container.style.borderColor = '#047857';
        container.style.color = '#ffffff';
        container.innerHTML = `🟢 當前市況：極度恐慌 / 融資斷頭期 (AI 族群健康度：${ratio.toFixed(1)}%)<br><span style="font-size:0.95rem; font-weight:500; color: rgba(255, 255, 255, 0.95); margin-top: 4px; display: inline-block;">建議：乖離過大，隨時有暴力反彈 (V轉)，準備搶短。</span>`;
    }
}

async function renderStockCards(count, forceRefresh = false) {
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
            body: JSON.stringify({ tickers, force_refresh: forceRefresh })
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
        updateStaleDataBanner(scanResult, tickers.length);
        updateMacroStatusBanner(scanResult);

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
            
            <div class="inputs-container" style="grid-template-columns: 1fr 1fr;">
                <div class="input-box"><label>關鍵支撐 ($S_{key}$)</label><input type="number" id="supp-${stock.ticker}" value="" placeholder="自動填入前低"></div>
                <div class="input-box"><label>波段最高收盤價</label><input type="number" id="high-${stock.ticker}" value="0" readonly title="系統將自動根據收盤價更新最高水位"></div>
                <input type="hidden" id="cost-${stock.ticker}" value="">
                <input type="hidden" id="shares-${stock.ticker}" value="1">
            </div>

            <div class="card-results">
                <div class="res-row"><span>防線A (成本-8%~10%):</span><span class="val-red" id="resA-${stock.ticker}">-</span></div>
                <div class="res-row"><span>防線B (破 $S_{key}$ 停損):</span><span class="val-red" id="resB-${stock.ticker}">-</span></div>
                <div class="res-row"><span>保本停利 (+15%鎖+5%):</span><span class="val-green" id="resWin-${stock.ticker}">-</span></div>
                <div class="res-row"><span>實質高點打折鎖利:</span><span class="val-yellow" id="resDD-${stock.ticker}">-</span></div>
            </div>
            <div class="card-results" style="margin-top:8px;">
                <div style="font-size:0.8rem; color:var(--text-sub); margin-bottom:6px;">📈 近7日收盤價</div>
                <div id="history7-${stock.ticker}">
                    <span style="color:var(--text-sub); font-size:0.75rem;">載入中...</span>
                </div>
            </div>
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
        updateStaleDataBanner(scanResult, tickers.length);
        updateMacroStatusBanner(scanResult);

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
            
            <div class="inputs-container" style="grid-template-columns: 1fr 1fr;">
                <div class="input-box"><label>關鍵壓力 ($R_{key}$)</label><input type="number" id="sell-supp-${stock.ticker}" value=""></div>
                <div class="input-box"><label>波段最低收盤價</label><input type="number" id="sell-high-${stock.ticker}" value="0" readonly title="系統將自動根據收盤價更新最低水位"></div>
                <input type="hidden" id="sell-cost-${stock.ticker}" value="">
                <input type="hidden" id="sell-shares-${stock.ticker}" value="1">
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

            <div class="card-results" style="margin-top:8px;">
                <div style="font-size:0.8rem; color:var(--text-sub); margin-bottom:6px;">📈 近7日收盤價</div>
                <div id="sell-history7-${stock.ticker}">
                    <span style="color:var(--text-sub); font-size:0.75rem;">載入中...</span>
                </div>
            </div>
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

const btnForceRescan = document.getElementById('btnForceRescan');
if (btnForceRescan) {
    btnForceRescan.addEventListener('click', async () => {
        const originalText = btnForceRescan.textContent;
        btnForceRescan.textContent = '⌛ 正在補齊缺漏檔位...';
        btnForceRescan.disabled = true;
        try {
            await renderStockCards(stockCountInput.value, true);
        } catch (e) {}
        btnForceRescan.textContent = originalText;
        btnForceRescan.disabled = false;
    });
}

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
    loadScanCacheStatus();
    loadRegimeStatus();
    loadHoldingsSellSignalBanner();
});

// 首頁持股主動提醒：用跟「我的操盤室」同一套逐日重播出場邏輯(strategy_core.evaluate_exit)
// 檢查目前所有持倉，有任何一筆觸發賣出訊號就在首頁顯示提示，不用點進操盤室才會發現。
async function loadHoldingsSellSignalBanner() {
    const banner = document.getElementById('holdingsSellSignalBanner');
    if (!banner) return;
    try {
        const res = await fetch(`${API_BASE_URL}/api/portfolio/sell_check`, {
            headers: { 'Authorization': getAuthHeader() }
        });
        if (!res.ok) return;
        const data = await res.json();
        const count = data.triggered_count || 0;
        if (count > 0) {
            banner.textContent = `🔔 有 ${count} 筆持倉觸發停損/停利訊號，點此查看 →`;
            banner.style.display = 'block';
        } else {
            banner.style.display = 'none';
        }
    } catch (e) {
        console.warn('持股賣出訊號檢查失敗:', e);
    }
}

async function loadScanCacheStatus() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/scan_all/status`);
        if (!res.ok) return;
        const status = await res.json();
        updateStaleDataBanner(status, status.pool_size);
    } catch (e) {
        console.warn('讀取掃描快取狀態失敗:', e);
    }
}

// Stage 1（研究版advisory面板）：顯示即時regime判斷與研究建議的進出場方式，
// 純參考用途，不影響上方AI推薦排名或下單建議，系統實際運作仍是單一固定模型。
// Stage 2：面板本身可收合／展開，偏好存 localStorage，不影響AI推薦卡片的任何顯示或排序。
const REGIME_PANEL_HIDDEN_KEY = 'regimePanelHidden';
let regimeStatusData = null;

async function loadRegimeStatus() {
    const panel = document.getElementById('regimePanel');
    const collapsed = document.getElementById('regimePanelCollapsed');
    if (!panel || !collapsed) return;
    try {
        const res = await fetch(`${API_BASE_URL}/api/regime/status`);
        if (!res.ok) return;
        const s = await res.json();
        if (s.error) { console.warn('regime狀態讀取失敗:', s.error); return; }
        regimeStatusData = s;
        renderRegimePanel();
    } catch (e) {
        console.warn('讀取regime狀態失敗:', e);
    }
}

function renderRegimePanel() {
    const panel = document.getElementById('regimePanel');
    const collapsed = document.getElementById('regimePanelCollapsed');
    const s = regimeStatusData;
    if (!panel || !collapsed || !s) return;

    const isBull = s.regime === '多頭';
    const accentColor = isBull ? '#dc2626' : '#10b981';
    const isHidden = localStorage.getItem(REGIME_PANEL_HIDDEN_KEY) === 'true';

    if (isHidden) {
        panel.style.display = 'none';
        panel.innerHTML = '';
        collapsed.style.display = 'block';
        collapsed.innerHTML = `<a href="javascript:void(0)" id="regimePanelShowBtn" style="color:${accentColor}; font-size:0.85rem; text-decoration:none; border:1px dashed ${accentColor}; padding:6px 14px; border-radius:20px; display:inline-block;">🧭 研究版市況面板（目前：${s.regime}，已隱藏）點此顯示 →</a>`;
        document.getElementById('regimePanelShowBtn').addEventListener('click', () => {
            localStorage.setItem(REGIME_PANEL_HIDDEN_KEY, 'false');
            renderRegimePanel();
        });
        return;
    }

    collapsed.style.display = 'none';
    collapsed.innerHTML = '';
    panel.style.display = 'block';
    panel.style.background = isBull ? 'rgba(220, 38, 38, 0.10)' : 'rgba(16, 185, 129, 0.10)';
    panel.style.borderColor = accentColor;

    panel.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
            <div>
                <div style="font-weight:bold; font-size:1.05rem; color:${accentColor};">
                    🧭 研究版市況面板：目前判定為「${s.regime}」
                    <span style="font-weight:normal; font-size:0.85rem; color: var(--text-sub);">（加權指數 ${s.taiex_close} vs 20日均線 ${s.taiex_ma20}，乖離 ${s.bias_pct > 0 ? '+' : ''}${s.bias_pct}%，${s.taiex_date}收盤）</span>
                </div>
                <div style="margin-top:8px; font-size:0.92rem; color: var(--text-main, #e5e7eb); line-height:1.7;">
                    ⚠️ ${s.note}
                </div>
                <div style="margin-top:6px; font-size:0.82rem; color: var(--text-sub);">
                    <a href="${s.report_url}" target="_blank" style="color:${accentColor};">依regime切換為何失敗 →</a>　<a href="${s.case_url}" target="_blank" style="color:${accentColor};">方案E為何是目前的選擇 →</a>
                </div>
            </div>
            <button id="regimePanelHideBtn" style="background:none; border:1px solid ${accentColor}; color:${accentColor}; border-radius:6px; padding:4px 10px; font-size:0.78rem; cursor:pointer; white-space:nowrap;">✕ 隱藏</button>
        </div>
    `;
    document.getElementById('regimePanelHideBtn').addEventListener('click', () => {
        localStorage.setItem(REGIME_PANEL_HIDDEN_KEY, 'true');
        renderRegimePanel();
    });
}
