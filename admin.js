/* ============================================================
   RND REWARDS — ADMIN PANEL (UID-Based Admin Verification)
   ============================================================
   
   Admin identification:
   - Firebase Auth login
   - Email whitelist: randigital236@gmail.com
   - UID whitelist: Y5bnea4My1aEiKzBt5w8uB5KW8v2
   
   No separate `admins` node required.
   Admin already exists in `users` node.
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    getDatabase, ref, get, update
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

/* ---------- FIREBASE CONFIG ---------- */
const firebaseConfig = {
    apiKey: "AIzaSyARtuToUfDsK6EOrqpJ6nBpfSHx2JobWhQ",
    authDomain: "randigital-e7715.firebaseapp.com",
    databaseURL: "https://randigital-e7715-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "randigital-e7715",
    storageBucket: "randigital-e7715.firebasestorage.app",
    messagingSenderId: "218883279353",
    appId: "1:218883279353:web:cda990aa068f8fdf4d1528",
    measurementId: "G-1V0QQCQQNZ"
};

/* ---------- ADMIN CONSTANTS ---------- */
const ADMIN_EMAIL = "randigital236@gmail.com";
const ADMIN_UID   = "Y5bnea4My1aEiKzBt5w8uB5KW8v2";
const SESSION_MAX_MS = 8 * 60 * 60 * 1000;   // 8 hours

/* ---------- INIT ---------- */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

/* ---------- STATE ---------- */
let allUsers = {};
let allWithdrawals = {};
let allStakes = {};
let isAdminAuthenticated = false;

/* ============================================================
   HELPERS
   ============================================================ */
const formatRND = (n, dp = 2) =>
    (Number(n) || 0).toLocaleString(undefined, {
        minimumFractionDigits: dp,
        maximumFractionDigits: dp
    });

const formatDate = (ms) => {
    if (!ms) return '—';
    const d = new Date(typeof ms === 'number' ? ms : ms);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
};

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function shortenAddress(addr) {
    if (!addr || addr.length < 12) return addr || '—';
    return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('adminToast');
    const text = document.getElementById('adminToastText');
    if (!toast || !text) return;
    toast.className = `admin-toast ${type}`;
    const icon = toast.querySelector('i');
    if (icon) {
        icon.className = type === 'success' ? 'fas fa-check-circle'
                      : type === 'error' ? 'fas fa-exclamation-circle'
                      : 'fas fa-info-circle';
    }
    text.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('show'), 3200);
}

async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        return true;
    } catch (e) {
        console.warn('Copy failed:', e);
        return false;
    }
}

/* ============================================================
   LOGIN — Firebase Auth + Email/UID verify
   ============================================================ */
async function handleLogin(e) {
    e.preventDefault();

    const emailInput = document.getElementById('adminEmail');
    const passwordInput = document.getElementById('adminPassword');
    const errorDiv = document.getElementById('loginError');
    const loginBtn = document.getElementById('loginBtn');

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    errorDiv.classList.remove('show');
    errorDiv.textContent = '';

    if (!email || !password) {
        errorDiv.textContent = 'Please enter both email and password.';
        errorDiv.classList.add('show');
        return;
    }

    /* Layer 1: Email whitelist */
    if (email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        errorDiv.textContent = '❌ Access denied. Only admin can login.';
        errorDiv.classList.add('show');
        return;
    }

    loginBtn.disabled = true;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';

    try {
        /* Firebase Auth login */
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        /* Layer 2: Verify email from auth */
        if (user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
            await signOut(auth);
            throw new Error('Email mismatch');
        }

        /* Layer 3: Verify UID */
        if (user.uid !== ADMIN_UID) {
            await signOut(auth);
            throw new Error('UID mismatch');
        }

        /* Optional: Verify user exists in users node */
        try {
            const userSnap = await get(ref(db, `users/${user.uid}`));
            if (!userSnap.exists()) {
                console.warn('Admin user node missing, but continuing...');
            }
        } catch (e) {
            console.warn('Could not verify user node:', e);
        }

        /* Save session */
        sessionStorage.setItem('rnd_admin_session', JSON.stringify({
            uid: user.uid,
            email: user.email,
            ts: Date.now()
        }));

        await showAdminPanel();

    } catch (err) {
        console.error('Login error:', err);
        let msg = '❌ Login failed. Please try again.';
        if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
            msg = '❌ Incorrect password.';
        } else if (err.code === 'auth/user-not-found') {
            msg = '❌ Admin account not found.';
        } else if (err.code === 'auth/too-many-requests') {
            msg = '⏰ Too many attempts. Try again later.';
        } else if (err.code === 'auth/network-request-failed') {
            msg = '🌐 Network error. Check your connection.';
        } else if (err.message === 'UID mismatch') {
            msg = '❌ Admin UID mismatch. Access denied.';
        } else if (err.message === 'Email mismatch') {
            msg = '❌ Email mismatch. Access denied.';
        }
        errorDiv.textContent = msg;
        errorDiv.classList.add('show');
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<i class="fas fa-arrow-right-to-bracket"></i> Login';
    }
}

