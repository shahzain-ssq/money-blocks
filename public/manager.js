import { WebSocketManager } from './js/ws-manager.js';
import { fetchJson, getErrorMessage } from './js/api.js';
import { escapeHtml, formatCurrency, formatDateTime, requireUser, updateWsStatus } from './js/ui.js';

const state = {
  participants: [],
  stocks: [],
  scenarios: [],
};

let controlsBound = false;
let shortDurationsLoaded = false;

function setManagerError(message) {
  const el = document.getElementById('managerError');
  if (!el) {
    return;
  }
  el.textContent = message;
  el.style.display = message ? 'block' : 'none';
}

function clearManagerError() {
  setManagerError('');
}

function setFormError(id, message) {
  const el = document.getElementById(id);
  if (!el) {
    return;
  }
  el.textContent = message;
  el.style.display = message ? 'block' : 'none';
}

function setFormBusy(form, isBusy) {
  form.setAttribute('aria-busy', isBusy ? 'true' : 'false');
  form.querySelectorAll('input, select, textarea, button').forEach((element) => {
    element.disabled = isBusy;
  });
}

function isAuthError(error) {
  return error?.status === 401 || error?.status === 403 || error?.code === 'unauthorized' || error?.code === 'forbidden';
}

function handleAuthError(error) {
  if (isAuthError(error)) {
    window.location = '/';
    return true;
  }
  return false;
}

function openModal(id, title) {
  const modal = document.getElementById(id);
  if (!modal) {
    return;
  }
  if (title) {
    const heading = modal.querySelector('h3');
    if (heading) {
      heading.textContent = title;
    }
  }
  modal.style.display = 'flex';
}

function closeModal(modal) {
  if (modal) {
    modal.style.display = 'none';
  }
}

function bindControls() {
  if (controlsBound) {
    return;
  }
  controlsBound = true;

  document.addEventListener('click', (event) => {
    const closeButton = event.target.closest('[data-action="close-modal"]');
    if (closeButton) {
      closeModal(closeButton.closest('.modal'));
      return;
    }

    const participantAction = event.target.closest('#participantsList button[data-action]');
    if (participantAction) {
      const id = Number(participantAction.dataset.id);
      const name = participantAction.dataset.name || 'this user';
      if (!id) {
        return;
      }
      if (participantAction.dataset.action === 'promote-user') {
        promoteUser(id);
      }
      if (participantAction.dataset.action === 'reset-password') {
        resetPassword(id, name);
      }
      if (participantAction.dataset.action === 'delete-user') {
        deleteParticipant(id, name);
      }
      return;
    }

    const stockAction = event.target.closest('#stocksList button[data-action="edit-stock"]');
    if (stockAction) {
      const id = Number(stockAction.dataset.id);
      if (id) {
        openStockModal(id);
      }
      return;
    }

    const scenarioAction = event.target.closest('#scenariosList button[data-action="edit-scenario"]');
    if (scenarioAction) {
      const id = Number(scenarioAction.dataset.id);
      if (id) {
        openScenarioModal(id);
      }
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
      return;
    }
    document.querySelectorAll('.modal').forEach((modal) => {
      if (modal.style.display === 'flex') {
        closeModal(modal);
      }
    });
  });

  document.getElementById('addParticipantBtn')?.addEventListener('click', openParticipantModal);
  document.getElementById('addStockBtn')?.addEventListener('click', () => openStockModal());
  document.getElementById('addScenarioBtn')?.addEventListener('click', () => openScenarioModal());
  document.getElementById('participantSearch')?.addEventListener('input', renderParticipants);
  document.getElementById('stockSearch')?.addEventListener('input', renderStocks);
  document.getElementById('saveConfigBtn')?.addEventListener('click', saveConfig);

  document.getElementById('addParticipantForm')?.addEventListener('submit', submitParticipantForm);
  document.getElementById('addStockForm')?.addEventListener('submit', submitStockForm);
  document.getElementById('scenarioForm')?.addEventListener('submit', submitScenarioForm);
}

