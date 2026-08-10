const API_BASE_URL = (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost" || window.location.protocol === "file:")
    ? "http://127.0.0.1:58888"
    : window.location.origin;

function getAuthCredentials() {
    const saved = localStorage.getItem('ai_trading_user');
    if (saved) {
        try { return JSON.parse(saved); } catch (e) {}
    }
    return null;
}

function getAuthHeader() {
    const creds = getAuthCredentials();
    return creds ? creds.authHeader : "";
}

const creds = getAuthCredentials();
if (!creds || creds.username !== 'cyc58612') {
    alert('僅限管理者存取此頁面，將帶您回首頁。');
    location.href = 'index.html';
    throw new Error('Unauthorized: redirecting to index.html');
}

function showMsg(text, isError) {
    const el = document.getElementById('adminMsg');
    el.textContent = text;
    el.style.color = isError ? 'var(--accent-red)' : 'var(--accent-green)';
    if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 4000);
}

async function loadUsers() {
    const wrap = document.getElementById('usersTableWrap');
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/users`, { headers: { 'Authorization': getAuthHeader() } });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `HTTP ${res.status}`);
        }
        const data = await res.json();
        renderUsers(data.users || []);
    } catch (e) {
        wrap.innerHTML = `<div class="empty-msg">載入失敗：${e.message}</div>`;
    }
}

function renderUsers(users) {
    const wrap = document.getElementById('usersTableWrap');
    if (users.length === 0) {
        wrap.innerHTML = '<div class="empty-msg">目前還沒有任何自助註冊的帳號</div>';
        return;
    }
    const rows = users.map(u => `
        <tr>
            <td>${escapeHtml(u)}</td>
            <td style="text-align:right;">
                <button class="btn-reset" onclick="resetPassword('${escapeHtml(u)}')">🔑 重設密碼</button>
                <button class="btn-delete" onclick="deleteUser('${escapeHtml(u)}')">🗑️ 刪除帳號</button>
            </td>
        </tr>`).join('');
    wrap.innerHTML = `
        <table class="admin-table">
            <thead><tr><th>帳號</th><th style="text-align:right;">操作</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
}

function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

async function resetPassword(username) {
    const newPassword = prompt(`請輸入 ${username} 的新密碼（至少 4 個字元）：`);
    if (newPassword === null) return;
    if (newPassword.trim().length < 4) {
        showMsg('密碼至少需要 4 個字元', true);
        return;
    }
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/users/${encodeURIComponent(username)}/reset_password`, {
            method: 'POST',
            headers: { 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_password: newPassword.trim() })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
        showMsg(data.message || '密碼已重設', false);
    } catch (e) {
        showMsg(`重設密碼失敗：${e.message}`, true);
    }
}

async function deleteUser(username) {
    if (!confirm(`確定要刪除帳號「${username}」嗎？此動作無法復原，該使用者的登入資料會被永久刪除。`)) return;
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/users/${encodeURIComponent(username)}`, {
            method: 'DELETE',
            headers: { 'Authorization': getAuthHeader() }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
        showMsg(data.message || '帳號已刪除', false);
        loadUsers();
    } catch (e) {
        showMsg(`刪除帳號失敗：${e.message}`, true);
    }
}

loadUsers();
