import { WebSocketManager } from './js/ws-manager.js';

async function initManager() {
  try {
    const config = await fetch('/api/config.php').then(r => r.json());
    const meRes = await fetch('/api/auth_me.php');
    if (!meRes.ok) {
      window.location = '/';
      return;
    }
    const me = await meRes.json();
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
    window.location = '/';
  }
}

// Participants
let allParticipants = [];

async function loadParticipants() {
    const res = await fetch('/api/manager_participants.php');
    const data = await res.json();
    allParticipants = data.participants || [];
    renderParticipants();
}

function renderParticipants() {
    const list = document.getElementById('participantsList');
    list.innerHTML = '';
    const query = (document.getElementById('participantSearch').value || '').toLowerCase();

    allParticipants.filter(p => {
        const text = (p.username || '') + ' ' + (p.email || '') + ' ' + (p.role || '');
        return text.toLowerCase().includes(query);
    }).forEach(p => {
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
        const res = await fetch('/api/manager_password_reset.php', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ user_id: id, password: newPwd })
        });
        const data = await res.json();
        if (res.ok) {
            alert(data.message);
        } else {
            alert(data.error);
        }
    } catch(e) { console.error(e); alert('Failed to reset password'); }
};

window.promoteUser = async function(id) {
    if(!confirm('Promote user to Manager?')) return;
    try {
        const res = await fetch('/api/manager_participants.php', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({id: id, role: 'manager'})
        });
        if(res.ok) {
            alert('User promoted');
            loadParticipants();
        } else {
            alert('Failed to promote');
        }
    } catch(e) { console.error(e); alert('Error'); }
};

document.getElementById('addParticipantForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = Object.fromEntries(formData.entries());

    const res = await fetch('/api/manager_participants.php', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if(res.ok) {
        alert(`User created! Temp Password: ${data.temp_password}`);
        document.getElementById('addParticipantModal').style.display='none';
        loadParticipants();
    } else {
        alert(data.error);
    }
});


// Stocks
let allStocks = [];

async function loadStocks() {
    const res = await fetch('/api/manager_stocks.php');
    const data = await res.json();
    allStocks = data.stocks || [];
    renderStocks();
}

function renderStocks() {
    const list = document.getElementById('stocksList');
    list.innerHTML = '';
    const query = (document.getElementById('stockSearch').value || '').toLowerCase();

    allStocks.filter(s => {
        const text = (s.ticker || '') + ' ' + (s.name || '');
        return text.toLowerCase().includes(query);
    }).forEach(s => {
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

    const res = await fetch(url, {
        method: method,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });
    if(res.ok) {
        alert(isEdit ? 'Stock updated' : 'Stock created');
        document.getElementById('addStockModal').style.display='none';
        loadStocks();
    } else {
        const data = await res.json();
        alert('Failed: ' + (data.error || 'Unknown error'));
    }
});

// Config
async function loadConfig() {
    const res = await fetch('/api/manager_config.php');
    if(!res.ok) return; // Might not exist yet
    const data = await res.json();
    if (data.short_durations) {
        document.getElementById('shortDurations').value = data.short_durations.map(d => d.duration_seconds).join(', ');
    }
}

document.getElementById('saveConfigBtn').addEventListener('click', async () => {
    const val = document.getElementById('shortDurations').value;
    const durations = val.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));

    const res = await fetch('/api/manager_config.php', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ short_durations: durations })
    });
    if(res.ok) {
        alert('Config Saved');
    } else {
        alert('Failed');
    }
});

// Scenarios
let allScenarios = [];
async function loadScenarios() {
    try {
        const res = await fetch('/api/manager_scenarios.php');
        const data = await res.json();
        allScenarios = data.scenarios || [];
        renderScenarios();
    } catch(e) { console.error(e); }
}

function renderScenarios() {
    const list = document.getElementById('scenariosList');
    list.innerHTML = '';

    allScenarios.forEach(s => {
        const div = document.createElement('div');
        div.className = 'participant-item';
        div.innerHTML = `
            <div>
                <strong>${s.title}</strong>
                <span class="badge badge-${getStatusBadge(s.status)}">${s.status}</span><br>
                <small>Starts: ${s.starts_at || 'Immediate'}</small>
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
    document.getElementById('scenarioStart').value = s.starts_at ? s.starts_at.replace(' ', 'T').slice(0, 16) : '';
    document.getElementById('scenarioModalTitle').textContent = 'Edit Scenario';
    document.getElementById('scenarioModal').style.display='block';
};

document.getElementById('scenarioForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = Object.fromEntries(formData.entries());
    // Fix datetime format if needed
    if (payload.starts_at) payload.starts_at = payload.starts_at.replace('T', ' ');

    const res = await fetch('/api/manager_scenarios.php', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });
    if (res.ok) {
        alert('Scenario saved');
        document.getElementById('scenarioModal').style.display='none';
        loadScenarios();
    } else {
        alert('Failed');
    }
});

initManager();
