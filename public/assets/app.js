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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let portfolioRefreshTimer;
function debouncePortfolioRefresh(callback, delay = 300) {
  clearTimeout(portfolioRefreshTimer);
  portfolioRefreshTimer = setTimeout(callback, delay);
}

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
  const setOverlayVisible = (open) => {
    sidebar.classList.toggle('open', open);
    overlay.classList.toggle('show', open);
    overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
  };
  toggle.addEventListener('click', () => {
    const open = !sidebar.classList.contains('open');
    setOverlayVisible(open);
  });
  overlay.addEventListener('click', () => {
    setOverlayVisible(false);
  });
}

function route() {
  const hash = window.location.hash || '#/portfolio';
  const page = hash.replace('#/', '') || 'portfolio';
  const managerRoutes = ['manage-stocks', 'manage-scenarios', 'participants', 'update-price'];
  if (managerRoutes.includes(page) && !isManager()) {
    window.location.hash = '#/portfolio';
    return;
  }
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
    if (!me.user) {
      window.location = '/index.html';
      return;
    }
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
  if (!res.ok) {
    showToast('Failed to load stocks', 'error');
    return;
  }
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
  if (!res.ok) {
    showToast('Failed to load portfolio', 'error');
    return;
  }
  const data = await res.json();
  state.portfolio = data;
  renderPortfolio();
  renderShorts();
}

async function refreshScenarios() {
  const res = await fetch('/api/crisis.php');
  if (!res.ok) {
    showToast('Failed to load scenarios', 'error');
    return;
  }
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
    const label = document.createElement('div');
    label.className = 'muted';
    label.textContent = s.label;
    const val = document.createElement('div');
    val.className = 'value';
    val.textContent = s.value;
    card.append(label, val);
    summary.appendChild(card);
  });
  document.getElementById('portfolioValuation').textContent = `Last updated ${new Date().toLocaleTimeString()}`;

  const tbody = document.querySelector('#positionsTable tbody');
  tbody.innerHTML = '';
  (state.portfolio.positions || []).forEach((p) => {
    const tr = document.createElement('tr');
    const pl = Number(p.unrealized_pl || 0);
    const cells = [
      escapeHtml(p.ticker),
      Number(p.quantity ?? 0),
      formatCurrency(p.avg_price),
      formatCurrency(p.current_price || p.avg_price),
      formatCurrency(pl),
      formatCurrency(p.position_value),
    ];
    cells.forEach((val, idx) => {
      const td = document.createElement('td');
      if (idx === 4) td.className = pl >= 0 ? 'positive' : 'negative';
      td.textContent = typeof val === 'number' ? val : String(val);
      tr.appendChild(td);
    });
    const actions = document.createElement('td');
    actions.className = 'table-actions';
    const buyBtn = document.createElement('button');
    buyBtn.className = 'btn ghost inline';
    buyBtn.textContent = 'Buy';
    buyBtn.dataset.action = 'buy';
    buyBtn.dataset.id = p.stock_id;
    const sellBtn = document.createElement('button');
    sellBtn.className = 'btn secondary inline';
    sellBtn.textContent = 'Sell';
    sellBtn.dataset.action = 'sell';
    sellBtn.dataset.id = p.stock_id;
    actions.append(buyBtn, sellBtn);
    tr.appendChild(actions);
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
    const tds = [
      escapeHtml(s.ticker),
      escapeHtml(s.name),
      formatCurrency(s.current_price || s.initial_price),
      `${formatChange(change)} <span class="muted">(${pct.toFixed(2)}%)</span>`,
      escapeHtml(s.updated_at ? new Date(s.updated_at).toLocaleTimeString() : '-'),
    ];
    tds.forEach((val, idx) => {
      const td = document.createElement('td');
      if (idx === 3) {
        td.innerHTML = val;
      } else {
        td.textContent = String(val);
        if (idx === 4) td.className = 'muted';
      }
      tr.appendChild(td);
    });
    tr.addEventListener('click', () => openStockDetail(s));
    tbody.appendChild(tr);
  });
  if (!filtered.length) tbody.innerHTML = '<tr><td colspan="5" class="empty">No matches</td></tr>';
}