async function initManager() {
  try {
    clearManagerError();
    bindControls();
    updateWsStatus('ws-status', 'disconnected');

    const [config, user] = await Promise.all([
      fetchJson('/api/config.php'),
      requireUser({ managerOnly: true }),
    ]);
    if (!user) {
      return;
    }

    if (config.wsPublicUrl) {
      WebSocketManager.getInstance(user.institution_id, config.wsPublicUrl).onStatusChange((status) => {
        updateWsStatus('ws-status', status);
      });
    }

    await Promise.all([
      loadParticipants(),
      loadStocks(),
      loadConfig(),
      loadScenarios(),
    ]);
  } catch (error) {
    console.error('Failed to initialize manager view:', error);
    if (handleAuthError(error)) {
      return;
    }
    setManagerError(getErrorMessage(error, 'Failed to load admin data.'));
  }
}

async function loadParticipants() {
  try {
    const data = await fetchJson('/api/manager_participants.php');
    state.participants = data.participants || [];
    clearManagerError();
    renderParticipants();
  } catch (error) {
    console.error('Failed to load participants', error);
    if (handleAuthError(error)) {
      return;
    }
    setManagerError(getErrorMessage(error, 'Failed to load participants.'));
  }
}

function renderParticipants() {
  const list = document.getElementById('participantsList');
  if (!list) {
    return;
  }

  const query = (document.getElementById('participantSearch')?.value || '').trim().toLowerCase();
  const participants = !query
    ? state.participants
    : state.participants.filter((participant) => `${participant.username || ''} ${participant.email || ''} ${participant.role || ''}`.toLowerCase().includes(query));

  list.innerHTML = '';

  if (!participants.length) {
    list.innerHTML = '<p class="muted">No participants found.</p>';
    return;
  }

  participants.forEach((participant) => {
    const isManager = participant.role === 'manager' || participant.role === 'admin';
    const displayName = participant.username || participant.email || 'Participant';

    const row = document.createElement('div');
    row.className = 'participant-item';

    const info = document.createElement('div');
    info.className = 'stack';
    const title = document.createElement('div');
    title.className = 'stack';
    const name = document.createElement('strong');
    name.textContent = displayName;
    title.appendChild(name);
    if (isManager) {
      const badge = document.createElement('span');
      badge.className = 'badge badge-info';
      badge.textContent = participant.role === 'admin' ? 'Admin' : 'Manager';
      title.appendChild(badge);
    }
    info.appendChild(title);
    const meta = document.createElement('span');
    meta.className = 'subtext';
    meta.textContent = `${participant.email || 'No email'} - ${formatCurrency(participant.cash_balance || 0)} cash`;
    info.appendChild(meta);

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '0.5rem';
    actions.style.flexWrap = 'wrap';

    if (!isManager) {
      const promoteButton = document.createElement('button');
      promoteButton.type = 'button';
      promoteButton.className = 'btn btn-sm btn-outline';
      promoteButton.dataset.action = 'promote-user';
      promoteButton.dataset.id = participant.id;
      promoteButton.dataset.name = displayName;
      promoteButton.textContent = 'Promote';
      actions.appendChild(promoteButton);
    }

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'btn btn-sm btn-outline';
    resetButton.dataset.action = 'reset-password';
    resetButton.dataset.id = participant.id;
    resetButton.dataset.name = displayName;
    resetButton.textContent = 'Reset Password';
    actions.appendChild(resetButton);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'btn btn-sm btn-outline';
    deleteButton.dataset.action = 'delete-user';
    deleteButton.dataset.id = participant.id;
    deleteButton.dataset.name = displayName;
    deleteButton.textContent = 'Delete';
    actions.appendChild(deleteButton);

    row.append(info, actions);
    list.appendChild(row);
  });
}

