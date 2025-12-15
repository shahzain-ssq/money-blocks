import { showToast, openModal, toggleSection, formatCurrency, formatChange, pill } from './components.js';

const state = {
  config: null,
  user: null,
  stocks: [],
  portfolio: null,
  scenarios: [],
  managerData: { stocks: [], scenarios: [], participants: [], priceOptions: [] },
  ws: null,
  reconnectDelay: 1000,
};

function isManager() {
  return state.user && (state.user.role === 'manager' || state.user.role === 'admin');
}

async function loadConfig() {
  if (state.config) return state.config;
  const res = await fetch('/api/config.php');
  if (!res.ok) throw new Error('Config load failed');
  state.config = await res.json();
  return state.config;
}

function setConnectionStatus(connected) {
  const badge = document.getElementById('connectionBadge');
  badge.innerHTML = `<span class="status-dot ${connected ? 'online' : 'offline'}"></span>${connected ? 'Live' : 'Disconnected'}`;
}

function applyUser() {
  const userMenu = document.getElementById('userMenu');
  userMenu.textContent = `${state.user.username || state.user.email} (${state.user.role})`;
  if (state.user.role === 'manager' || state.user.role === 'admin') {
    document.getElementById('managerNav').style.display = 'block';
  }
}

function setupNav() {
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const route = link.dataset.route;
      window.location.hash = `#/${route}`;
    });
  });

  const overlay = document.querySelector('.sidebar-overlay');
  const sidebar = document.querySelector('.sidebar');
  const toggle = document.querySelector('.sidebar-toggle');
  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
  });
  overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
  });
}

function route() {
  const hash = window.location.hash || '#/portfolio';
  const page = hash.replace('#/', '') || 'portfolio';
  toggleSection(page);
  document.getElementById('pageTitle').textContent = document.querySelector(`[data-route="${page}"]`)?.textContent || 'Portal';
  if (page === 'live') renderLivePrices();
  if (page === 'trade') renderTrade();
  if (page === 'portfolio') renderPortfolio();
  if (page === 'shorts') renderShorts();
  if (page === 'scenarios') renderScenarios();
  if (page === 'manage-stocks') renderManageStocks();
  if (page === 'manage-scenarios') renderManagerScenarios();
  if (page === 'participants') renderParticipants();
  if (page === 'update-price') renderPriceUpdater();
}

async function init() {
  try {
    await loadConfig();
    const meRes = await fetch('/api/auth_me.php');
    const me = await meRes.json();
    if (!me.user) return (window.location = '/public/index.html');
    state.user = me.user;
    applyUser();
    setupNav();
    bindForms();
    await Promise.all([refreshStocks(), refreshPortfolio(), refreshScenarios()]);
    if (isManager()) {
      await refreshManagerData();
    }
    connectSocket();
    route();
    window.addEventListener('hashchange', route);
  } catch (err) {
    console.error(err);
    showToast('Unable to load portal', 'error');
  }
}

function findStock(id) {
  return state.stocks.find((s) => Number(s.id) === Number(id));
}

async function refreshStocks() {
  const res = await fetch('/api/stocks.php');
  const data = await res.json();
  state.stocks = data.stocks || [];
  renderLivePrices();
  renderTrade();
  renderShorts();
  renderManageStocks();
  renderPriceUpdater();
}

async function refreshPortfolio() {
  const res = await fetch('/api/portfolio.php');
  const data = await res.json();
  state.portfolio = data;
  renderPortfolio();
  renderShorts();
}

async function refreshScenarios() {
  const res = await fetch('/api/crisis.php');
  const data = await res.json();
  state.scenarios = data.scenarios || [];
  renderScenarios();
}

async function refreshManagerData() {
  if (!isManager()) return;
  await Promise.all([loadManagerStocks(), loadManagerScenarios(), loadParticipants()]);
}

