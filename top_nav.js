// 全站共用頂部導覽列：每個頁面載入這支檔案後，最上方會出現一排快速連結。
// 新增頁面時只要在 NAV_ITEMS 加一行，所有頁面就會同步出現。
(function () {
    const NAV_ITEMS = [
        { href: 'index.html', label: '🏠 實戰控制台' },
        { href: 'order_planner.html', label: '📅 明日下單建議' },
        { href: 'history.html', label: '🏦 我的操盤室' },
        { href: 'pnl_ledger.html', label: '💰 損益總帳' },
        { href: 'backtest.html', label: '🧪 回測實驗室' },
        { href: 'analysis.html', label: '📊 分析中心' },
        { href: 'guide.html', label: '🔰 使用說明' },
        { href: 'doc.html', label: '📄 策略白皮書' }
    ];

    function build() {
        if (document.getElementById('globalTopNav')) return;
        const current = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

        const style = document.createElement('style');
        style.textContent = `
            #globalTopNav { display:flex; flex-wrap:wrap; gap:8px; justify-content:center;
                max-width:1400px; margin:0 auto 18px auto; padding:10px 12px;
                background:rgba(15,23,42,0.85); border:1px solid #334155; border-radius:10px; }
            #globalTopNav a { color:#cbd5e1; text-decoration:none; font-size:0.9rem; font-weight:bold;
                padding:6px 12px; border-radius:8px; border:1px solid transparent; transition:all .15s; }
            #globalTopNav a:hover { background:rgba(59,130,246,0.15); border-color:#3b82f6; color:#fff; }
            #globalTopNav a.active { background:rgba(245,158,11,0.18); border-color:#f59e0b; color:#f59e0b; }
            #globalTopNav a.ledger { border-color:rgba(239,68,68,0.5); }
            #globalTopNav { align-items:center; }
            #globalTopNav .nav-links { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; flex:1 1 auto; min-width:0; }
            #globalTopNav .nav-user { margin-left:auto; display:flex; align-items:center; gap:6px; flex:0 0 auto;
                color:#f59e0b; font-size:0.85rem; font-weight:bold; padding:4px 10px; border:1px solid rgba(245,158,11,0.5);
                border-radius:8px; background:rgba(245,158,11,0.1); white-space:nowrap; }
            #globalTopNav .nav-user a { padding:2px 6px; font-size:0.82rem; border:none; text-decoration:underline; }
            #globalTopNav .nav-user a.admin { color:#60a5fa; }
            #globalTopNav .nav-user a.logout { color:#f87171; }
            #globalTopNav .nav-user a.login { color:#f59e0b; }

            /* ===== 手機版調整（螢幕寬度 640px 以下）===== */
            @media (max-width: 640px) {
                body { padding: 10px !important; }
                /* 導覽列改成單列左右滑動，不佔四行高度 */
                #globalTopNav { flex-direction: column; flex-wrap: nowrap; align-items: stretch; padding: 8px; gap: 6px; margin-bottom: 12px; }
                #globalTopNav .nav-links { flex-wrap: nowrap; justify-content: flex-start; overflow-x: auto;
                    -webkit-overflow-scrolling: touch; gap: 6px; }
                #globalTopNav .nav-links a { flex: 0 0 auto; white-space: nowrap; padding: 6px 10px; font-size: 0.85rem; }
                /* 登入狀態在手機上獨立一行，不會被擠到滑動列的最後面 */
                #globalTopNav .nav-user { margin-left: 0; justify-content: center; flex-wrap: wrap; white-space: normal; }
                /* 標題旁絕對定位的「返回」按鈕改成放在標題下方，避免蓋住標題 */
                header a[style*="absolute"], header > a, a[style*="position: absolute"][href$=".html"], a[style*="position:absolute"][href$=".html"] {
                    position: static !important; transform: none !important; display: inline-block !important;
                    margin-top: 10px !important; }
                header { padding-right: 0 !important; }
                header h1 { font-size: 1.45rem !important; }
                /* 下拉選單、輸入框不超出螢幕 */
                select, input, textarea { max-width: 100% !important; min-width: 0 !important; }
                /* 行內 flex 排版在窄螢幕自動換行（例如下單頁的出場方案選單） */
                [style*="display:flex"], [style*="display: flex"] { flex-wrap: wrap !important; }
                .config-item, .config-item > *, .settings-panel, .count-setting { min-width: 0 !important; max-width: 100% !important; }
                /* 寬表格改成可左右滑動 */
                table:not(.ledger) { display: block; overflow-x: auto; max-width: 100%; -webkit-overflow-scrolling: touch; }
                img, canvas { max-width: 100% !important; }
            }
        `;
        document.head.appendChild(style);

        const nav = document.createElement('nav');
        nav.id = 'globalTopNav';
        const links = document.createElement('div');
        links.className = 'nav-links';
        nav.appendChild(links);
        NAV_ITEMS.forEach(item => {
            const a = document.createElement('a');
            a.href = item.href;
            a.textContent = item.label;
            if (item.href.toLowerCase() === current || (current === '' && item.href === 'index.html')) a.classList.add('active');
            if (item.href === 'pnl_ledger.html') a.classList.add('ledger');
            links.appendChild(a);
        });
        const userBox = document.createElement('span');
        userBox.className = 'nav-user';
        userBox.id = 'topNavUser';
        nav.appendChild(userBox);
        document.body.insertBefore(nav, document.body.firstChild);
        refreshTopNavUser();
    }

    // 右側登入狀態：每一頁都看得到目前登入的帳號，可登入／登出／進帳號管理
    function refreshTopNavUser() {
        const box = document.getElementById('topNavUser');
        if (!box) return;
        let creds = null;
        try { creds = JSON.parse(localStorage.getItem('ai_trading_user') || 'null'); } catch (e) {}
        box.textContent = '';
        const link = (text, cls, onClick, href) => {
            const a = document.createElement('a');
            a.textContent = text; a.className = cls; a.href = href || 'javascript:void(0)';
            if (onClick) a.addEventListener('click', onClick);
            box.appendChild(a);
        };
        if (!creds || !creds.username) {
            box.appendChild(document.createTextNode('👤 未登入'));
            link('🔑 邀請碼開戶/登入', 'login', (e) => {
                if (typeof window.openAuthModal === 'function') { e.preventDefault(); window.openAuthModal(true); }
                else { location.href = 'index.html'; }
            });
            return;
        }
        const isAdmin = creds.username === 'cyc58612';
        box.appendChild(document.createTextNode(isAdmin ? `👤 管理者 (${creds.username})` : `👤 ${creds.username}`));
        if (isAdmin) link('🔐 帳號管理', 'admin', null, 'admin_users.html');
        link('登出', 'logout', () => {
            try { localStorage.removeItem('ai_trading_user'); } catch (e) {}
            alert('已成功登出！');
            location.href = 'index.html';
        });
    }
    window.refreshTopNavUser = refreshTopNavUser;

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
    else build();
})();