async function resetPassword(id, name) {
  const password = prompt(`Enter a new password for ${name}:`);
  if (!password) {
    return;
  }

  try {
    const data = await fetchJson('/api/manager_password_reset.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: id, password }),
    });
    alert(data.message || 'Password updated successfully.');
  } catch (error) {
    console.error('Password reset failed', error);
    if (handleAuthError(error)) {
      return;
    }
    alert(getErrorMessage(error, 'Failed to reset password.'));
  }
}

async function promoteUser(id) {
  if (!confirm('Promote this user to manager access?')) {
    return;
  }

  try {
    await fetchJson('/api/manager_participants.php', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, role: 'manager' }),
    });
    alert('User promoted to manager.');
    await loadParticipants();
  } catch (error) {
    console.error('Failed to promote user', error);
    if (handleAuthError(error)) {
      return;
    }
    alert(getErrorMessage(error, 'Failed to promote user.'));
  }
}

async function deleteParticipant(id, name) {
  if (!confirm(`Delete ${name}? This also removes their sessions and portfolio history.`)) {
    return;
  }

  try {
    await fetchJson(`/api/manager_participants.php?id=${id}`, { method: 'DELETE' });
    alert('Participant deleted.');
    await loadParticipants();
  } catch (error) {
    console.error('Failed to delete participant', error);
    if (handleAuthError(error)) {
      return;
    }
    alert(getErrorMessage(error, 'Failed to delete participant.'));
  }
}

function openParticipantModal() {
  const form = document.getElementById('addParticipantForm');
  if (form) {
    form.reset();
  }
  setFormError('participantFormError', '');
  openModal('addParticipantModal', 'Add Participant');
}

async function submitParticipantForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());

  try {
    setFormError('participantFormError', '');
    setFormBusy(form, true);
    const data = await fetchJson('/api/manager_participants.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    closeModal(document.getElementById('addParticipantModal'));
    alert(`Participant created. Temporary password: ${data.temp_password}`);
    await loadParticipants();
  } catch (error) {
    console.error('Failed to create participant', error);
    if (handleAuthError(error)) {
      return;
    }
    setFormError('participantFormError', getErrorMessage(error, 'Failed to create participant.'));
  } finally {
    setFormBusy(form, false);
  }
}

async function loadStocks() {
  try {
    const data = await fetchJson('/api/manager_stocks.php');
    state.stocks = data.stocks || [];
    clearManagerError();
    renderStocks();
  } catch (error) {
    console.error('Failed to load stocks', error);
    if (handleAuthError(error)) {
      return;
    }
    setManagerError(getErrorMessage(error, 'Failed to load stocks.'));
  }
}

function renderStocks() {
  const list = document.getElementById('stocksList');
  if (!list) {
    return;
  }

  const query = (document.getElementById('stockSearch')?.value || '').trim().toLowerCase();
  const stocks = !query
    ? state.stocks
    : state.stocks.filter((stock) => `${stock.ticker || ''} ${stock.name || ''}`.toLowerCase().includes(query));

  list.innerHTML = '';

  if (!stocks.length) {
    list.innerHTML = '<p class="muted">No stocks found.</p>';
    return;
  }

  stocks.forEach((stock) => {
    const row = document.createElement('div');
    row.className = 'participant-item';
    row.innerHTML = `
      <div class="stack">
        <strong>${escapeHtml(stock.ticker)}</strong>
        <span class="subtext">${escapeHtml(stock.name)}</span>
        <span class="subtext">${formatCurrency(stock.current_price ?? stock.initial_price)}</span>
      </div>
      <div>
        <button class="btn btn-sm btn-outline" type="button" data-action="edit-stock" data-id="${stock.id}">Edit</button>
      </div>
    `;
    list.appendChild(row);
  });
}

function prepareStockForm(form, stockId) {
  form.reset();
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
  const isEdit = Boolean(stockId);

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
}