function renderPortfolio() {
  if (!state.portfolio) return;
  const summary = document.getElementById('portfolioSummary');
  summary.innerHTML = '';
  const stats = [
    { label: 'Cash', value: formatCurrency(state.portfolio.portfolio.cash_balance || 0) },
    { label: 'Portfolio Value', value: formatCurrency(state.portfolio.totals?.portfolio_value || 0) },
    { label: 'Unrealized P/L', value: formatCurrency(state.portfolio.totals?.unrealized || 0) },
    { label: 'Realized P/L', value: formatCurrency(state.portfolio.totals?.realized || 0) },
  ];
  stats.forEach((s) => {
    const card = document.createElement('div');
    card.className = 'card stat';
    card.innerHTML = `<div class="muted">${s.label}</div><div class="value">${s.value}</div>`;
    summary.appendChild(card);
  });
  document.getElementById('portfolioValuation').textContent = `Last updated ${new Date().toLocaleTimeString()}`;

  const tbody = document.querySelector('#positionsTable tbody');
  tbody.innerHTML = '';
  (state.portfolio.positions || []).forEach((p) => {
    const tr = document.createElement('tr');
    const pl = Number(p.unrealized_pl || 0);
    tr.innerHTML = `
      <td>${p.ticker}</td>
      <td>${p.quantity}</td>
      <td>${formatCurrency(p.avg_price)}</td>
      <td>${formatCurrency(p.current_price || p.avg_price)}</td>
      <td class="${pl >= 0 ? 'positive' : 'negative'}">${formatCurrency(pl)}</td>
      <td>${formatCurrency(p.position_value)}</td>
      <td class="table-actions">
        <button class="btn ghost inline" data-action="buy" data-id="${p.stock_id}">Buy</button>
        <button class="btn secondary inline" data-action="sell" data-id="${p.stock_id}">Sell</button>
      </td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      document.getElementById('tradeSelect').value = id;
      window.location.hash = '#/trade';
      renderTrade();
      if (btn.dataset.action === 'buy') document.getElementById('buyQty').focus();
      if (btn.dataset.action === 'sell') document.getElementById('sellQty').focus();
    });
  });
}

function renderLivePrices() {
  const tbody = document.querySelector('#liveTable tbody');
  tbody.innerHTML = '';
  const q = document.getElementById('liveSearch').value?.toLowerCase() || '';
  const filtered = state.stocks.filter((s) => `${s.ticker} ${s.name}`.toLowerCase().includes(q));
  filtered.forEach((s) => {
    const change = Number(s.change || 0);
    const pct = Number(s.change_pct || 0);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${s.ticker}</td>
      <td>${s.name}</td>
      <td>${formatCurrency(s.current_price || s.initial_price)}</td>
      <td>${formatChange(change)} <span class="muted">(${pct.toFixed(2)}%)</span></td>
      <td class="muted">${s.updated_at ? new Date(s.updated_at).toLocaleTimeString() : '-'}</td>`;
    tr.addEventListener('click', () => openStockDetail(s));
    tbody.appendChild(tr);
  });
  if (!filtered.length) tbody.innerHTML = '<tr><td colspan="5" class="empty">No matches</td></tr>';
}

async function openStockDetail(stock) {
  const historyRes = await fetch(`/api/stock_history.php?stock_id=${stock.id}&limit=24`);
  const history = await historyRes.json();
  const bars = (history.prices || []).map((p) => `<span style="height:${Math.max(4, p.price)}px"></span>`).join('');
  openModal({
    title: `${stock.ticker} · ${formatCurrency(stock.current_price || stock.initial_price)}`,
    body: `
      <p class="muted">${stock.name}</p>
      <div class="sparkline">${bars}</div>
      <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
        <button class="btn inline" id="quickBuy">Trade</button>
      </div>
    `,
    confirmText: 'Close',
    cancelText: 'Dismiss',
  });
  setTimeout(() => {
    const btn = document.getElementById('quickBuy');
    if (btn) {
      btn.onclick = () => {
        window.location.hash = '#/trade';
        document.getElementById('tradeSelect').value = stock.id;
        renderTrade();
      };
    }
  }, 50);
}

