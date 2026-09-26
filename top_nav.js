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

            /* ===== 手機版調整（螢幕寬度 640px 以下）===== */
            @media (max-width: 640px) {
                body { padding: 10px !important; }
                /* 導覽列改成單列左右滑動，不佔四行高度 */
                #globalTopNav { flex-wrap: nowrap; justify-content: flex-start; overflow-x: auto;
                    -webkit-overflow-scrolling: touch; padding: 8px; gap: 6px; margin-bottom: 12px; }
                #globalTopNav a { flex: 0 0 auto; white-space: nowrap; padding: 6px 10px; font-size: 0.85rem; }
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
        NAV_ITEMS.forEach(item => {
            const a = document.createElement('a');
            a.href = item.href;
            a.textContent = item.label;
            if (item.href.toLowerCase() === current || (current === '' && item.href === 'index.html')) a.classList.add('active');
            if (item.href === 'pnl_ledger.html') a.classList.add('ledger');
            nav.appendChild(a);
        });
        document.body.insertBefore(nav, document.body.firstChild);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
    else build();
})();
