import { WebSocketManager } from './js/ws-manager.js';
import { fetchJson, getErrorMessage } from './js/api.js';

async function initManager() {
  try {
    clearManagerError();
    const config = await fetchJson('/api/config.php');
    const me = await fetchJson('/api/auth_me.php');
    if (!me.user || (me.user.role !== 'manager' && me.user.role !== 'admin')) {
      window.location = '/';
      return;
    }

    // WS
    if (config.wsPublicUrl) {
         WebSocketManager.getInstance(me.user.institution_id, config.wsPublicUrl).onStatusChange(status => {
             const el = document.getElementById('ws-status');
             if(el) {
                 el.textContent = status === 'connected' ? '● Live' : '○ Offline';
                 el.className = status === 'connected' ? 'status-live' : 'status-offline';
             }
         });
    }

    loadParticipants();
    loadStocks();
    loadConfig();
    loadScenarios();

  } catch (err) {
    console.error('Failed to initialize manager view:', err);
    if (redirectIfUnauthorized(err)) return;
    setManagerError(getErrorMessage(err, 'Failed to load admin data.'));
  }
}

function setManagerError(message) {
    const el = document.getElementById('managerError');
    if (!el) return;
    el.textContent = message;
    el.style.display = 'block';
}

function clearManagerError() {
    const el = document.getElementById('managerError');
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

// Participants
let allParticipants = [];

async function loadParticipants() {
    try {
        const data = await fetchJson('/api/manager_participants.php');
        allParticipants = data.participants || [];
        clearManagerError();
        renderParticipants();
    } catch (e) {
        console.error('Failed to load participants', e);
        if (redirectIfUnauthorized(e)) return;
        setManagerError(getErrorMessage(e, 'Failed to load participants.'));
    }
}

function renderParticipants() {
    const list = document.getElementById('participantsList');
    list.innerHTML = '';
    const query = (document.getElementById('participantSearch').value || '').toLowerCase();

    const filtered = allParticipants.filter(p => {
        const text = (p.username || '') + ' ' + (p.email || '') + ' ' + (p.role || '');
        return text.toLowerCase().includes(query);
    });
    if (filtered.length === 0) {
        list.innerHTML = '<p class="muted">No participants found.</p>';
        return;
    }
    filtered.forEach(p => {
        const div = document.createElement('div');
        div.className = 'participant-item';
        const isManager = p.role === 'manager' || p.role === 'admin';
        div.innerHTML = `
            <div>
                <strong>${p.username || p.email}</strong>
                ${isManager ? '<span class="badge badge-info">Manager</span>' : ''}<br>
                <small>Cash: ${p.cash_balance || 0}</small>
            </div>
            <div style="display:flex; gap:0.5rem;">
                 ${!isManager ? `<button class="btn btn-sm btn-outline" onclick="promoteUser(${p.id})">Promote</button>` : ''}
                 <button class="btn btn-sm btn-outline" onclick="resetPassword(${p.id}, '${p.username || p.email}')">Pwd</button>
            </div>
        `;
        list.appendChild(div);
    });
}

document.getElementById('participantSearch').addEventListener('input', () => {
    renderParticipants();
});

window.resetPassword = async function(id, name) {
    const newPwd = prompt(`Enter new password for ${name}:`);
    if (!newPwd) return;
    try {
        const data = await fetchJson('/api/manager_password_reset.php', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ user_id: id, password: newPwd })
        });
        alert(data.message);
    } catch(e) {
        console.error(e);
        if (redirectIfUnauthorized(e)) return;
        alert(getErrorMessage(e, 'Failed to reset password.'));
    }
};

window.promoteUser = async function(id) {
    if(!confirm('Promote user to Manager?')) return;
    try {
        await fetchJson('/api/manager_participants.php', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({id: id, role: 'manager'})
        });
        alert('User promoted');
        loadParticipants();
    } catch(e) {
        console.error(e);
        if (redirectIfUnauthorized(e)) return;
        alert(getErrorMessage(e, 'Failed to promote user.'));
    }
};