function renderTrade() {
  const select = document.getElementById('tradeSelect');
  select.innerHTML = '<option value="">Select stock</option>' + state.stocks.map((s) => `<option value="${s.id}">${s.ticker} · ${s.name}</option>`).join('');
  const search = document.getElementById('tradeSearch');
  if (search.value) {
    const match = state.stocks.find((s) => s.ticker.toLowerCase() === search.value.toLowerCase());
    if (match) select.value = match.id;
  }
  const selected = findStock(select.value);
  const details = document.getElementById('tradeDetails');
  if (!selected) {
    details.textContent = 'Search for a stock to view details.';
    return;
  }
  const position = (state.portfolio?.positions || []).find((p) => Number(p.stock_id) === Number(selected.id));
  details.innerHTML = `
    <strong>${selected.ticker}</strong> ${selected.name} — Current ${formatCurrency(selected.current_price || selected.initial_price)}<br />
    Position: ${position ? `${position.quantity} @ ${formatCurrency(position.avg_price)}` : 'No holdings'}
  `;
}

function renderShorts() {
  const select = document.getElementById('shortSelect');
  select.innerHTML = '<option value="">Select stock</option>' + state.stocks.map((s) => `<option value="${s.id}">${s.ticker}</option>`).join('');
  const tbody = document.querySelector('#shortsTable tbody');
  tbody.innerHTML = '';
  (state.portfolio?.shorts || []).forEach((sh) => {
    const tr = document.createElement('tr');
    const pl = Number(sh.pl || 0);
    tr.innerHTML = `
      <td>${sh.ticker}</td>
      <td>${sh.quantity}</td>
      <td>${formatCurrency(sh.open_price)}</td>
      <td>${formatCurrency(sh.current_price || sh.open_price)}</td>
      <td class="${pl >= 0 ? 'positive' : 'negative'}">${formatCurrency(pl)}</td>
      <td>${sh.expires_at || '-'}</td>`;
    tbody.appendChild(tr);
  });
  if (!state.portfolio?.shorts?.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">No active shorts</td></tr>';
  }
}

