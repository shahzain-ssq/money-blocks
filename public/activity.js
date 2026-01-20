import { WebSocketManager } from './js/ws-manager.js';

async function init() {
    const config = await fetch('/api/config.php').then(r => r.json());
    const me = await fetch('/api/auth_me.php').then(r => r.json());

    // WS for status
    if (config.wsPublicUrl && me.user) {
         WebSocketManager.getInstance(me.user.institution_id, config.wsPublicUrl).onStatusChange(status => {
             const el = document.getElementById('ws-status');
             if(el) {
                 el.textContent = status === 'connected' ? '● Live' : '○ Offline';
                 el.className = status === 'connected' ? 'status-live' : 'status-offline';
             }
         });
    }

    loadActivity();
}

async function loadActivity() {
    const res = await fetch('/api/activity.php');
    const data = await res.json();

    const tbody = document.getElementById('activityBody');
    tbody.innerHTML = '';

    if (!data.activity || data.activity.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center muted">No activity found.</td></tr>';
        return;
    }

    data.activity.forEach(row => {
        const tr = document.createElement('tr');
        const total = parseFloat(row.price) * parseFloat(row.quantity);
        const time = new Date(row.created_at).toLocaleString();

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