document.getElementById('addParticipantForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = Object.fromEntries(formData.entries());

    try {
        const data = await fetchJson('/api/manager_participants.php', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        alert(`User created! Temp Password: ${data.temp_password}`);
        document.getElementById('addParticipantModal').style.display='none';
        loadParticipants();
    } catch (e) {
        if (redirectIfUnauthorized(e)) return;
        alert(getErrorMessage(e, 'Failed to create participant.'));
    }
});


// Stocks
let allStocks = [];

async function loadStocks() {
    try {
        const data = await fetchJson('/api/manager_stocks.php');
        allStocks = data.stocks || [];
        clearManagerError();
        renderStocks();
    } catch (e) {
        console.error('Failed to load stocks', e);
        if (redirectIfUnauthorized(e)) return;
        setManagerError(getErrorMessage(e, 'Failed to load stocks.'));
    }
}

function renderStocks() {
    const list = document.getElementById('stocksList');
    list.innerHTML = '';
    const query = (document.getElementById('stockSearch').value || '').toLowerCase();

    const filtered = allStocks.filter(s => {
        const text = (s.ticker || '') + ' ' + (s.name || '');
        return text.toLowerCase().includes(query);
    });
    if (filtered.length === 0) {
        list.innerHTML = '<p class="muted">No stocks found.</p>';
        return;
    }
    filtered.forEach(s => {
        const div = document.createElement('div');
        div.className = 'participant-item';
        div.innerHTML = `
            <div>
                <strong>${s.ticker}</strong> - ${s.name}<br>
                <small>${s.current_price || s.initial_price}</small>
            </div>
             <div>
                 <button class="btn btn-sm btn-outline" onclick="editStock(${s.id})">Edit</button>
            </div>
        `;
        list.appendChild(div);
    });
}

document.getElementById('stockSearch').addEventListener('input', () => {
    renderStocks();
});

window.editStock = function(id) {
    const s = allStocks.find(x => x.id === id);
    if (!s) return;

    const form = document.getElementById('addStockForm');
    form.ticker.value = s.ticker;
    form.name.value = s.name;
    form.initial_price.value = s.initial_price;
    form.total_limit.value = s.total_limit || '';

    // Check if we need to add hidden input for ID or handle it in submit
    let idInput = form.querySelector('input[name="id"]');
    if (!idInput) {
        idInput = document.createElement('input');
        idInput.type = 'hidden';
        idInput.name = 'id';
        form.appendChild(idInput);
    }
    idInput.value = s.id;

    // Change Title
    const modal = document.getElementById('addStockModal');
    modal.querySelector('h3').textContent = 'Edit Stock';
    modal.style.display = 'block';
};

// Reset form when opening via Add button (which needs to be wired if not already)
// The HTML has onclick="document.getElementById('addStockModal').style.display='block'"
// We should intercept this or clear form on submit/cancel.
// Or better: add a window function for openAddStockModal
window.openAddStockModal = function() {
    const form = document.getElementById('addStockForm');
    form.reset();
    const idInput = form.querySelector('input[name="id"]');
    if (idInput) idInput.value = '';

    const modal = document.getElementById('addStockModal');
    modal.querySelector('h3').textContent = 'Add Stock';
    modal.style.display = 'block';
};

// Update HTML to use openAddStockModal instead of direct style manipulation if possible
// But since we can't easily change HTML onclicks without editing HTML file, let's just leave it
// and handle "Add" logic: if I click Add after Edit, the form might have values.
// I should use mutation observer or just update the HTML file too.
// Let's update HTML file to call openAddStockModal().