function renderScenarios() {
  const list = document.getElementById('scenarioList');
  list.innerHTML = '';
  if (!state.scenarios.length) {
    list.innerHTML = '<div class="card">No crisis scenarios yet.</div>';
    return;
  }
  state.scenarios.forEach((sc) => {
    const card = document.createElement('div');
    card.className = 'card';
    const active = sc.starts_at && sc.ends_at ? isActive(sc.starts_at, sc.ends_at) : false;
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h3>${sc.title}</h3>
          <div class="muted">${sc.description || ''}</div>
        </div>
        ${pill(sc.status === 'published' ? 'Published' : 'Draft', sc.status)}
      </div>
      <div class="muted" style="margin-top:0.5rem;">${formatWindow(sc.starts_at, sc.ends_at)} ${active ? pill('Active', 'active') : ''}</div>
    `;
    list.appendChild(card);
  });
}

function formatWindow(start, end) {
  if (!start && !end) return 'Ongoing';
  return `${start || 'Now'} → ${end || 'Open-ended'}`;
}

function isActive(start, end) {
  const now = Date.now();
  return (start ? new Date(start).getTime() <= now : true) && (end ? new Date(end).getTime() >= now : true);
}

function bindForms() {
  document.getElementById('liveSearch').addEventListener('input', renderLivePrices);
  document.getElementById('tradeSelect').addEventListener('change', renderTrade);
  document.getElementById('tradeSearch').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const match = state.stocks.find((s) => s.ticker.toLowerCase().startsWith(term) || s.name.toLowerCase().includes(term));
    if (match) document.getElementById('tradeSelect').value = match.id;
    renderTrade();
  });
  document.getElementById('buyBtn').onclick = () => handleTrade('buy');
  document.getElementById('sellBtn').onclick = () => handleTrade('sell');
  document.getElementById('shortOpenBtn').onclick = openShort;
  document.getElementById('shortSearch').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const match = state.stocks.find((s) => s.ticker.toLowerCase().startsWith(term));
    if (match) document.getElementById('shortSelect').value = match.id;
  });
  const createStockBtn = document.getElementById('createStockBtn');
  if (createStockBtn) createStockBtn.onclick = createStock;
  const updatePriceBtn = document.getElementById('updatePriceBtn');
  if (updatePriceBtn) updatePriceBtn.onclick = updatePrice;
  const priceSearch = document.getElementById('priceSearch');
  if (priceSearch) priceSearch.addEventListener('input', handlePriceSearch);
  const priceSelect = document.getElementById('priceSelect');
  if (priceSelect) priceSelect.addEventListener('change', (e) => showPriceDetails(e.target.value));
  const createScenarioBtn = document.getElementById('createScenarioBtn');
  if (createScenarioBtn) createScenarioBtn.onclick = createScenario;
  const participantSearch = document.getElementById('participantSearch');
  if (participantSearch) participantSearch.addEventListener('input', (e) => loadParticipants(e.target.value));
  const createParticipantBtn = document.getElementById('createParticipantBtn');
  if (createParticipantBtn) createParticipantBtn.onclick = createParticipant;
  document.getElementById('logoutBtn').onclick = async () => {
    await fetch('/api/auth_login.php', { method: 'DELETE' });
    window.location = '/public/index.html';
  };
}

async function handleTrade(type) {
  const select = document.getElementById('tradeSelect');
  const qtyInput = type === 'buy' ? document.getElementById('buyQty') : document.getElementById('sellQty');
  const qty = Number(qtyInput.value);
  if (!select.value || qty <= 0) return showToast('Select a stock and enter quantity', 'error');
  const endpoint = type === 'buy' ? '/api/trades_buy.php' : '/api/trades_sell.php';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stock_id: Number(select.value), quantity: qty }),
  });
  const data = await res.json();
  if (data.error) return showToast(data.error, 'error');
  showToast(data.message || 'Trade placed');
  qtyInput.value = '';
  await Promise.all([refreshPortfolio(), refreshStocks()]);
}

async function openShort() {
  const stockId = Number(document.getElementById('shortSelect').value);
  const qty = Number(document.getElementById('shortQty').value);
  const duration = Number(document.getElementById('shortDuration').value);
  if (!stockId || !qty || !duration) return showToast('Pick a stock, quantity, and duration', 'error');
  const res = await fetch('/api/trades_short_open.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stock_id: stockId, quantity: qty, duration_seconds: duration }),
  });
  const data = await res.json();
  if (data.error) return showToast(data.error, 'error');
  showToast('Short opened');
  document.getElementById('shortQty').value = '';
  await refreshPortfolio();
}

function connectSocket() {
  if (!state.config?.wsPublicUrl) return;
  const url = new URL(state.config.wsPublicUrl);
  url.searchParams.set('institution_id', state.user.institution_id);
  state.ws = new WebSocket(url.toString());
  state.ws.onopen = () => {
    setConnectionStatus(true);
    state.reconnectDelay = 1000;
  };
  state.ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'price_update') {
      const stock = findStock(msg.stock_id);
      if (stock) {
        stock.previous_price = stock.current_price;
        stock.current_price = msg.price;
        stock.updated_at = new Date().toISOString();
      }
      renderLivePrices();
      renderTrade();
      refreshPortfolio();
    }
    if (msg.type === 'crisis_published') {
      showToast(`Scenario published: ${msg.title}`);
      refreshScenarios();
    }
  };
  state.ws.onclose = () => {
    setConnectionStatus(false);
    setTimeout(connectSocket, state.reconnectDelay);
    state.reconnectDelay = Math.min(10000, state.reconnectDelay * 2);
  };
}

async function loadManagerStocks() {
  if (!isManager()) return;
  const res = await fetch('/api/manager_stocks.php');
  const data = await res.json();
  state.managerData.stocks = data.stocks || [];
  renderManageStocks();
  renderPriceUpdater();
}

async function createStock() {
  const ticker = document.getElementById('newTicker').value.trim();
  const name = document.getElementById('newName').value.trim();
  const price = Number(document.getElementById('newPrice').value);
  if (!ticker || !name || price <= 0) return showToast('Provide ticker, name, and price', 'error');
  const res = await fetch('/api/manager_stocks.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticker, name, initial_price: price }),
  });
  const data = await res.json();
  if (data.error) return showToast(data.error, 'error');
  showToast('Stock created');
  document.getElementById('newTicker').value = '';
  document.getElementById('newName').value = '';
  document.getElementById('newPrice').value = '';
  await Promise.all([refreshStocks(), loadManagerStocks()]);
}

function confirmDeleteStock(id, ticker) {
  openModal({
    title: `Delete ${ticker}?`,
    body: `<p>This will deactivate ${ticker} for trading.</p>`,
    confirmText: 'Delete',
    onConfirm: async () => {
      const res = await fetch(`/api/manager_stocks.php?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.error) return showToast(data.error, 'error');
      showToast('Stock removed');
      await Promise.all([refreshStocks(), loadManagerStocks()]);
    },
  });
}

