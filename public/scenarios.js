import { WebSocketManager } from './js/ws-manager.js';
import { fetchJson, getErrorMessage } from './js/api.js';

// Init WS for status pill
async function init() {
    try {
        clearScenarioError();
        const config = await fetchJson('/api/config.php');
        const me = await fetchJson('/api/auth_me.php');
        if (!me.user) return;

        if (config.wsPublicUrl && me.user) {
             WebSocketManager.getInstance(me.user.institution_id, config.wsPublicUrl).onStatusChange(status => {
                 const el = document.getElementById('ws-status');
                 if(el) {
                     el.textContent = status === 'connected' ? '● Live' : '○ Offline';
                     el.className = status === 'connected' ? 'status-live' : 'status-offline';
                 }
             });
        }

        loadScenarios();
    } catch(e) {
        console.error(e);
        if (redirectIfUnauthorized(e)) return;
        setScenarioError(getErrorMessage(e, 'Failed to initialize scenarios.'));
    }
}

async function loadScenarios() {
    try {
        clearScenarioError();
        const data = await fetchJson('/api/scenarios.php');
        const list = document.getElementById('scenariosList');
        list.innerHTML = '';

        if (!data.scenarios || data.scenarios.length === 0) {
            list.innerHTML = '<p class="muted">No active scenarios.</p>';
            return;
        }

        data.scenarios.forEach(s => {
            const div = document.createElement('div');
            div.className = `card scenario-card ${s.is_read == 0 ? 'unread' : ''}`;

            const date = new Date(`${(s.starts_at || s.created_at)}Z`).toLocaleString();

            div.innerHTML = `
                <div class="scenario-meta">
                    <span>${date}</span>
                    ${s.is_read == 0 ? '<span class="badge badge-danger">New</span>' : '<span class="badge badge-secondary">Read</span>'}
                </div>
                <h3>${s.title}</h3>
                <p>${s.description || ''}</p>
                <div style="margin-top: 1rem;">
                    <button class="btn btn-sm btn-outline" onclick="toggleRead(${s.id}, ${s.is_read == 0})">
                        ${s.is_read == 0 ? 'Mark as Read' : 'Mark Unread'}
                    </button>
                </div>
            `;
            list.appendChild(div);
        });
    } catch (e) {
        console.error('Failed to load scenarios', e);
        if (redirectIfUnauthorized(e)) return;
        setScenarioError(getErrorMessage(e, 'Failed to load scenarios.'));
    }
}

window.toggleRead = async function(id, shouldMarkRead) {
    try {
        await fetchJson('/api/scenarios.php', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ action: 'toggle_read', scenario_id: id, read: shouldMarkRead })
        });
        loadScenarios();
        // Also update global badge if possible (notifications.js will handle it on refresh, or we can trigger it)
        if (window.updateNotifications) window.updateNotifications();
    } catch(e) {
        console.error(e);
        if (redirectIfUnauthorized(e)) return;
        setScenarioError(getErrorMessage(e, 'Failed to update scenario status.'));
    }
};

function setScenarioError(message) {
    const el = document.getElementById('scenariosError');
    if (!el) return;
    el.textContent = message;
    el.style.display = 'block';
}

function clearScenarioError() {
    const el = document.getElementById('scenariosError');
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

init();
