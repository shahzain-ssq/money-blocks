import { WebSocketManager } from './js/ws-manager.js';
import { fetchJson, getErrorMessage } from './js/api.js';

async function init() {
    try {
        clearActivityError();
        const config = await fetchJson('/api/config.php');
        const me = await fetchJson('/api/auth_me.php');

        // WS for status
        if (config.wsPublicUrl && me.user) {
            WebSocketManager.getInstance(me.user.institution_id, config.wsPublicUrl).onStatusChange(status => {
                const el = document.getElementById('ws-status');
                if (el) {
                    el.textContent = status === 'connected' ? '● Live' : '○ Offline';
                    el.className = status === 'connected' ? 'status-live' : 'status-offline';
                }
            });
        }

        loadActivity();
    } catch (e) {
        console.error('Activity init failed', e);
        if (redirectIfUnauthorized(e)) return;
        setActivityError(getErrorMessage(e, 'Failed to initialize activity feed.'));
    }
}

function setActivityError(message) {
    const el = document.getElementById('activityError');
    if (!el) return;
    el.textContent = message;
    el.style.display = 'block';
}

function clearActivityError() {
    const el = document.getElementById('activityError');
    if (!el) return;
    el.textContent = '';
    el.style.display = 'none';
}

function redirectIfUnauthorized(err) {
    if (err?.status === 401 || err?.code === 'unauthorized') {
        window.location = '/';
        return true;
    }
    return false;
}

async function loadActivity() {
    try {
        clearActivityError();
        const data = await fetchJson('/api/activity.php');

        const tbody = document.getElementById('activityBody');
        tbody.innerHTML = '';

        if (!data.activity || data.activity.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center muted">No activity found.</td></tr>';
            return;
        }

        data.activity.forEach(row => {
            const tr = document.createElement('tr');
            const total = parseFloat(row.price) * parseFloat(row.quantity);
            const time = new Date(`${row.created_at}Z`).toLocaleString();

            tr.innerHTML = `
                <td>${time}</td>
                <td><span class="badge ${getTypeClass(row.type)}">${row.type}</span></td>
                <td>${row.ticker}</td>
                <td>${row.quantity}</td>
                <td>$${parseFloat(row.price).toFixed(2)}</td>
                <td>$${total.toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error('Failed to load activity', e);
        if (redirectIfUnauthorized(e)) return;
        setActivityError(getErrorMessage(e, 'Failed to load activity.'));
    }
}

function getTypeClass(type) {
    switch(type) {
        case 'BUY': return 'badge-success';
        case 'SELL': return 'badge-danger';
        case 'SHORT_OPEN': return 'badge-warning';
        case 'SHORT_CLOSE': return 'badge-info';
        default: return 'badge-secondary';
    }
}

init();