let priceSearchTimer;
async function handlePriceSearch(e) {
  const term = e.target.value.trim();
  clearTimeout(priceSearchTimer);
  priceSearchTimer = setTimeout(async () => {
    if (!term) {
      state.managerData.priceOptions = [];
      renderPriceUpdater();
      return;
    }
    const res = await fetch(`/api/manager_stocks_search.php?q=${encodeURIComponent(term)}`);
    const data = await res.json();
    state.managerData.priceOptions = data.stocks || [];
    renderPriceUpdater();
  }, 200);
}

async function showPriceDetails(id) {
  if (!id) {
    document.getElementById('priceDetails').textContent = '';
    return;
  }
  const res = await fetch(`/api/manager_price.php?stock_id=${id}`);
  const data = await res.json();
  if (data.error) return showToast(data.error, 'error');
  const stock = data.stock;
  document.getElementById('priceDetails').textContent = `${stock.ticker} ${stock.name} — Current ${formatCurrency(stock.current_price || 0)}`;
}

async function updatePrice() {
  const stockId = Number(document.getElementById('priceSelect').value);
  const price = Number(document.getElementById('newPriceValue').value);
  if (!stockId || price <= 0) return showToast('Choose a stock and a valid price', 'error');
  const res = await fetch('/api/manager_price.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stock_id: stockId, price }),
  });
  const data = await res.json();
  if (data.error) return showToast(data.error, 'error');
  showToast('Price updated');
  document.getElementById('newPriceValue').value = '';
  await Promise.all([refreshStocks(), loadManagerStocks()]);
}

async function loadManagerScenarios() {
  if (!isManager()) return;
  const res = await fetch('/api/manager_crisis.php');
  const data = await res.json();
  state.managerData.scenarios = data.scenarios || [];
  renderManagerScenarios();
}

async function createScenario() {
  const payload = {
    title: document.getElementById('scenarioTitle').value.trim(),
    description: document.getElementById('scenarioDescription').value.trim(),
    status: document.getElementById('scenarioStatus').value,
    starts_at: document.getElementById('scenarioStart').value || null,
    ends_at: document.getElementById('scenarioEnd').value || null,
  };
  if (!payload.title) return showToast('Scenario title required', 'error');
  const res = await fetch('/api/manager_crisis.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (data.error) return showToast(data.error, 'error');
  showToast('Scenario saved');
  await Promise.all([loadManagerScenarios(), refreshScenarios()]);
}

async function toggleScenarioStatus(scenario) {
  const next = scenario.status === 'published' ? 'draft' : 'published';
  const res = await fetch(`/api/manager_crisis.php?id=${scenario.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: next,
      title: scenario.title,
      description: scenario.description,
      starts_at: scenario.starts_at,
      ends_at: scenario.ends_at,
    }),
  });
  const data = await res.json();
  if (data.error) return showToast(data.error, 'error');
  await Promise.all([loadManagerScenarios(), refreshScenarios()]);
}

function confirmDeleteScenario(id, title) {
  openModal({
    title: `Delete ${title}?`,
    body: `<p>Are you sure you want to delete ${title}? This cannot be undone.</p>`,
    confirmText: 'Delete',
    onConfirm: async () => {
      const res = await fetch(`/api/manager_crisis.php?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.error) return showToast(data.error, 'error');
      showToast('Scenario deleted');
      await Promise.all([loadManagerScenarios(), refreshScenarios()]);
    },
  });
}