/* ============================================================
   SESSION CHECK
   ============================================================ */
async function checkExistingSession() {
    const session = sessionStorage.getItem('rnd_admin_session');
    if (!session) return false;

    try {
        const parsed = JSON.parse(session);
        if (!parsed.uid || !parsed.ts) return false;

        if (Date.now() - parsed.ts > SESSION_MAX_MS) {
            sessionStorage.removeItem('rnd_admin_session');
            return false;
        }

        if (!auth.currentUser || auth.currentUser.uid !== parsed.uid) {
            sessionStorage.removeItem('rnd_admin_session');
            return false;
        }

        /* Verify UID still matches admin */
        if (parsed.uid !== ADMIN_UID) {
            sessionStorage.removeItem('rnd_admin_session');
            return false;
        }

        return true;
    } catch (e) {
        sessionStorage.removeItem('rnd_admin_session');
        return false;
    }
}

/* ============================================================
   SHOW ADMIN PANEL
   ============================================================ */
async function showAdminPanel() {
    isAdminAuthenticated = true;
    document.getElementById('loadingScreen').classList.add('hide');
    document.getElementById('loginScreen').classList.add('hide');
    document.getElementById('adminPanel').classList.add('show');

    await loadAllData();
}

window.adminLogout = async function () {
    sessionStorage.removeItem('rnd_admin_session');
    try { await signOut(auth); } catch (e) {}
    location.reload();
};

/* ============================================================
   LOAD ALL DATA
   ============================================================ */
async function loadAllData() {
    try {
        showToast('🔄 Loading data...', 'info');

        await loadUsers();
        await loadWithdrawals();
        loadStakes();
        renderAll();

        showToast(`✅ Loaded ${Object.keys(allUsers).length} users`, 'success');
    } catch (err) {
        console.error('Load error:', err);
        if (err.code === 'PERMISSION_DENIED' || String(err).includes('permission')) {
            showToast('⚠️ Permission denied. Check Firebase Rules.', 'error');
        } else {
            showToast('❌ Failed to load data', 'error');
        }
    }
}

async function loadUsers() {
    const snap = await get(ref(db, 'users'));
    allUsers = snap.val() || {};
    console.log(`✅ Loaded ${Object.keys(allUsers).length} users`);
}

async function loadWithdrawals() {
    try {
        const snap = await get(ref(db, 'withdrawals'));
        allWithdrawals = snap.val() || {};
        console.log(`✅ Loaded ${Object.keys(allWithdrawals).length} withdrawals`);
    } catch (e) {
        console.warn('Could not load withdrawals:', e);
        allWithdrawals = {};
    }
}

function loadStakes() {
    allStakes = {};
    for (const uid in allUsers) {
        const user = allUsers[uid];
        if (user && user.staking) {
            for (const stakeId in user.staking) {
                allStakes[`${uid}_${stakeId}`] = {
                    ...user.staking[stakeId],
                    uid: uid,
                    userName: user.name || 'N/A',
                    userEmail: user.email || 'N/A'
                };
            }
        }
    }
    console.log(`✅ Loaded ${Object.keys(allStakes).length} stakes`);
}

/* ============================================================
   RENDER ALL
   ============================================================ */
function renderAll() {
    renderOverview();
    renderUsers();
    renderWithdrawals();
    renderTransactions();
    renderStakes();
    updatePendingBadge();
}

/* ============================================================
   OVERVIEW
   ============================================================ */
function renderOverview() {
    let totalUsers = 0;
    let totalBalance = 0;
    let totalEarned = 0;

    for (const uid in allUsers) {
        const u = allUsers[uid];
        if (!u) continue;
        totalUsers++;
        totalBalance += (Number(u.referralWallet) || 0)
                      + (Number(u.spinWallet) || 0)
                      + (Number(u.socialTasksWallet) || 0);
        totalEarned += Number(u.totalEarned) || 0;
    }

    let totalStaked = 0;
    let totalLocked = 0;
    let totalReleased = 0;
    const now = Date.now();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    for (const key in allStakes) {
        const s = allStakes[key];
        if (!s) continue;
        totalStaked += Number(s.principalAmount) || 0;

        const totalAmt = Number(s.totalStakingAmount) || 0;
        const lockEnd = Number(s.lockEndAt) || 0;

        if (now < lockEnd) {
            totalLocked += totalAmt;
        } else {
            const daysElapsed = Math.floor((now - lockEnd) / MS_PER_DAY);
            const rawEligible = daysElapsed * (Number(s.dailyReleaseAmount) || 0);
            const capped = Math.min(rawEligible, totalAmt);
            totalReleased += capped;
            totalLocked += Math.max(totalAmt - capped, 0);
        }
    }

    let totalWithdrawals = 0;
    let pendingWithdrawals = 0;
    for (const wid in allWithdrawals) {
        const w = allWithdrawals[wid];
        if (!w) continue;
        totalWithdrawals++;
        if (w.status === 'pending') pendingWithdrawals++;
    }

    const el = (id, val) => {
        const e = document.getElementById(id);
        if (e) e.textContent = val;
    };

    el('statTotalUsers', totalUsers);
    el('statTotalBalance', formatRND(totalBalance));
    el('statTotalStaked', formatRND(totalStaked));
    el('statTotalLocked', formatRND(totalLocked));
    el('statTotalReleased', formatRND(totalReleased));
    el('statTotalWithdrawals', totalWithdrawals);
    el('statPendingWithdrawals', pendingWithdrawals);
    el('statTotalEarned', formatRND(totalEarned));

    renderRecentWithdrawals();
}