document.getElementById('addStockForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = Object.fromEntries(formData.entries());

    const isEdit = !!payload.id;
    const method = isEdit ? 'PUT' : 'POST';
    const url = isEdit ? `/api/manager_stocks.php?id=${payload.id}` : '/api/manager_stocks.php';

    try {
        await fetchJson(url, {
            method: method,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        alert(isEdit ? 'Stock updated' : 'Stock created');
        document.getElementById('addStockModal').style.display='none';
        loadStocks();
    } catch (e) {
        if (redirectIfUnauthorized(e)) return;
        alert(getErrorMessage(e, 'Failed to save stock.'));
    }
});

// Config
async function loadConfig() {
    try {
        const data = await fetchJson('/api/manager_config.php');
        if (data.short_durations) {
            document.getElementById('shortDurations').value = data.short_durations.map(d => d.duration_seconds).join(', ');
        }
    } catch (e) {
        console.warn('Manager config load failed', e);
    }
}

document.getElementById('saveConfigBtn').addEventListener('click', async () => {
    const val = document.getElementById('shortDurations').value;
    const durations = val.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));

    try {
        await fetchJson('/api/manager_config.php', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ short_durations: durations })
        });
        alert('Config Saved');
    } catch (e) {
        if (redirectIfUnauthorized(e)) return;
        alert(getErrorMessage(e, 'Failed to save config.'));
    }
});

// Scenarios
let allScenarios = [];
async function loadScenarios() {
    try {
        const data = await fetchJson('/api/manager_scenarios.php');
        allScenarios = data.scenarios || [];
        clearManagerError();
        renderScenarios();
    } catch(e) {
        console.error(e);
        if (redirectIfUnauthorized(e)) return;
        setManagerError(getErrorMessage(e, 'Failed to load scenarios.'));
    }
}

function renderScenarios() {
    const list = document.getElementById('scenariosList');
    list.innerHTML = '';

    if (allScenarios.length === 0) {
        list.innerHTML = '<p class="muted">No scenarios available.</p>';
        return;
    }

    allScenarios.forEach(s => {
        const div = document.createElement('div');
        div.className = 'participant-item';
        const startsAt = s.starts_at ? new Date(`${s.starts_at}Z`).toLocaleString() : 'Immediate';
        div.innerHTML = `
            <div>
                <strong>${s.title}</strong>
                <span class="badge badge-${getStatusBadge(s.status)}">${s.status}</span><br>
                <small>Starts: ${startsAt}</small>
            </div>
             <div>
                 <button class="btn btn-sm btn-outline" onclick="editScenario(${s.id})">Edit</button>
            </div>
        `;
        list.appendChild(div);
    });
}

function getStatusBadge(status) {
    if (status === 'published') return 'success';
    if (status === 'draft') return 'warning';
    return 'secondary';
}

window.openScenarioModal = function() {
    document.getElementById('scenarioForm').reset();
    document.getElementById('scenarioId').value = '';
    document.getElementById('scenarioModalTitle').textContent = 'Add Scenario';
    document.getElementById('scenarioModal').style.display='block';
};

window.editScenario = function(id) {
    const s = allScenarios.find(x => x.id === id);
    if (!s) return;
    document.getElementById('scenarioId').value = s.id;
    document.getElementById('scenarioTitle').value = s.title;
    document.getElementById('scenarioDesc').value = s.description || '';
    document.getElementById('scenarioStatus').value = s.status;
    // Format starts_at for input
    if (s.starts_at) {
        const startsAt = new Date(`${s.starts_at}Z`);
        const localIso = new Date(startsAt.getTime() - startsAt.getTimezoneOffset() * 60000).toISOString();
        document.getElementById('scenarioStart').value = localIso.slice(0, 16);
    } else {
        document.getElementById('scenarioStart').value = '';
    }
    document.getElementById('scenarioModalTitle').textContent = 'Edit Scenario';
    document.getElementById('scenarioModal').style.display='block';
};

document.getElementById('scenarioForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = Object.fromEntries(formData.entries());
    // Fix datetime format if needed
    if (payload.starts_at) {
        const localDate = new Date(payload.starts_at);
        const utcIso = new Date(localDate.getTime() - localDate.getTimezoneOffset() * 60000).toISOString();
        payload.starts_at = utcIso.slice(0, 19).replace('T', ' ');
    }

    try {
        await fetchJson('/api/manager_scenarios.php', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        alert('Scenario saved');
        document.getElementById('scenarioModal').style.display='none';
        loadScenarios();
    } catch (e) {
        if (redirectIfUnauthorized(e)) return;
        alert(getErrorMessage(e, 'Failed to save scenario.'));
    }
});

initManager();
