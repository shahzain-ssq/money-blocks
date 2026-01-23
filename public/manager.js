import { WebSocketManager } from './js/ws-manager.js';
import { fetchJson, getErrorMessage } from './js/api.js';

async function initManager() {
  try {
    clearManagerError();
    bindModalControls();
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
    bindManagerActions();

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

function bindModalControls() {
    document.addEventListener('click', (event) => {
        const closeBtn = event.target.closest('[data-action="close-modal"]');
        if (!closeBtn) return;
        const modal = closeBtn.closest('.modal');
        if (modal) {
            modal.style.display = 'none';
        }
    });
}

function setFormError(id, message) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!message) {
        el.textContent = '';
        el.style.display = 'none';
        return;
    }
    el.textContent = message;
    el.style.display = 'block';
}

function setFormBusy(form, isBusy) {
    if (!form) return;
    form.setAttribute('aria-busy', isBusy ? 'true' : 'false');
    const elements = form.querySelectorAll('input, textarea, select, button');
    elements.forEach((el) => {
        el.disabled = isBusy;
    });
}

async function openAdminEditModal({
    id,
    modalId,
    formId,
    errorId,
    title,
    loadUrl,
    beforeOpen,
    populateForm,
}) {
    setFormError(errorId, '');
    const form = document.getElementById(formId);
    if (!form) return;
    form.reset();
    if (typeof beforeOpen === 'function') {
        beforeOpen(form, id);
    }
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.querySelector('h3').textContent = title;
        modal.style.display = 'block';
    }

    if (!id || !loadUrl) return;

    try {
        setFormBusy(form, true);
        const data = await fetchJson(loadUrl);
        if (typeof populateForm === 'function') {
            populateForm(form, data);
        }
    } catch (e) {
        console.error('Failed to load admin edit data', e);
        if (redirectIfUnauthorized(e)) return;
        setFormError(errorId, getErrorMessage(e, 'Failed to load data.'));
    } finally {
        setFormBusy(form, false);
    }
}

function bindManagerActions() {
    const participantAddBtn = document.getElementById('addParticipantBtn');
    if (participantAddBtn) {
        participantAddBtn.addEventListener('click', () => openParticipantModal());
    }
    const stockAddBtn = document.getElementById('addStockBtn');
    if (stockAddBtn) {
        stockAddBtn.addEventListener('click', () => openStockModal());
    }
    const scenarioAddBtn = document.getElementById('addScenarioBtn');
    if (scenarioAddBtn) {
        scenarioAddBtn.addEventListener('click', () => openScenarioModal());
    }

    const participantsList = document.getElementById('participantsList');
    if (participantsList) {
        participantsList.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button) return;
            event.preventDefault();
            const id = Number(button.dataset.id);
            if (!id) return;
            if (button.dataset.action === 'promote-user') {
                promoteUser(id);
            }
            if (button.dataset.action === 'reset-password') {
                const name = button.dataset.name || 'this user';
                resetPassword(id, name);
            }
        });
    }

    const stocksList = document.getElementById('stocksList');
    if (stocksList) {
        stocksList.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-action="edit-stock"]');
            if (!button) return;
            event.preventDefault();
            const id = Number(button.dataset.id);
            if (!id) return;
            openStockModal(id);
        });
    }

    const scenariosList = document.getElementById('scenariosList');
    if (scenariosList) {
        scenariosList.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-action="edit-scenario"]');
            if (!button) return;
            event.preventDefault();
            const id = Number(button.dataset.id);
            if (!id) return;
            openScenarioModal(id);
        });
    }
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
        const isManager = p.role === 'manager' || p.role === 'admin';
        const displayName = p.username || p.email || 'Participant';
        const div = document.createElement('div');
        div.className = 'participant-item';

        const info = document.createElement('div');
        const nameEl = document.createElement('strong');
        nameEl.textContent = displayName;
        info.appendChild(nameEl);
        if (isManager) {
            const badge = document.createElement('span');
            badge.className = 'badge badge-info';
            badge.textContent = 'Manager';
            info.appendChild(document.createTextNode(' '));
            info.appendChild(badge);
        }
        info.appendChild(document.createElement('br'));
        const cash = document.createElement('small');
        cash.textContent = `Cash: ${p.cash_balance || 0}`;
        info.appendChild(cash);

        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '0.5rem';

        if (!isManager) {
            const promoteBtn = document.createElement('button');
            promoteBtn.className = 'btn btn-sm btn-outline';
            promoteBtn.type = 'button';
            promoteBtn.dataset.action = 'promote-user';
            promoteBtn.dataset.id = p.id;
            promoteBtn.textContent = 'Promote';
            actions.appendChild(promoteBtn);
        }

        const resetBtn = document.createElement('button');
        resetBtn.className = 'btn btn-sm btn-outline';
        resetBtn.type = 'button';
        resetBtn.dataset.action = 'reset-password';
        resetBtn.dataset.id = p.id;
        resetBtn.dataset.name = displayName;
        resetBtn.textContent = 'Pwd';
        actions.appendChild(resetBtn);

        div.appendChild(info);
        div.appendChild(actions);
        list.appendChild(div);
    });
}