async function openStockDetail(stock) {
  const historyRes = await fetch(`/api/stock_history.php?stock_id=${stock.id}&limit=24`);
  const history = await historyRes.json();
  const prices = (history.prices || []).map((p) => p.price);
  const minP = Math.min(...prices, 0);
  const maxP = Math.max(...prices, 1);
  const range = maxP - minP || 1;
  const bars = prices.map((price) => {
    const height = Math.max(4, ((price - minP) / range) * 60);
    return `<span style="height:${height}px"></span>`;
  }).join('');
  openModal({
    title: `${escapeHtml(stock.ticker)} · ${formatCurrency(stock.current_price || stock.initial_price)}`,
    body: `
      <p class="muted">${escapeHtml(stock.name)}</p>
      <div class="sparkline">${bars}</div>
      <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
        <button class="btn inline" id="quickBuy">Trade</button>
      </div>
    `,
    confirmText: 'Close',
    cancelText: 'Dismiss',
  });
  const btn = document.getElementById('quickBuy');
  if (btn) {
    btn.onclick = () => {
      window.location.hash = '#/trade';
      document.getElementById('tradeSelect').value = stock.id;
      renderTrade();
    };
  }
}

function renderTrade() {
  const select = document.getElementById('tradeSelect');
  select.innerHTML = '';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = 'Select stock';
  select.appendChild(defaultOpt);
  state.stocks.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.ticker} · ${s.name}`;
    select.appendChild(opt);
  });
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
  const info = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = selected.ticker;
  const nameSpan = document.createElement('span');
  nameSpan.textContent = ` ${selected.name} — Current ${formatCurrency(selected.current_price || selected.initial_price)}`;
  const positionLine = document.createElement('div');
  positionLine.textContent = `Position: ${position ? `${position.quantity} @ ${formatCurrency(position.avg_price)}` : 'No holdings'}`;
  info.append(title, nameSpan, document.createElement('br'), positionLine);
  details.innerHTML = '';
  details.appendChild(info);
}

function renderShorts() {
  const select = document.getElementById('shortSelect');
  select.innerHTML = '';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = 'Select stock';
  select.appendChild(defaultOpt);
  state.stocks.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.ticker;
    select.appendChild(opt);
  });
  const tbody = document.querySelector('#shortsTable tbody');
  tbody.innerHTML = '';
  (state.portfolio?.shorts || []).forEach((sh) => {
    const tr = document.createElement('tr');
    const pl = Number(sh.pl || 0);
    const cells = [
      escapeHtml(sh.ticker),
      Number(sh.quantity ?? 0),
      formatCurrency(sh.open_price),
      formatCurrency(sh.current_price || sh.open_price),
      formatCurrency(pl),
      escapeHtml(sh.expires_at || '-'),
    ];
    cells.forEach((val, idx) => {
      const td = document.createElement('td');
      if (idx === 4) td.className = pl >= 0 ? 'positive' : 'negative';
      td.textContent = typeof val === 'number' ? val : String(val);
      tr.appendChild(td);
    });
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
    const top = document.createElement('div');
    top.style.display = 'flex';
    top.style.justifyContent = 'space-between';
    top.style.alignItems = 'center';
    const left = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = sc.title;
    const desc = document.createElement('div');
    desc.className = 'muted';
    desc.textContent = sc.description || '';
    left.append(title, desc);
    const badge = pill(sc.status === 'published' ? 'Published' : 'Draft', sc.status);
    top.append(left, badge);
    const windowInfo = document.createElement('div');
    windowInfo.className = 'muted';
    windowInfo.style.marginTop = '0.5rem';
    const windowText = document.createElement('span');
    windowText.textContent = formatWindow(sc.starts_at, sc.ends_at);
    windowInfo.innerHTML = '';
    windowInfo.appendChild(windowText);
    if (active) {
      const activeBadge = pill('Active', 'active');
      activeBadge.style.marginLeft = '0.5rem';
      windowInfo.appendChild(activeBadge);
    }
    card.append(top, windowInfo);
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
    window.location = '/index.html';
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
  if (!state.user?.institution_id) {
    console.warn('No institution_id, skipping WebSocket connection');
    return;
  }
  const url = new URL(state.config.wsPublicUrl);
  url.searchParams.set('institution_id', state.user.institution_id);
  state.ws = new WebSocket(url.toString());
  state.ws.onopen = () => {
    setConnectionStatus(true);
    state.reconnectDelay = 1000;
  };
  state.ws.onmessage = (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch (err) {
      console.warn('Bad WS message', err);
      return;
    }
    if (msg.type === 'price_update') {
      const stock = findStock(msg.stock_id);
      if (stock) {
        stock.previous_price = stock.current_price;
        stock.current_price = msg.price;
        stock.updated_at = new Date().toISOString();
      }
      renderLivePrices();
      renderTrade();
      debouncePortfolioRefresh(refreshPortfolio);
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
    title: `Delete ${escapeHtml(ticker)}?`,
    body: `<p>This will deactivate ${escapeHtml(ticker)} for trading.</p>`,
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
    title: `Delete ${escapeHtml(title)}?`,
    body: `<p>Are you sure you want to delete ${escapeHtml(title)}? This cannot be undone.</p>`,
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
  const modal = openModal({
    title: 'Participant created',
    body: `
      <p>Share this temporary password securely. It will not be shown again.</p>
      <div class="card" style="margin:0.5rem 0;">${escapeHtml(data.temp_password)}</div>
      <button class="btn inline" id="copyTempPassword">Copy password</button>
    `,
    confirmText: 'Close',
    cancelText: 'Dismiss',
    dismissible: false,
  });
  const copyBtn = modal?.querySelector('#copyTempPassword');
  if (copyBtn) {
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(data.temp_password);
        showToast('Copied to clipboard');
      } catch (err) {
        showToast('Copy failed', 'error');
      }
    };
  }
  document.getElementById('participantUsername').value = '';
  document.getElementById('participantEmail').value = '';
  await loadParticipants();
}

function confirmDeleteParticipant(id, label) {
  openModal({
    title: `Remove ${escapeHtml(label)}?`,
    body: `<p>Delete ${escapeHtml(label)}? This will remove their portfolio data.</p>`,
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
    const ticker = document.createElement('td');
    ticker.textContent = s.ticker;
    const name = document.createElement('td');
    name.textContent = s.name;
    const price = document.createElement('td');
    price.textContent = formatCurrency(s.current_price || s.initial_price);
    const actionTd = document.createElement('td');
    const btn = document.createElement('button');
    btn.className = 'btn ghost inline';
    btn.textContent = 'Delete';
    btn.onclick = () => confirmDeleteStock(s.id, s.ticker);
    actionTd.appendChild(btn);
    tr.append(ticker, name, price, actionTd);
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
  select.innerHTML = '';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = 'Select stock';
  select.appendChild(defaultOpt);
  options.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.ticker} · ${formatCurrency(s.current_price || s.initial_price)}`;
    select.appendChild(opt);
  });
}