async function loadParticipants(query = '') {
  if (!isManager()) return;
  const res = await fetch(`/api/manager_participants.php${query ? `?q=${encodeURIComponent(query)}` : ''}`);
  const data = await res.json();
  state.managerData.participants = data.participants || [];
  renderParticipants();
}

async function createParticipant() {
  const username = document.getElementById('participantUsername').value.trim();
  const email = document.getElementById('participantEmail').value.trim();
  if (!username && !email) return showToast('Enter a username or email', 'error');
  const res = await fetch('/api/manager_participants.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email }),
  });
  const data = await res.json();
  if (data.error) return showToast(data.error, 'error');
  showToast(`Participant created. Temp password: ${data.temp_password}`);
  document.getElementById('participantUsername').value = '';
  document.getElementById('participantEmail').value = '';
  await loadParticipants();
}

function confirmDeleteParticipant(id, label) {
  openModal({
    title: `Remove ${label}?`,
    body: `<p>Delete ${label}? This will remove their portfolio data.</p>`,
    confirmText: 'Delete',
    onConfirm: async () => {
      const res = await fetch(`/api/manager_participants.php?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.error) return showToast(data.error, 'error');
      showToast('Participant removed');
      await loadParticipants();
    },
  });
}

function renderManageStocks() {
  const tbody = document.querySelector('#manageStocksTable tbody');
  tbody.innerHTML = '';
  const stocks = state.managerData.stocks.length ? state.managerData.stocks : state.stocks;
  stocks.forEach((s) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${s.ticker}</td><td>${s.name}</td><td>${formatCurrency(s.current_price || s.initial_price)}</td><td><button class="btn ghost inline" data-id="${s.id}">Delete</button></td>`;
    tr.querySelector('button').onclick = () => confirmDeleteStock(s.id, s.ticker);
    tbody.appendChild(tr);
  });
  if (!stocks.length) tbody.innerHTML = '<tr><td colspan="4" class="empty">No stocks yet</td></tr>';
}

function renderPriceUpdater() {
  const select = document.getElementById('priceSelect');
  if (!select) return;
  const options = (state.managerData.priceOptions && state.managerData.priceOptions.length)
    ? state.managerData.priceOptions
    : state.stocks;
  select.innerHTML = '<option value="">Select stock</option>' + options.map((s) => `<option value="${s.id}">${s.ticker} · ${formatCurrency(s.current_price || s.initial_price)}</option>`).join('');
}

function renderManagerScenarios() {
  const tbody = document.querySelector('#scenarioTable tbody');
  tbody.innerHTML = '';
  (state.managerData.scenarios || []).forEach((sc) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${sc.title}</td>
      <td>${pill(sc.status, sc.status)}</td>
      <td>${formatWindow(sc.starts_at, sc.ends_at)}</td>
      <td><div class="table-actions"><button class="btn ghost inline" data-action="status">Toggle</button><button class="btn danger inline" data-action="delete">Delete</button></div></td>
    `;
    const buttons = tr.querySelectorAll('button');
    buttons[0].onclick = () => toggleScenarioStatus(sc);
    buttons[1].onclick = () => confirmDeleteScenario(sc.id, sc.title);
    tbody.appendChild(tr);
  });
  if (!state.managerData.scenarios.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">No scenarios yet</td></tr>';
  }
}

function renderParticipants() {
  const tbody = document.querySelector('#participantsTable tbody');
  tbody.innerHTML = '';
  (state.managerData.participants || []).forEach((p) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${p.username || '-'}</td><td>${p.email}</td><td>${formatCurrency(p.cash_balance || 0)}</td><td><button class="btn ghost inline">Delete</button></td>`;
    tr.querySelector('button').onclick = () => confirmDeleteParticipant(p.id, p.username || p.email);
    tbody.appendChild(tr);
  });
  if (!state.managerData.participants.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">No participants yet</td></tr>';
  }
}

init();
