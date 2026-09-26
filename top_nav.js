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