function renderManagerScenarios() {
  const tbody = document.querySelector('#scenarioTable tbody');
  tbody.innerHTML = '';
  (state.managerData.scenarios || []).forEach((sc) => {
    const tr = document.createElement('tr');
    const title = document.createElement('td');
    title.textContent = sc.title;
    const status = document.createElement('td');
    status.appendChild(pill(sc.status, sc.status));
    const windowTd = document.createElement('td');
    windowTd.textContent = formatWindow(sc.starts_at, sc.ends_at);
    const actionTd = document.createElement('td');
    const wrapper = document.createElement('div');
    wrapper.className = 'table-actions';
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn ghost inline';
    toggleBtn.textContent = 'Toggle';
    toggleBtn.onclick = () => toggleScenarioStatus(sc);
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn danger inline';
    deleteBtn.textContent = 'Delete';
    deleteBtn.onclick = () => confirmDeleteScenario(sc.id, sc.title);
    wrapper.append(toggleBtn, deleteBtn);
    actionTd.appendChild(wrapper);
    tr.append(title, status, windowTd, actionTd);
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
    const username = document.createElement('td');
    username.textContent = p.username || '-';
    const email = document.createElement('td');
    email.textContent = p.email;
    const cash = document.createElement('td');
    cash.textContent = formatCurrency(p.cash_balance || 0);
    const action = document.createElement('td');
    const btn = document.createElement('button');
    btn.className = 'btn ghost inline';
    btn.textContent = 'Delete';
    btn.onclick = () => confirmDeleteParticipant(p.id, p.username || p.email);
    action.appendChild(btn);
    tr.append(username, email, cash, action);
    tbody.appendChild(tr);
  });
  if (!state.managerData.participants.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">No participants yet</td></tr>';
  }
}

init();