async function openStockModal(id = null) {
  const form = document.getElementById('addStockForm');
  if (!form) {
    return;
  }

  setFormError('stockFormError', '');
  prepareStockForm(form, id);
  openModal('addStockModal', id ? 'Edit Stock' : 'Add Stock');

  if (!id) {
    return;
  }

  try {
    setFormBusy(form, true);
    const data = await fetchJson(`/api/manager_stocks.php?id=${id}`);
    if (!data.stock) {
      throw new Error('Stock data missing from response.');
    }
    form.ticker.value = data.stock.ticker || '';
    form.name.value = data.stock.name || '';
    form.initial_price.value = data.stock.initial_price ?? '';
    if (form.price) {
      const currentPrice = data.stock.current_price ?? data.stock.initial_price ?? '';
      form.price.value = currentPrice;
      form.dataset.currentPrice = String(currentPrice);
    }
    form.total_limit.value = data.stock.total_limit ?? '';
    form.per_user_limit.value = data.stock.per_user_limit ?? '';
    form.per_user_short_limit.value = data.stock.per_user_short_limit ?? '';
  } catch (error) {
    console.error('Failed to load stock data', error);
    if (handleAuthError(error)) {
      return;
    }
    setFormError('stockFormError', getErrorMessage(error, 'Failed to load stock.'));
  } finally {
    setFormBusy(form, false);
  }
}

async function submitStockForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  const isEdit = Boolean(payload.id);
  const url = isEdit ? `/api/manager_stocks.php?id=${payload.id}` : '/api/manager_stocks.php';
  const method = isEdit ? 'PUT' : 'POST';

  ['total_limit', 'per_user_limit', 'per_user_short_limit'].forEach((field) => {
    if (payload[field] === '') {
      payload[field] = null;
    }
  });

  if (isEdit) {
    delete payload.initial_price;
    const originalPrice = Number(form.dataset.currentPrice);
    const nextPrice = payload.price === '' ? NaN : Number(payload.price);
    if (!Number.isFinite(nextPrice) || (Number.isFinite(originalPrice) && originalPrice === nextPrice)) {
      delete payload.price;
    }
  }

  try {
    setFormError('stockFormError', '');
    setFormBusy(form, true);
    await fetchJson(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    closeModal(document.getElementById('addStockModal'));
    alert(isEdit ? 'Stock updated.' : 'Stock created.');
    await loadStocks();
  } catch (error) {
    console.error('Failed to save stock', error);
    if (handleAuthError(error)) {
      return;
    }
    setFormError('stockFormError', getErrorMessage(error, 'Failed to save stock.'));
  } finally {
    setFormBusy(form, false);
  }
}

async function loadConfig() {
  shortDurationsLoaded = false;
  try {
    const data = await fetchJson('/api/manager_config.php');
    const durations = Array.isArray(data?.short_durations)
      ? data.short_durations
        .map((item) => Number(item?.duration_seconds))
        .filter((value) => Number.isFinite(value) && value > 0)
      : null;

    if (durations && durations.length === data.short_durations.length) {
      document.getElementById('shortDurations').value = durations.join(', ');
      shortDurationsLoaded = true;
    }
  } catch (error) {
    console.warn('Manager config load failed', error);
  }
}

async function saveConfig() {
  if (!shortDurationsLoaded) {
    alert('Configuration is still loading or unavailable. Please retry after the current values load.');
    return;
  }

  const raw = document.getElementById('shortDurations').value;
  const durations = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => /^\d+$/.test(value))
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value) && value > 0);

  try {
    await fetchJson('/api/manager_config.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ short_durations: durations }),
    });
    shortDurationsLoaded = true;
    alert('Configuration saved.');
  } catch (error) {
    if (handleAuthError(error)) {
      return;
    }
    alert(getErrorMessage(error, 'Failed to save configuration.'));
  }
}

