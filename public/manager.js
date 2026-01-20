import { WebSocketManager } from './js/ws-manager.js';

async function initManager() {
  try {
    const config = await fetch('/api/config.php').then(r => r.json());
    const meRes = await fetch('/api/auth_me.php');
    if (!meRes.ok) {
      window.location = '/index.html';
      return;
    }
    const me = await meRes.json();
    if (!me.user || (me.user.role !== 'manager' && me.user.role !== 'admin')) {
      window.location = '/index.html';
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

  } catch (err) {
    console.error('Failed to initialize manager view:', err);
    window.location = '/index.html';
  }
}

// Participants
async function loadParticipants() {
    const res = await fetch('/api/manager_participants.php');
    const data = await res.json();
    const list = document.getElementById('participantsList');
    list.innerHTML = '';

    (data.participants || []).forEach(p => {
        const div = document.createElement('div');
        div.className = 'participant-item';
        div.innerHTML = `
            <div>
                <strong>${p.username || p.email}</strong><br>
                <small>Cash: ${p.cash_balance || 0}</small>
            </div>
            <div>
                 <button class="btn btn-sm btn-outline" onclick="promoteUser(${p.id})">Promote</button>
            </div>
        `;
        list.appendChild(div);
    });
}

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

initManager();