document.getElementById('participantSearch').addEventListener('input', () => {
    renderParticipants();
});

async function resetPassword(id, name) {
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
}

async function promoteUser(id) {
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
}

function openParticipantModal() {
    setFormError('participantFormError', '');
    const form = document.getElementById('addParticipantForm');
    if (form) {
        form.reset();
    }
    const modal = document.getElementById('addParticipantModal');
    if (modal) {
        modal.style.display = 'block';
    }
}

document.getElementById('addParticipantForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = Object.fromEntries(formData.entries());

    try {
        setFormError('participantFormError', '');
        setFormBusy(e.target, true);
        const data = await fetchJson('/api/manager_participants.php', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        alert(`User created! Temp Password: ${data.temp_password}`);
        document.getElementById('addParticipantModal').style.display='none';
        loadParticipants();
    } catch (e) {
        console.error('Failed to create participant', e);
        if (redirectIfUnauthorized(e)) return;
        const message = getErrorMessage(e, 'Failed to create participant.');
        setFormError('participantFormError', message);
    } finally {
        setFormBusy(e.target, false);
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
                 <button class="btn btn-sm btn-outline" type="button" data-action="edit-stock" data-id="${s.id}">Edit</button>
            </div>
        `;
        list.appendChild(div);
    });
}

document.getElementById('stockSearch').addEventListener('input', () => {
    renderStocks();
});

async function openStockModal(id) {
    await openAdminEditModal({
        id,
        modalId: 'addStockModal',
        formId: 'addStockForm',
        errorId: 'stockFormError',
        title: id ? 'Edit Stock' : 'Add Stock',
        loadUrl: id ? `/api/manager_stocks.php?id=${id}` : null,
        beforeOpen: (form, stockId) => {
            let idInput = form.querySelector('input[name="id"]');
            if (!idInput) {
                idInput = document.createElement('input');
                idInput.type = 'hidden';
                idInput.name = 'id';
                form.appendChild(idInput);
            }
            idInput.value = stockId ? String(stockId) : '';
            const initialPriceGroup = form.querySelector('[data-field="initial-price"]');
            const currentPriceGroup = form.querySelector('[data-field="current-price"]');
            const initialPriceInput = form.querySelector('input[name="initial_price"]');
            const priceInput = form.querySelector('input[name="price"]');
            const isEdit = !!stockId;
            if (initialPriceGroup) {
                initialPriceGroup.style.display = isEdit ? 'none' : '';
            }
            if (currentPriceGroup) {
                currentPriceGroup.style.display = isEdit ? '' : 'none';
            }
            if (initialPriceInput) {
                initialPriceInput.disabled = isEdit;
                initialPriceInput.required = !isEdit;
            }
            if (priceInput && !isEdit) {
                priceInput.value = '';
            }
            if (!isEdit) {
                delete form.dataset.currentPrice;
            }
        },
        populateForm: (form, data) => {
            if (!data.stock) {
                throw new Error('Stock data missing from response.');
            }
            form.ticker.value = data.stock.ticker || '';
            form.name.value = data.stock.name || '';
            form.initial_price.value = data.stock.initial_price ?? '';
            if (form.price) {
                const currentPrice = data.stock.current_price ?? data.stock.initial_price ?? '';
                form.price.value = currentPrice;
                form.dataset.currentPrice = currentPrice;
            }
            form.total_limit.value = data.stock.total_limit ?? '';
            const perUserLimitInput = form.querySelector('[name="per_user_limit"]');
            if (perUserLimitInput) {
                perUserLimitInput.value = data.stock.per_user_limit ?? '';
            }
            const perUserShortLimitInput = form.querySelector('[name="per_user_short_limit"]');
            if (perUserShortLimitInput) {
                perUserShortLimitInput.value = data.stock.per_user_short_limit ?? '';
            }
        },
    });
}

document.getElementById('addStockForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = Object.fromEntries(formData.entries());

    const isEdit = !!payload.id;
    const method = isEdit ? 'PUT' : 'POST';
    const url = isEdit ? `/api/manager_stocks.php?id=${payload.id}` : '/api/manager_stocks.php';
    ['total_limit', 'per_user_limit', 'per_user_short_limit'].forEach((key) => {
        if (payload[key] === '') {
            payload[key] = null;
        }
    });
    if (isEdit) {
        delete payload.initial_price;
        const originalPrice = Number(e.target.dataset.currentPrice);
        const submittedPrice = payload.price === '' ? NaN : Number(payload.price);
        if (!Number.isFinite(submittedPrice) || (Number.isFinite(originalPrice) && submittedPrice === originalPrice)) {
            delete payload.price;
        }
    }

    try {
        setFormError('stockFormError', '');
        setFormBusy(e.target, true);
        await fetchJson(url, {
            method: method,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        alert(isEdit ? 'Stock updated' : 'Stock created');
        document.getElementById('addStockModal').style.display='none';
        loadStocks();
    } catch (e) {
        console.error('Failed to save stock', e);
        if (redirectIfUnauthorized(e)) return;
        const message = getErrorMessage(e, 'Failed to save stock.');
        setFormError('stockFormError', message);
    } finally {
        setFormBusy(e.target, false);
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
                 <button class="btn btn-sm btn-outline" type="button" data-action="edit-scenario" data-id="${s.id}">Edit</button>
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

async function openScenarioModal(id) {
    await openAdminEditModal({
        id,
        modalId: 'scenarioModal',
        formId: 'scenarioForm',
        errorId: 'scenarioFormError',
        title: id ? 'Edit Scenario' : 'Add Scenario',
        loadUrl: id ? `/api/manager_scenarios.php?id=${id}` : null,
        beforeOpen: () => {
            document.getElementById('scenarioId').value = id ? String(id) : '';
        },
        populateForm: (_form, data) => {
            const scenario = data.scenario;
            if (!scenario) {
                throw new Error('Scenario data missing from response.');
            }
            document.getElementById('scenarioTitle').value = scenario.title || '';
            document.getElementById('scenarioDesc').value = scenario.description || '';
            document.getElementById('scenarioStatus').value = scenario.status || 'draft';
            if (scenario.starts_at) {
                const startsAt = new Date(`${scenario.starts_at}Z`);
                const localIso = new Date(startsAt.getTime() - startsAt.getTimezoneOffset() * 60000).toISOString();
                document.getElementById('scenarioStart').value = localIso.slice(0, 16);
            } else {
                document.getElementById('scenarioStart').value = '';
            }
        },
    });
}

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

    const isEdit = !!payload.id;
    const method = isEdit ? 'PUT' : 'POST';
    const url = isEdit ? `/api/manager_scenarios.php?id=${payload.id}` : '/api/manager_scenarios.php';

    try {
        setFormError('scenarioFormError', '');
        setFormBusy(e.target, true);
        await fetchJson(url, {
            method: method,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        alert('Scenario saved');
        document.getElementById('scenarioModal').style.display='none';
        loadScenarios();
    } catch (e) {
        console.error('Failed to save scenario', e);
        if (redirectIfUnauthorized(e)) return;
        const message = getErrorMessage(e, 'Failed to save scenario.');
        setFormError('scenarioFormError', message);
    } finally {
        setFormBusy(e.target, false);
    }
});

initManager();
