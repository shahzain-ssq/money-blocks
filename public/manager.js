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
async function loadStocks() {
    const res = await fetch('/api/manager_stocks.php');
    const data = await res.json();
    const list = document.getElementById('stocksList');
    list.innerHTML = '';

    (data.stocks || []).forEach(s => {
        const div = document.createElement('div');
        div.className = 'participant-item';
        div.innerHTML = `
            <div>
                <strong>${s.ticker}</strong> - ${s.name}<br>
                <small>${s.current_price || s.initial_price}</small>
            </div>
             <div>
                 <button class="btn btn-sm btn-outline">Edit</button>
            </div>
        `;
        list.appendChild(div);
    });
}

document.getElementById('addStockForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = Object.fromEntries(formData.entries());

    const res = await fetch('/api/manager_stocks.php', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });
    if(res.ok) {
        alert('Stock created');
        document.getElementById('addStockModal').style.display='none';
        loadStocks();
    } else {
        alert('Failed');
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
    document.getElementById('scenarioStart').value = s.starts_at ? s.starts_at.replace(' ', 'T').slice(0, 16) : '';
    document.getElementById('scenarioModalTitle').textContent = 'Edit Scenario';
    document.getElementById('scenarioModal').style.display='block';
};

document.getElementById('scenarioForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = Object.fromEntries(formData.entries());
    // Fix datetime format if needed or just send string
    // Input datetime-local gives "YYYY-MM-DDTHH:MM"
    // Backend expects MySQL format "YYYY-MM-DD HH:MM:SS" or similar, usually accepts T if flexible, else replace
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