async function loadScenarios() {
  try {
    const data = await fetchJson('/api/manager_scenarios.php');
    state.scenarios = data.scenarios || [];
    clearManagerError();
    renderScenarios();
  } catch (error) {
    console.error('Failed to load scenarios', error);
    if (handleAuthError(error)) {
      return;
    }
    setManagerError(getErrorMessage(error, 'Failed to load scenarios.'));
  }
}

function getStatusBadge(status) {
  if (status === 'published') {
    return 'success';
  }
  if (status === 'draft') {
    return 'warning';
  }
  return 'secondary';
}

function renderScenarios() {
  const list = document.getElementById('scenariosList');
  if (!list) {
    return;
  }

  list.innerHTML = '';
  if (!state.scenarios.length) {
    list.innerHTML = '<p class="muted">No scenarios available.</p>';
    return;
  }

  state.scenarios.forEach((scenario) => {
    const row = document.createElement('div');
    row.className = 'participant-item';
    row.innerHTML = `
      <div class="stack">
        <strong>${escapeHtml(scenario.title)}</strong>
        <span class="badge badge-${getStatusBadge(scenario.status)}">${scenario.status}</span>
        <span class="subtext">Starts ${scenario.starts_at ? formatDateTime(scenario.starts_at) : 'Immediately when published'}</span>
      </div>
      <div>
        <button class="btn btn-sm btn-outline" type="button" data-action="edit-scenario" data-id="${scenario.id}">Edit</button>
      </div>
    `;
    list.appendChild(row);
  });
}

async function openScenarioModal(id = null) {
  const form = document.getElementById('scenarioForm');
  if (!form) {
    return;
  }

  setFormError('scenarioFormError', '');
  form.reset();
  document.getElementById('scenarioId').value = id ? String(id) : '';
  openModal('scenarioModal', id ? 'Edit Scenario' : 'Add Scenario');

  if (!id) {
    return;
  }

  try {
    setFormBusy(form, true);
    const data = await fetchJson(`/api/manager_scenarios.php?id=${id}`);
    if (!data.scenario) {
      throw new Error('Scenario data missing from response.');
    }
    document.getElementById('scenarioTitle').value = data.scenario.title || '';
    document.getElementById('scenarioDesc').value = data.scenario.description || '';
    document.getElementById('scenarioStatus').value = data.scenario.status || 'draft';
    if (data.scenario.starts_at) {
      const localDate = new Date(`${data.scenario.starts_at}Z`);
      const localIso = new Date(localDate.getTime() - localDate.getTimezoneOffset() * 60000).toISOString();
      document.getElementById('scenarioStart').value = localIso.slice(0, 16);
    }
  } catch (error) {
    console.error('Failed to load scenario', error);
    if (handleAuthError(error)) {
      return;
    }
    setFormError('scenarioFormError', getErrorMessage(error, 'Failed to load scenario.'));
  } finally {
    setFormBusy(form, false);
  }
}

async function submitScenarioForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());

  if (payload.starts_at) {
    const localDate = new Date(payload.starts_at);
    const utcIso = localDate.toISOString();
    payload.starts_at = utcIso.slice(0, 19).replace('T', ' ');
  }

  const isEdit = Boolean(payload.id);
  const url = isEdit ? `/api/manager_scenarios.php?id=${payload.id}` : '/api/manager_scenarios.php';
  const method = isEdit ? 'PUT' : 'POST';

  try {
    setFormError('scenarioFormError', '');
    setFormBusy(form, true);
    await fetchJson(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    closeModal(document.getElementById('scenarioModal'));
    alert('Scenario saved.');
    await loadScenarios();
  } catch (error) {
    console.error('Failed to save scenario', error);
    if (handleAuthError(error)) {
      return;
    }
    setFormError('scenarioFormError', getErrorMessage(error, 'Failed to save scenario.'));
  } finally {
    setFormBusy(form, false);
  }
}

initManager();
