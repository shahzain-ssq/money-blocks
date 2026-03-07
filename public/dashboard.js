import { WebSocketManager } from './js/ws-manager.js';
import { fetchJson, getErrorMessage } from './js/api.js';
import {
  createEmptyState,
  escapeHtml,
  formatCurrency,
  formatDateTime,
  formatPercent,
  formatQuantity,
  renderMetricCards,
  requireUser,
  updateWsStatus,
} from './js/ui.js';

let configPromise;
let debounceTimer;
let wsInitialized = false;
let lastInitTime = 0;
let pendingInit = false;
const INIT_THROTTLE_MS = 300;

function debouncedInit() {
  const now = Date.now();
  const elapsed = now - lastInitTime;

  if (elapsed >= INIT_THROTTLE_MS && !pendingInit) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    lastInitTime = now;
    init();
    return;
  }

  if (pendingInit) {
    return;
  }

  pendingInit = true;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    pendingInit = false;
    lastInitTime = Date.now();
    init();
  }, Math.max(INIT_THROTTLE_MS - elapsed, 0));
}

async function loadConfig() {
  if (!configPromise) {
    configPromise = fetchJson('/api/config.php');
  }
  return configPromise;
}

function setDashboardError(message) {
  const el = document.getElementById('dashboardError');
  if (!el) {
    return;
  }
  el.textContent = message;
  el.style.display = message ? 'block' : 'none';
}

function clearDashboardError() {
  setDashboardError('');
}

function createChangePill(change, changePct) {
  const pill = document.createElement('span');
  const className = change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral';
  pill.className = `pill-change ${className}`;
  pill.textContent = `${change > 0 ? '+' : ''}${formatCurrency(change)} (${formatPercent(changePct)})`;
  return pill;
}

function createTradeButton(stock, action, label, tone = 'outline') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = tone === 'primary' ? 'btn btn-sm' : 'btn btn-sm btn-outline';
  button.textContent = label;
  button.addEventListener('click', () => {
    window.location = `/trade?ticker=${encodeURIComponent(stock.ticker)}&action=${action}`;
  });
  return button;
}

function renderMetrics(portfolio, scenarios) {
  renderMetricCards(document.getElementById('dashboardMetrics'), [
    {
      label: 'Portfolio Equity',
      value: formatCurrency(portfolio.totals?.portfolio_value),
      helper: 'Cash plus current marked-to-market portfolio value.',
    },
    {
      label: 'Net Exposure',
      value: formatCurrency(portfolio.totals?.net_exposure),
      helper: `${formatCurrency(portfolio.totals?.long_value)} long / ${formatCurrency(portfolio.totals?.short_exposure)} short`,
    },
    {
      label: 'Unrealized P/L',
      value: formatCurrency(portfolio.totals?.unrealized),
      tone: Number(portfolio.totals?.unrealized || 0) >= 0 ? 'positive' : 'negative',
      helper: 'Open position and short mark-to-market result.',
    },
    {
      label: 'Live Scenarios',
      value: formatQuantity(scenarios.length),
      helper: `${formatQuantity(scenarios.filter((scenario) => Number(scenario.is_read) === 0).length)} unread`,
    },
  ]);
}