function renderRecentWithdrawals() {
    const container = document.getElementById('overviewRecentWithdrawals');
    if (!container) return;

    const list = Object.entries(allWithdrawals)
        .map(([id, w]) => ({ id, ...w }))
        .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))
        .slice(0, 8);

    if (list.length === 0) {
        container.innerHTML = `
            <div class="admin-empty">
                <i class="fas fa-inbox"></i>
                <p>No withdrawal requests yet</p>
            </div>`;
        return;
    }

    let html = `<div class="table-wrap"><table>
        <thead><tr>
            <th>User</th>
            <th>Amount</th>
            <th>Address</th>
            <th>Status</th>
            <th>Date</th>
        </tr></thead><tbody>`;

    list.forEach(w => {
        const user = allUsers[w.uid] || {};
        html += `<tr>
            <td><strong>${escapeHtml(user.name || 'N/A')}</strong><br>
                <span style="font-size:11px;color:#7c7c8a;">${escapeHtml(user.email || '')}</span>
            </td>
            <td class="cell-value-gold">${w.amount} RND</td>
            <td class="mono">${escapeHtml(shortenAddress(w.walletAddress))}</td>
            <td>${getStatusBadge(w.status)}</td>
            <td>${formatDate(w.createdAt || w.date)}</td>
        </tr>`;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

function getStatusBadge(status) {
    const map = {
        'pending': '<span class="badge badge-pending">⏳ Pending</span>',
        'completed': '<span class="badge badge-completed">✅ Completed</span>',
        'rejected': '<span class="badge badge-rejected">❌ Rejected</span>',
        'cancelled': '<span class="badge badge-rejected">⚠️ Cancelled</span>',
        'active': '<span class="badge badge-active">✅ Active</span>',
        'blocked': '<span class="badge badge-blocked">🚫 Blocked</span>',
        'locked': '<span class="badge badge-locked">🔒 Locked</span>',
        'releasing': '<span class="badge badge-releasing">💧 Releasing</span>'
    };
    return map[status] || `<span class="badge">${escapeHtml(status || 'N/A')}</span>`;
}

/* ============================================================
   USERS TABLE
   ============================================================ */
function renderUsers() {
    const container = document.getElementById('usersTableContainer');
    if (!container) return;

    const search = (document.getElementById('userSearchInput')?.value || '').toLowerCase().trim();
    const statusFilter = document.getElementById('userStatusFilter')?.value || 'all';

    let list = Object.entries(allUsers).map(([uid, u]) => ({ uid, ...u }));

    if (search) {
        list = list.filter(u =>
            (u.name || '').toLowerCase().includes(search) ||
            (u.email || '').toLowerCase().includes(search) ||
            (u.referralCode || '').toLowerCase().includes(search)
        );
    }

    if (statusFilter === 'active') {
        list = list.filter(u => (u.status || 'active') === 'active');
    } else if (statusFilter === 'blocked') {
        list = list.filter(u => u.status === 'blocked');
    } else if (statusFilter === 'tasks_done') {
        list = list.filter(u => u.socialTasks?.facebook === true && u.socialTasks?.twitter === true);
    } else if (statusFilter === 'tasks_pending') {
        list = list.filter(u => u.socialTasks?.facebook !== true || u.socialTasks?.twitter !== true);
    } else if (statusFilter === 'has_stakes') {
        list = list.filter(u => u.staking && Object.keys(u.staking).length > 0);
    }

    list.sort((a, b) => {
        const ta = new Date(a.createdAt || 0).getTime() || 0;
        const tb = new Date(b.createdAt || 0).getTime() || 0;
        return tb - ta;
    });

    const badge = document.getElementById('userCountBadge');
    if (badge) badge.textContent = `(${list.length})`;

    if (list.length === 0) {
        container.innerHTML = `
            <div class="admin-empty">
                <i class="fas fa-users-slash"></i>
                <p>No users found</p>
                <small>Try changing filters or search</small>
            </div>`;
        return;
    }

    let html = `<div class="table-wrap"><table>
        <thead><tr>
            <th>User</th>
            <th>Referral Code</th>
            <th>Referral</th>
            <th>Spin</th>
            <th>Tasks</th>
            <th>Release</th>
            <th>Total</th>
            <th>Tasks Status</th>
            <th>Account</th>
            <th>Actions</th>
        </tr></thead><tbody>`;

    list.forEach(u => {
        const ref_ = Number(u.referralWallet) || 0;
        const spin = Number(u.spinWallet) || 0;
        const tasks = Number(u.socialTasksWallet) || 0;
        const release = Number(u.releaseWallet) || 0;
        const total = ref_ + spin + tasks;

        const fbDone = u.socialTasks?.facebook === true;
        const twDone = u.socialTasks?.twitter === true;
        const tasksStatus = (fbDone && twDone)
            ? '<span class="badge badge-completed">✅ Done</span>'
            : (fbDone || twDone)
                ? '<span class="badge badge-pending">⚠️ Partial</span>'
                : '<span class="badge badge-rejected">❌ Pending</span>';

        const isAdminUser = u.uid === ADMIN_UID;

        html += `<tr${isAdminUser ? ' style="background:rgba(139,92,246,0.08);"' : ''}>
            <td>
                <strong>${escapeHtml(u.name || 'N/A')}${isAdminUser ? ' <span style="color:#f472b6;font-size:11px;">[ADMIN]</span>' : ''}</strong><br>
                <span style="font-size:11px;color:#7c7c8a;">${escapeHtml(u.email || '')}</span>
            </td>
            <td class="mono">${escapeHtml(u.referralCode || '—')}</td>
            <td class="cell-value-purple">${formatRND(ref_)}</td>
            <td class="cell-value-pink">${formatRND(spin)}</td>
            <td class="cell-value-gold">${formatRND(tasks)}</td>
            <td class="cell-value-green">${formatRND(release)}</td>
            <td class="cell-value-gold">${formatRND(total)}</td>
            <td>${tasksStatus}</td>
            <td>${getStatusBadge(u.status || 'active')}</td>
            <td>
                <button class="icon-btn info" onclick="viewUserDetails('${u.uid}')" title="View Details">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="icon-btn" onclick="copyUserData('${u.uid}')" title="Copy Data">
                    <i class="fas fa-copy"></i>
                </button>
                ${!isAdminUser ? (u.status === 'blocked'
                    ? `<button class="icon-btn success" onclick="toggleUserStatus('${u.uid}', 'active')" title="Unblock">
                        <i class="fas fa-unlock"></i>
                       </button>`
                    : `<button class="icon-btn danger" onclick="toggleUserStatus('${u.uid}', 'blocked')" title="Block">
                        <i class="fas fa-ban"></i>
                       </button>`
                ) : '<span style="font-size:11px;color:#a78bfa;font-weight:700;">—</span>'}
            </td>
        </tr>`;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

/* ============================================================
   WITHDRAWALS TABLE
   ============================================================ */
function renderWithdrawals() {
    const container = document.getElementById('withdrawalsTableContainer');
    if (!container) return;

    const search = (document.getElementById('withdrawalSearchInput')?.value || '').toLowerCase().trim();
    const statusFilter = document.getElementById('withdrawalStatusFilter')?.value || 'pending';

    let list = Object.entries(allWithdrawals).map(([id, w]) => ({ id, ...w }));

    if (statusFilter !== 'all') {
        list = list.filter(w => w.status === statusFilter);
    }

    if (search) {
        list = list.filter(w => {
            const user = allUsers[w.uid] || {};
            return (user.name || '').toLowerCase().includes(search) ||
                   (user.email || '').toLowerCase().includes(search) ||
                   (w.walletAddress || '').toLowerCase().includes(search);
        });
    }

    list.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));

    if (list.length === 0) {
        container.innerHTML = `
            <div class="admin-empty">
                <i class="fas fa-inbox"></i>
                <p>No withdrawals found</p>
                <small>Try changing filters</small>
            </div>`;
        return;
    }

    let html = `<div class="table-wrap"><table>
        <thead><tr>
            <th>User</th>
            <th>Amount</th>
            <th>Wallet Address</th>
            <th>Status</th>
            <th>Requested</th>
            <th>Actions</th>
        </tr></thead><tbody>`;

    list.forEach(w => {
        const user = allUsers[w.uid] || {};
        const canAct = w.status === 'pending';

        html += `<tr>
            <td>
                <strong>${escapeHtml(user.name || 'N/A')}</strong><br>
                <span style="font-size:11px;color:#7c7c8a;">${escapeHtml(user.email || '')}</span>
            </td>
            <td class="cell-value-gold">${w.amount} RND</td>
            <td class="mono" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(w.walletAddress || '')}">
                ${escapeHtml(w.walletAddress || '—')}
            </td>
            <td>${getStatusBadge(w.status)}</td>
            <td>${formatDate(w.createdAt || w.date)}</td>
            <td>
                <button class="icon-btn" onclick="copyAddress('${escapeHtml(w.walletAddress || '')}')" title="Copy Address">
                    <i class="fas fa-copy"></i>
                </button>
                ${canAct ? `
                    <button class="icon-btn success" onclick="approveWithdrawal('${w.id}')" title="Approve">
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="icon-btn danger" onclick="rejectWithdrawal('${w.id}')" title="Reject">
                        <i class="fas fa-times"></i>
                    </button>
                ` : ''}
            </td>
        </tr>`;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

/* ============================================================
   TRANSACTIONS TABLE
   ============================================================ */
function renderTransactions() {
    const container = document.getElementById('transactionsTableContainer');
    if (!container) return;

    const search = (document.getElementById('transactionSearchInput')?.value || '').toLowerCase().trim();
    const statusFilter = document.getElementById('transactionStatusFilter')?.value || 'all';

    let list = Object.entries(allWithdrawals).map(([id, w]) => ({ id, ...w }));

    if (statusFilter !== 'all') {
        list = list.filter(w => w.status === statusFilter);
    }

    if (search) {
        list = list.filter(w => {
            const user = allUsers[w.uid] || {};
            return (user.name || '').toLowerCase().includes(search) ||
                   (user.email || '').toLowerCase().includes(search) ||
                   (w.walletAddress || '').toLowerCase().includes(search);
        });
    }

    list.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));

    if (list.length === 0) {
        container.innerHTML = `
            <div class="admin-empty">
                <i class="fas fa-receipt"></i>
                <p>No transactions found</p>
            </div>`;
        return;
    }

    let html = `<div class="table-wrap"><table>
        <thead><tr>
            <th>User</th>
            <th>Type</th>
            <th>Amount</th>
            <th>Address</th>
            <th>Status</th>
            <th>Date</th>
            <th>TX Hash / Reason</th>
        </tr></thead><tbody>`;

    list.forEach(w => {
        const user = allUsers[w.uid] || {};

        html += `<tr>
            <td>
                <strong>${escapeHtml(user.name || 'N/A')}</strong><br>
                <span style="font-size:11px;color:#7c7c8a;">${escapeHtml(user.email || '')}</span>
            </td>
            <td>Withdrawal</td>
            <td class="cell-value-gold">${w.amount} RND</td>
            <td class="mono">${escapeHtml(shortenAddress(w.walletAddress))}</td>
            <td>${getStatusBadge(w.status)}</td>
            <td>${formatDate(w.createdAt || w.date)}</td>
            <td class="mono" style="font-size:11px;">
                ${w.txHash ? escapeHtml(shortenAddress(w.txHash)) : ''}
                ${w.rejectReason ? `<span style="color:#f87171;">${escapeHtml(w.rejectReason)}</span>` : ''}
                ${!w.txHash && !w.rejectReason ? '—' : ''}
            </td>
        </tr>`;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

/* ============================================================
   STAKES TABLE
   ============================================================ */
function renderStakes() {
    const container = document.getElementById('stakesTableContainer');
    if (!container) return;

    const search = (document.getElementById('stakeSearchInput')?.value || '').toLowerCase().trim();
    const statusFilter = document.getElementById('stakeStatusFilter')?.value || 'all';

    const now = Date.now();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    let list = Object.values(allStakes).map(s => {
        const totalAmt = Number(s.totalStakingAmount) || 0;
        const released = Number(s.releasedAmount) || 0;
        const lockEnd = Number(s.lockEndAt) || 0;

        let status = 'locked';
        let currentReleased = released;
        if (now >= lockEnd) {
            const daysElapsed = Math.floor((now - lockEnd) / MS_PER_DAY);
            const rawEligible = daysElapsed * (Number(s.dailyReleaseAmount) || 0);
            currentReleased = Math.min(rawEligible, totalAmt);
            status = currentReleased >= totalAmt ? 'completed' : 'releasing';
        }

        return { ...s, currentStatus: status, currentReleased };
    });

    if (statusFilter !== 'all') {
        list = list.filter(s => s.currentStatus === statusFilter);
    }

    if (search) {
        list = list.filter(s =>
            (s.userName || '').toLowerCase().includes(search) ||
            (s.userEmail || '').toLowerCase().includes(search)
        );
    }

    list.sort((a, b) => (Number(b.stakeStartAt) || 0) - (Number(a.stakeStartAt) || 0));

    if (list.length === 0) {
        container.innerHTML = `
            <div class="admin-empty">
                <i class="fas fa-lock"></i>
                <p>No stakes found</p>
            </div>`;
        return;
    }

    let html = `<div class="table-wrap"><table>
        <thead><tr>
            <th>User</th>
            <th>Stake ID</th>
            <th>Principal</th>
            <th>Bonus</th>
            <th>Total</th>
            <th>Released</th>
            <th>Remaining</th>
            <th>Status</th>
            <th>Lock Ends</th>
        </tr></thead><tbody>`;

    list.forEach(s => {
        const totalAmt = Number(s.totalStakingAmount) || 0;
        const remaining = Math.max(totalAmt - s.currentReleased, 0);

        html += `<tr>
            <td>
                <strong>${escapeHtml(s.userName || 'N/A')}</strong><br>
                <span style="font-size:11px;color:#7c7c8a;">${escapeHtml(s.userEmail || '')}</span>
            </td>
            <td class="mono">${escapeHtml(String(s.stakeId || '').slice(-12))}</td>
            <td class="cell-value-purple">${formatRND(s.principalAmount)}</td>
            <td class="cell-value-gold">${formatRND(s.bonusAmount)}</td>
            <td class="cell-value-purple">${formatRND(totalAmt)}</td>
            <td class="cell-value-green">${formatRND(s.currentReleased)}</td>
            <td>${formatRND(remaining)}</td>
            <td>${getStatusBadge(s.currentStatus)}</td>
            <td>${formatDate(s.lockEndAt)}</td>
        </tr>`;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

/* ============================================================
   PENDING BADGE
   ============================================================ */
function updatePendingBadge() {
    const badge = document.getElementById('pendingWithdrawalsBadge');
    if (!badge) return;

    let pending = 0;
    for (const wid in allWithdrawals) {
        if (allWithdrawals[wid]?.status === 'pending') pending++;
    }

    if (pending > 0) {
        badge.textContent = pending;
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }
}

/* ============================================================
   USER ACTIONS
   ============================================================ */
window.viewUserDetails = function (uid) {
    const u = allUsers[uid];
    if (!u) return;

    const stakes = u.staking ? Object.values(u.staking) : [];
    const totalStaked = stakes.reduce((s, x) => s + (Number(x.principalAmount) || 0), 0);

    const html = `
        <h3><i class="fas fa-user"></i> User Details</h3>
        <div class="modal-row"><span class="ml">Name</span><span class="mv">${escapeHtml(u.name || 'N/A')}</span></div>
        <div class="modal-row"><span class="ml">Email</span><span class="mv">${escapeHtml(u.email || 'N/A')}</span></div>
        <div class="modal-row"><span class="ml">Referral Code</span><span class="mv mono">${escapeHtml(u.referralCode || '—')}</span></div>
        <div class="modal-row"><span class="ml">UID</span><span class="mv mono">${escapeHtml(uid)}</span></div>
        <div class="modal-row"><span class="ml">Referred By</span><span class="mv mono">${escapeHtml(u.referredBy || '—')}</span></div>
        <div class="modal-row"><span class="ml">Status</span><span class="mv">${getStatusBadge(u.status || 'active')}</span></div>
        <div class="modal-row"><span class="ml">Joined</span><span class="mv">${formatDate(u.createdAt)}</span></div>
        <div class="modal-row"><span class="ml">Referral Wallet</span><span class="mv purple">${formatRND(u.referralWallet)} RND</span></div>
        <div class="modal-row"><span class="ml">Spin Wallet</span><span class="mv">${formatRND(u.spinWallet)} RND</span></div>
        <div class="modal-row"><span class="ml">Social Tasks Wallet</span><span class="mv gold">${formatRND(u.socialTasksWallet)} RND</span></div>
        <div class="modal-row"><span class="ml">Release Wallet</span><span class="mv green">${formatRND(u.releaseWallet)} RND</span></div>
        <div class="modal-row"><span class="ml">Total Earned</span><span class="mv gold">${formatRND(u.totalEarned)} RND</span></div>
        <div class="modal-row"><span class="ml">Active Stakes</span><span class="mv">${stakes.length}</span></div>
        <div class="modal-row"><span class="ml">Total Staked</span><span class="mv">${formatRND(totalStaked)} RND</span></div>
        <div class="modal-row"><span class="ml">FB Task</span><span class="mv">${u.socialTasks?.facebook ? '✅ Done' : '❌ Pending'}</span></div>
        <div class="modal-row"><span class="ml">Twitter Task</span><span class="mv">${u.socialTasks?.twitter ? '✅ Done' : '❌ Pending'}</span></div>
        <div class="modal-actions">
            <button class="modal-btn modal-cancel" onclick="closeAdminModal()">Close</button>
        </div>
    `;

    document.getElementById('adminModalBox').innerHTML = html;
    document.getElementById('adminModal').classList.add('show');
};

window.copyUserData = async function (uid) {
    const u = allUsers[uid];
    if (!u) return;
    const text = JSON.stringify({ uid, ...u }, null, 2);
    const ok = await copyToClipboard(text);
    showToast(ok ? '✅ User data copied!' : '❌ Copy failed', ok ? 'success' : 'error');
};

window.toggleUserStatus = async function (uid, newStatus) {
    if (uid === ADMIN_UID) {
        showToast('⚠️ Cannot modify admin account', 'error');
        return;
    }
    const u = allUsers[uid];
    if (!u) return;

    const action = newStatus === 'blocked' ? 'block' : 'unblock';
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;

    try {
        await update(ref(db, `users/${uid}`), { status: newStatus });
        allUsers[uid].status = newStatus;
        renderUsers();
        showToast(`✅ User ${newStatus === 'blocked' ? 'blocked' : 'unblocked'}`, 'success');
    } catch (e) {
        console.error(e);
        showToast('❌ Failed to update user', 'error');
    }
};

/* ============================================================
   WITHDRAWAL ACTIONS
   ============================================================ */
window.copyAddress = async function (addr) {
    if (!addr) return;
    const ok = await copyToClipboard(addr);
    showToast(ok ? '✅ Address copied!' : '❌ Copy failed', ok ? 'success' : 'error');
};

window.copyAllPendingAddresses = async function () {
    const pending = Object.values(allWithdrawals)
        .filter(w => w.status === 'pending')
        .map(w => {
            const user = allUsers[w.uid] || {};
            return `${user.name || 'N/A'} | ${w.amount} RND | ${w.walletAddress}`;
        });

    if (pending.length === 0) {
        showToast('No pending withdrawals', 'info');
        return;
    }

    const text = pending.join('\n');
    const ok = await copyToClipboard(text);
    showToast(ok ? `✅ Copied ${pending.length} addresses!` : '❌ Copy failed', ok ? 'success' : 'error');
};

window.approveWithdrawal = function (wid) {
    const w = allWithdrawals[wid];
    if (!w) return;
    const user = allUsers[w.uid] || {};

    const html = `
        <h3><i class="fas fa-check-circle" style="color:#34d399;"></i> Approve Withdrawal</h3>
        <div class="modal-row"><span class="ml">User</span><span class="mv">${escapeHtml(user.name || 'N/A')}</span></div>
        <div class="modal-row"><span class="ml">Email</span><span class="mv">${escapeHtml(user.email || 'N/A')}</span></div>
        <div class="modal-row"><span class="ml">Amount</span><span class="mv gold">${w.amount} RND</span></div>
        <div class="modal-row"><span class="ml">Wallet Address</span><span class="mv mono">${escapeHtml(w.walletAddress)}</span></div>

        <div class="modal-label">Optional: TX Hash (BEP-20)</div>
        <input type="text" class="modal-input" id="approveTxHash" placeholder="0x... (optional)">

        <div class="modal-actions">
            <button class="modal-btn modal-cancel" onclick="closeAdminModal()">Cancel</button>
            <button class="modal-btn modal-confirm" onclick="confirmApproveWithdrawal('${wid}')">Approve</button>
        </div>
    `;

    document.getElementById('adminModalBox').innerHTML = html;
    document.getElementById('adminModal').classList.add('show');
};

window.confirmApproveWithdrawal = async function (wid) {
    const w = allWithdrawals[wid];
    if (!w) return;

    const txHash = document.getElementById('approveTxHash')?.value.trim() || '';

    try {
        await update(ref(db, `withdrawals/${wid}`), {
            status: 'completed',
            completedAt: Date.now(),
            txHash: txHash || null
        });

        allWithdrawals[wid].status = 'completed';
        allWithdrawals[wid].completedAt = Date.now();
        if (txHash) allWithdrawals[wid].txHash = txHash;

        closeAdminModal();
        renderAll();
        showToast('✅ Withdrawal approved!', 'success');
    } catch (e) {
        console.error(e);
        showToast('❌ Failed to approve', 'error');
    }
};

window.rejectWithdrawal = function (wid) {
    const w = allWithdrawals[wid];
    if (!w) return;
    const user = allUsers[w.uid] || {};

    const html = `
        <h3><i class="fas fa-times-circle" style="color:#f87171;"></i> Reject Withdrawal</h3>
        <div class="modal-row"><span class="ml">User</span><span class="mv">${escapeHtml(user.name || 'N/A')}</span></div>
        <div class="modal-row"><span class="ml">Amount</span><span class="mv gold">${w.amount} RND</span></div>

        <div class="modal-label">Reason for rejection</div>
        <input type="text" class="modal-input" id="rejectReason" placeholder="e.g. Invalid wallet address" value="Invalid wallet address">

        <div style="font-size:12px;color:#fde68a;background:rgba(250,204,21,0.1);border:1px solid rgba(250,204,21,0.3);border-radius:12px;padding:10px 14px;margin-top:14px;">
            ⚠️ The ${w.amount} RND will be refunded to the user's Release Wallet.
        </div>

        <div class="modal-actions">
            <button class="modal-btn modal-cancel" onclick="closeAdminModal()">Cancel</button>
            <button class="modal-btn modal-confirm danger" onclick="confirmRejectWithdrawal('${wid}')">Reject & Refund</button>
        </div>
    `;

    document.getElementById('adminModalBox').innerHTML = html;
    document.getElementById('adminModal').classList.add('show');
};

window.confirmRejectWithdrawal = async function (wid) {
    const w = allWithdrawals[wid];
    if (!w) return;

    const reason = document.getElementById('rejectReason')?.value.trim() || 'No reason provided';

    try {
        await update(ref(db, `withdrawals/${wid}`), {
            status: 'rejected',
            rejectReason: reason,
            rejectedAt: Date.now()
        });

        const userRef = ref(db, `users/${w.uid}`);
        const userSnap = await get(userRef);
        const userData = userSnap.val() || {};
        const currentRelease = Number(userData.releaseWallet) || 0;
        const refunded = currentRelease + Number(w.amount);

        await update(userRef, {
            releaseWallet: Math.round(refunded * 1e8) / 1e8
        });

        allWithdrawals[wid].status = 'rejected';
        allWithdrawals[wid].rejectReason = reason;
        if (allUsers[w.uid]) {
            allUsers[w.uid].releaseWallet = refunded;
        }

        closeAdminModal();
        renderAll();
        showToast('❌ Withdrawal rejected & refunded', 'success');
    } catch (e) {
        console.error(e);
        showToast('❌ Failed to reject', 'error');
    }
};

/* ============================================================
   CSV EXPORT
   ============================================================ */
function downloadCSV(filename, rows) {
    const csv = rows.map(r => r.map(cell => {
        const s = String(cell ?? '');
        return s.includes(',') || s.includes('"') || s.includes('\n')
            ? `"${s.replace(/"/g, '""')}"`
            : s;
    }).join(',')).join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

window.exportUsersCSV = function () {
    const rows = [['Name', 'Email', 'Referral Code', 'Referral Wallet', 'Spin Wallet', 'Tasks Wallet', 'Release Wallet', 'Total Earned', 'Status', 'FB Task', 'Twitter Task', 'Joined']];
    for (const uid in allUsers) {
        const u = allUsers[uid];
        rows.push([
            u.name || '', u.email || '', u.referralCode || '',
            u.referralWallet || 0, u.spinWallet || 0, u.socialTasksWallet || 0,
            u.releaseWallet || 0, u.totalEarned || 0, u.status || 'active',
            u.socialTasks?.facebook ? 'Yes' : 'No',
            u.socialTasks?.twitter ? 'Yes' : 'No',
            u.createdAt || ''
        ]);
    }
    downloadCSV(`rnd_users_${Date.now()}.csv`, rows);
    showToast('✅ Users CSV downloaded', 'success');
};

window.exportTransactionsCSV = function () {
    const rows = [['User Name', 'Email', 'Amount (RND)', 'Wallet Address', 'Status', 'Date', 'TX Hash', 'Reason']];
    for (const wid in allWithdrawals) {
        const w = allWithdrawals[wid];
        const u = allUsers[w.uid] || {};
        rows.push([
            u.name || '', u.email || '', w.amount || 0,
            w.walletAddress || '', w.status || '',
            formatDate(w.createdAt || w.date),
            w.txHash || '', w.rejectReason || ''
        ]);
    }
    downloadCSV(`rnd_transactions_${Date.now()}.csv`, rows);
    showToast('✅ Transactions CSV downloaded', 'success');
};

window.exportStakesCSV = function () {
    const rows = [['User Name', 'Email', 'Stake ID', 'Principal', 'Bonus', 'Total', 'Released', 'Status', 'Stake Date', 'Lock End']];
    for (const key in allStakes) {
        const s = allStakes[key];
        rows.push([
            s.userName || '', s.userEmail || '', s.stakeId || '',
            s.principalAmount || 0, s.bonusAmount || 0, s.totalStakingAmount || 0,
            s.releasedAmount || 0, s.status || '',
            formatDate(s.stakeStartAt), formatDate(s.lockEndAt)
        ]);
    }
    downloadCSV(`rnd_stakes_${Date.now()}.csv`, rows);
    showToast('✅ Stakes CSV downloaded', 'success');
};

/* ============================================================
   MODAL CLOSE
   ============================================================ */
window.closeAdminModal = function () {
    document.getElementById('adminModal').classList.remove('show');
};

document.getElementById('adminModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'adminModal') window.closeAdminModal();
});

/* ============================================================
   REFRESH
   ============================================================ */
window.refreshAllData = async function () {
    showToast('🔄 Refreshing data...', 'info');
    await loadAllData();
};

/* ============================================================
   TABS
   ============================================================ */
function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.admin-panel-tab').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.querySelector(`.admin-panel-tab[data-panel="${tabName}"]`)?.classList.add('active');
        });
    });
}

/* ============================================================
   FILTERS
   ============================================================ */
function initFilters() {
    ['userSearchInput', 'userStatusFilter'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', renderUsers);
        document.getElementById(id)?.addEventListener('change', renderUsers);
    });

    ['withdrawalSearchInput', 'withdrawalStatusFilter'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', renderWithdrawals);
        document.getElementById(id)?.addEventListener('change', renderWithdrawals);
    });

    ['transactionSearchInput', 'transactionStatusFilter'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', renderTransactions);
        document.getElementById(id)?.addEventListener('change', renderTransactions);
    });

    ['stakeSearchInput', 'stakeStatusFilter'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', renderStakes);
        document.getElementById(id)?.addEventListener('change', renderStakes);
    });
}

/* ============================================================
   INIT
   ============================================================ */
async function init() {
    document.getElementById('adminLoginForm')?.addEventListener('submit', handleLogin);
    initTabs();
    initFilters();

    const hasSession = await checkExistingSession();
    if (hasSession) {
        await showAdminPanel();
    } else {
        document.getElementById('loadingScreen').classList.add('hide');
        document.getElementById('loginScreen').classList.remove('hide');
    }
}

init();

console.log('🛡️ RND Admin Panel loaded');
console.log(`👤 Admin: ${ADMIN_EMAIL}`);
console.log(`🔑 UID: ${ADMIN_UID}`);