function renderPositions(portfolio) {
  const tbody = document.querySelector('#positions tbody');
  if (!tbody) {
    return;
  }

  tbody.innerHTML = '';
  const positions = portfolio.positions || [];
  if (positions.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.appendChild(createEmptyState('No positions yet.', 'Buy from the market overview or open a trade ticket to get started.'));
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  positions.forEach((position) => {
    const row = document.createElement('tr');
    const currentPrice = Number(position.current_price ?? position.avg_price ?? 0);
    const unrealized = Number(position.unrealized_pl ?? 0);

    const instrumentCell = document.createElement('td');
    instrumentCell.innerHTML = `
      <div class="stack">
        <strong>${escapeHtml(position.ticker)}</strong>
        <span class="subtext">${escapeHtml(position.name ?? 'Instrument')}</span>
      </div>
    `;

    const quantityCell = document.createElement('td');
    quantityCell.className = 'numeric';
    quantityCell.textContent = formatQuantity(position.quantity);

    const avgCell = document.createElement('td');
    avgCell.className = 'numeric';
    avgCell.textContent = formatCurrency(position.avg_price);

    const currentCell = document.createElement('td');
    currentCell.className = 'numeric';
    currentCell.textContent = formatCurrency(currentPrice);

    const valueCell = document.createElement('td');
    valueCell.className = 'numeric';
    valueCell.textContent = formatCurrency(position.position_value);

    const plCell = document.createElement('td');
    plCell.className = `numeric ${unrealized >= 0 ? 'positive' : 'negative'}`;
    plCell.textContent = formatCurrency(unrealized);

    const actionCell = document.createElement('td');
    actionCell.className = 'action-cell';
    actionCell.appendChild(createTradeButton(position, 'sell', 'Sell', 'outline'));

    row.append(instrumentCell, quantityCell, avgCell, currentCell, valueCell, plCell, actionCell);
    tbody.appendChild(row);
  });
}

function renderShorts(portfolio) {
  const tbody = document.querySelector('#shorts tbody');
  if (!tbody) {
    return;
  }

  tbody.innerHTML = '';
  const shorts = portfolio.shorts || [];
  if (shorts.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.appendChild(createEmptyState('No active shorts.', 'Switch the trade ticket into short mode when you want to hedge or simulate a bearish view.'));
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  shorts.forEach((shortPosition) => {
    const row = document.createElement('tr');
    const currentPrice = Number(shortPosition.current_price ?? shortPosition.open_price ?? 0);
    const profit = Number(shortPosition.pl ?? 0);

    const instrumentCell = document.createElement('td');
    instrumentCell.innerHTML = `
      <div class="stack">
        <strong>${escapeHtml(shortPosition.ticker)}</strong>
        <span class="subtext">Opened ${formatDateTime(shortPosition.open_at)}</span>
      </div>
    `;

    const quantityCell = document.createElement('td');
    quantityCell.className = 'numeric';
    quantityCell.textContent = formatQuantity(shortPosition.quantity);

    const openCell = document.createElement('td');
    openCell.className = 'numeric';
    openCell.textContent = formatCurrency(shortPosition.open_price);

    const currentCell = document.createElement('td');
    currentCell.className = 'numeric';
    currentCell.textContent = formatCurrency(currentPrice);

    const plCell = document.createElement('td');
    plCell.className = `numeric ${profit >= 0 ? 'positive' : 'negative'}`;
    plCell.textContent = formatCurrency(profit);

    const expiryCell = document.createElement('td');
    expiryCell.textContent = formatDateTime(shortPosition.expires_at);

    row.append(instrumentCell, quantityCell, openCell, currentCell, plCell, expiryCell);
    tbody.appendChild(row);
  });
}

function renderStocks(stocks) {
  const stocksEl = document.getElementById('stocks');
  if (!stocksEl) {
    return;
  }

  stocksEl.innerHTML = '';
  if (!stocks.length) {
    stocksEl.appendChild(createEmptyState('No active stocks available.', 'Ask an administrator to add and price at least one trading instrument.'));
    return;
  }

  stocks.forEach((stock) => {
    const card = document.createElement('article');
    card.className = 'card stock-card';

    const header = document.createElement('div');
    header.className = 'stock-card-header';
    header.innerHTML = `
      <div class="stack">
        <strong>${escapeHtml(stock.ticker)}</strong>
        <span class="subtext">${escapeHtml(stock.name)}</span>
      </div>
    `;
    header.appendChild(createChangePill(Number(stock.change || 0), Number(stock.change_pct || 0)));

    const price = document.createElement('div');
    price.className = 'stack';
    price.innerHTML = `
      <strong>${formatCurrency(stock.current_price ?? stock.initial_price)}</strong>
      <span class="subtext">${stock.updated_at ? `Updated ${formatDateTime(stock.updated_at)}` : 'Awaiting fresh price update'}</span>
    `;

    const footer = document.createElement('div');
    footer.className = 'stock-card-footer';
    footer.append(
      createTradeButton(stock, 'buy', 'Buy', 'primary'),
      createTradeButton(stock, 'sell', 'Sell', 'outline'),
    );

    card.append(header, price, footer);
    stocksEl.appendChild(card);
  });
}

function renderScenarios(scenarios) {
  const scenariosEl = document.getElementById('scenarios');
  if (!scenariosEl) {
    return;
  }

  scenariosEl.innerHTML = '';
  if (!scenarios.length) {
    scenariosEl.appendChild(createEmptyState('No live scenarios.', 'Published scenarios will appear here as soon as managers release them.'));
    return;
  }

  scenarios.forEach((scenario) => {
    const card = document.createElement('article');
    card.className = `card scenario-card ${Number(scenario.is_read) === 0 ? 'unread' : ''}`;

    const meta = document.createElement('div');
    meta.className = 'scenario-meta';
    meta.innerHTML = `<span>${formatDateTime(scenario.starts_at || scenario.created_at)}</span>`;
    const badge = document.createElement('span');
    badge.className = `badge ${Number(scenario.is_read) === 0 ? 'badge-danger' : 'badge-secondary'}`;
    badge.textContent = Number(scenario.is_read) === 0 ? 'Unread' : 'Reviewed';
    meta.appendChild(badge);

    const title = document.createElement('strong');
    title.textContent = scenario.title;

    const description = document.createElement('p');
    description.textContent = scenario.description || 'This scenario was published without additional detail.';

    const footer = document.createElement('div');
    footer.className = 'stock-card-footer';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-sm btn-outline';
    button.textContent = 'Open Scenarios';
    button.addEventListener('click', () => {
      window.location = '/scenarios';
    });
    footer.appendChild(button);

    card.append(meta, title, description, footer);
    scenariosEl.appendChild(card);
  });
}

async function init() {
  try {
    lastInitTime = Date.now();
    clearDashboardError();
    if (!wsInitialized) {
      updateWsStatus('ws-status', 'disconnected');
    }

    const [appConfig, user] = await Promise.all([
      loadConfig(),
      requireUser(),
    ]);
    if (!user) {
      return;
    }

    const [portfolio, stocks, scenarioFeed] = await Promise.all([
      fetchJson('/api/portfolio.php'),
      fetchJson('/api/stocks.php'),
      fetchJson('/api/scenarios.php'),
    ]);

    const scenarios = scenarioFeed.scenarios || [];
    document.getElementById('cash').textContent = formatCurrency(portfolio.portfolio.cash_balance);

    renderMetrics(portfolio, scenarios);
    renderPositions(portfolio);
    renderShorts(portfolio);
    renderStocks(stocks.stocks || []);
    renderScenarios(scenarios);

    if (portfolio.warnings?.length) {
      setDashboardError(portfolio.warnings[0]);
    }

    if (appConfig.wsPublicUrl && !wsInitialized) {
      wsInitialized = true;
      const wsManager = WebSocketManager.getInstance(user.institution_id, appConfig.wsPublicUrl);
      wsManager.subscribe((message) => {
        if (message.type === 'price_update' || message.type === 'crisis_published') {
          debouncedInit();
        }
      });
      wsManager.onStatusChange((status) => updateWsStatus('ws-status', status));
    }
  } catch (error) {
    console.error('Dashboard initialization failed:', error);
    setDashboardError(getErrorMessage(error, 'Failed to load dashboard data. Please refresh.'));
  }
}

init();
