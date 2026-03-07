import { WebSocketManager } from './js/ws-manager.js';
import { fetchJson, getErrorMessage } from './js/api.js';
import {
  escapeHtml,
  formatCurrency,
  formatDateTime,
  formatPercent,
  formatQuantity,
  requireUser,
  setInlineStatus,
  updateWsStatus,
} from './js/ui.js';

let currentMode = 'spot';
let currentAction = 'buy';
let stocks = [];
let filteredStocks = [];
let portfolio = null;
let positions = [];
let shorts = [];
let listenersBound = false;
let durationsLoaded = false;
let configPromise;
let debounceTimer;
let queryApplied = false;
let lastRefreshTime = 0;
let refreshRunning = false;
let queuedRefresh = false;
const REFRESH_THROTTLE_MS = 250;

function setTradeError(message) {
  const el = document.getElementById('tradeError');
  if (!el) {
    return;
  }
  el.textContent = message;
  el.style.display = message ? 'block' : 'none';
}

function clearTradeError() {
  setTradeError('');
}

function getSelectedStock() {
  const stockId = Number(document.getElementById('stockSelect').value);
  return stocks.find((stock) => Number(stock.id) === stockId) || null;
}

function debounceRefresh() {
  const now = Date.now();
  const elapsed = now - lastRefreshTime;

  if (refreshRunning) {
    queuedRefresh = true;
    return;
  }

  if (elapsed >= REFRESH_THROTTLE_MS) {
    runRefresh();
    return;
  }

  if (debounceTimer) {
    return;
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    if (refreshRunning) {
      queuedRefresh = true;
      return;
    }
    runRefresh();
  }, Math.max(REFRESH_THROTTLE_MS - elapsed, 0));
}

async function runRefresh() {
  refreshRunning = true;
  lastRefreshTime = Date.now();
  try {
    await loadData();
    updateUI();
  } catch (error) {
    handleFatalError(error);
  } finally {
    refreshRunning = false;
    if (queuedRefresh) {
      queuedRefresh = false;
      debounceRefresh();
    }
  }
}

function handleFatalError(error) {
  console.error('Trade screen failed', error);
  setTradeError(getErrorMessage(error, 'Failed to load trading data.'));
}

async function loadConfig() {
  if (!configPromise) {
    configPromise = fetchJson('/api/config.php');
  }
  return configPromise;
}

function setSelectedInstrument(stock) {
  const title = document.getElementById('selectedInstrument');
  const price = document.getElementById('previewPrice');
  const total = document.getElementById('previewTotal');
  const balance = document.getElementById('previewBalance');
  const position = document.getElementById('previewPosition');
  const expiry = document.getElementById('previewExpiry');

  if (!stock) {
    title.innerHTML = `
      <strong>Select an instrument</strong>
      <span class="subtext">Pricing and validation details appear here once an instrument is selected.</span>
    `;
    price.textContent = '-';
    total.textContent = '-';
    balance.textContent = '-';
    position.textContent = '-';
    expiry.textContent = '-';
  }
}

function updateActionButtonLabels() {
  const buyButton = document.getElementById('btnBuy');
  const sellButton = document.getElementById('btnSell');

  if (currentMode === 'spot') {
    buyButton.textContent = 'Buy';
    buyButton.dataset.action = 'buy';
    sellButton.textContent = 'Sell';
    sellButton.dataset.action = 'sell';
    buyButton.className = `action-btn ${currentAction === 'buy' ? 'active buy' : ''}`.trim();
    sellButton.className = `action-btn ${currentAction === 'sell' ? 'active sell' : ''}`.trim();
  } else {
    buyButton.textContent = 'Open Short';
    buyButton.dataset.action = 'open';
    sellButton.textContent = 'Close Short';
    sellButton.dataset.action = 'close';
    buyButton.className = `action-btn ${currentAction === 'open' ? 'active buy' : ''}`.trim();
    sellButton.className = `action-btn ${currentAction === 'close' ? 'active sell' : ''}`.trim();
  }

  document.querySelectorAll('.trade-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.mode === currentMode);
  });
}

function populateStockSelect() {
  const select = document.getElementById('stockSelect');
  const currentSelection = select.value;
  const search = document.getElementById('stockSearch').value.trim().toLowerCase();

  filteredStocks = !search
    ? [...stocks]
    : stocks.filter((stock) => `${stock.ticker} ${stock.name}`.toLowerCase().includes(search));

  select.innerHTML = '';

  if (!filteredStocks.length) {
    const option = document.createElement('option');
    option.disabled = true;
    option.selected = true;
    option.textContent = 'No matching instruments';
    select.appendChild(option);
    return;
  }

  filteredStocks.forEach((stock) => {
    const option = document.createElement('option');
    option.value = String(stock.id);
    option.textContent = `${stock.ticker} - ${stock.name}`;
    select.appendChild(option);
  });

  if (currentSelection && filteredStocks.some((stock) => String(stock.id) === currentSelection)) {
    select.value = currentSelection;
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const tickerParam = urlParams.get('ticker');
  if (tickerParam) {
    const fromQuery = filteredStocks.find((stock) => stock.ticker === tickerParam);
    if (fromQuery) {
      select.value = String(fromQuery.id);
      return;
    }
  }

  select.selectedIndex = 0;
}

function applyQueryParams() {
  if (queryApplied) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const action = (params.get('action') || '').toLowerCase();
  if (action === 'sell') {
    currentMode = 'spot';
    currentAction = 'sell';
  } else if (action === 'buy') {
    currentMode = 'spot';
    currentAction = 'buy';
  }

  queryApplied = true;
}

function getOwnedQuantity(stockId) {
  const position = positions.find((item) => Number(item.stock_id) === Number(stockId));
  return position ? Number(position.quantity || 0) : 0;
}

function getOpenShorts(stockId) {
  return shorts
    .filter((item) => Number(item.stock_id) === Number(stockId) && Number(item.closed || 0) === 0)
    .sort((left, right) => {
      const leftExpiry = left.expires_at ? new Date(`${left.expires_at}Z`).getTime() : 0;
      const rightExpiry = right.expires_at ? new Date(`${right.expires_at}Z`).getTime() : 0;
      return leftExpiry - rightExpiry;
    });
}

function getOpenShortQuantity(stockId) {
  return getOpenShorts(stockId).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function getInstitutionTotalQuantity(stockId) {
  const stock = stocks.find((item) => Number(item.id) === Number(stockId));
  return Number(stock?.institution_total_quantity ?? 0);
}

function estimateShortCloseProfit(stockId, quantity, currentPrice) {
  let remaining = quantity;
  let profit = 0;
  for (const position of getOpenShorts(stockId)) {
    if (remaining <= 0) {
      break;
    }
    const closable = Math.min(remaining, Number(position.quantity || 0));
    profit += (Number(position.open_price || 0) - currentPrice) * closable;
    remaining -= closable;
  }
  return { remaining, profit };
}

function updateSubmitButton() {
  const button = document.getElementById('submitBtn');
  const labels = {
    buy: 'Buy Stock',
    sell: 'Sell Position',
    open: 'Open Short',
    close: 'Close Short',
  };
  button.textContent = labels[currentAction] || 'Submit Trade';
}

async function loadDurations() {
  if (durationsLoaded) {
    return;
  }

  const data = await fetchJson('/api/config_options.php');
  const select = document.getElementById('durationSelect');
  select.innerHTML = '';

  if (!(data.durations || []).length) {
    const option = document.createElement('option');
    option.disabled = true;
    option.selected = true;
    option.textContent = 'No durations available';
    select.appendChild(option);
    durationsLoaded = true;
    return;
  }

  data.durations.forEach((duration) => {
    const option = document.createElement('option');
    option.value = String(duration.duration_seconds);
    option.textContent = duration.label;
    select.appendChild(option);
  });

  durationsLoaded = true;
}

function updateInstrumentSummary(stock) {
  const wrapper = document.getElementById('selectedInstrument');
  if (!stock) {
    setSelectedInstrument(null);
    return;
  }

  const owned = getOwnedQuantity(stock.id);
  const shortQty = getOpenShortQuantity(stock.id);
  wrapper.innerHTML = `
    <strong>${escapeHtml(stock.ticker)} - ${escapeHtml(stock.name)}</strong>
    <span class="subtext">${formatCurrency(stock.current_price ?? stock.initial_price)} current price - ${formatPercent(stock.change_pct || 0)} move</span>
    <span class="subtext">Owned ${formatQuantity(owned)} - Open short ${formatQuantity(shortQty)}</span>
  `;
}

function updateHoldingsInfo(stock) {
  const info = document.getElementById('holdingsInfo');
  if (!stock) {
    info.textContent = '';
    return;
  }

  const owned = getOwnedQuantity(stock.id);
  const openShort = getOpenShortQuantity(stock.id);

  if (currentMode === 'spot') {
    const limitText = stock.per_user_limit ? ` / limit ${formatQuantity(stock.per_user_limit)}` : '';
    info.textContent = `Owned ${formatQuantity(owned)}${limitText}`;
  } else {
    const shortLimitText = stock.per_user_short_limit ? ` / limit ${formatQuantity(stock.per_user_short_limit)}` : '';
    info.textContent = `Open shorts ${formatQuantity(openShort)}${shortLimitText}`;
  }
}

function getTradeValidation(stock, quantity, duration) {
  if (!stock || !portfolio) {
    return {
      isValid: false,
      message: '',
      tone: 'negative',
      projectedCash: 0,
      currentPositionLabel: '-',
      expiryText: '-',
      showExpiry: false,
      currentPrice: 0,
      total: 0,
    };
  }

  const currentPrice = Number(stock.current_price ?? stock.initial_price ?? 0);
  const total = currentPrice * quantity;
  const currentCash = Number(portfolio.cash_balance || 0);
  let projectedCash = currentCash;
  let currentPositionLabel = currentMode === 'spot'
    ? `${formatQuantity(getOwnedQuantity(stock.id))} shares owned`
    : `${formatQuantity(getOpenShortQuantity(stock.id))} shares short`;
  let message = '';
  let tone = 'negative';
  let expiryText = '-';
  let showExpiry = false;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    message = 'Enter a valid quantity greater than zero.';
  } else if (currentMode === 'spot' && currentAction === 'buy') {
    projectedCash = currentCash - total;
    const owned = getOwnedQuantity(stock.id);
    const institutionTotal = getInstitutionTotalQuantity(stock.id);
    if (projectedCash < 0) {
      message = `Insufficient cash. You need ${formatCurrency(total - currentCash)} more to place this order.`;
    } else if (stock.per_user_limit && owned + quantity > Number(stock.per_user_limit)) {
      message = `This order exceeds your per-user limit of ${formatQuantity(stock.per_user_limit)} shares.`;
    } else if (stock.total_limit && institutionTotal + quantity > Number(stock.total_limit)) {
      message = 'This order exceeds the institution-wide stock limit.';
    }
  } else if (currentMode === 'spot' && currentAction === 'sell') {
    const owned = getOwnedQuantity(stock.id);
    projectedCash = currentCash + total;
    if (quantity > owned) {
      message = `Insufficient holdings. You currently own ${formatQuantity(owned)} shares.`;
    }
  } else if (currentMode === 'short' && currentAction === 'open') {
    const openShortQuantity = getOpenShortQuantity(stock.id);
    currentPositionLabel = `${formatQuantity(openShortQuantity)} shares currently short`;
    if (!duration) {
      message = 'Select a valid short duration.';
    } else if (stock.per_user_short_limit && openShortQuantity + quantity > Number(stock.per_user_short_limit)) {
      message = `This order exceeds your short limit of ${formatQuantity(stock.per_user_short_limit)} shares.`;
    } else {
      showExpiry = true;
      expiryText = formatDateTime(new Date(Date.now() + duration * 1000));
    }
  } else if (currentMode === 'short' && currentAction === 'close') {
    const { remaining, profit } = estimateShortCloseProfit(stock.id, quantity, currentPrice);
    if (remaining > 0) {
      message = `Cannot close more than your current short position of ${formatQuantity(quantity - remaining)} shares.`;
    } else {
      projectedCash = currentCash + profit;
    }
  }

  return {
    isValid: message === '',
    message,
    tone,
    projectedCash,
    currentPositionLabel,
    expiryText,
    showExpiry,
    currentPrice,
    total,
  };
}

function updatePreview(isUserAction = false) {
  const stock = getSelectedStock();
  const quantity = Number(document.getElementById('quantityInput').value);
  const duration = Number(document.getElementById('durationSelect').value || 0);
  const validation = document.getElementById('validationMsg');
  const expiryRow = document.getElementById('expiryRow');
  const previewPrice = document.getElementById('previewPrice');
  const previewTotal = document.getElementById('previewTotal');
  const previewBalance = document.getElementById('previewBalance');
  const previewPosition = document.getElementById('previewPosition');
  const previewExpiry = document.getElementById('previewExpiry');
  const submitButton = document.getElementById('submitBtn');

  updateSubmitButton();
  updateInstrumentSummary(stock);
  updateHoldingsInfo(stock);
  if (isUserAction) {
    setInlineStatus(validation, '');
  }
  submitButton.disabled = false;
  expiryRow.style.display = 'none';

  if (!stock || !portfolio) {
    setSelectedInstrument(null);
    submitButton.disabled = true;
    return;
  }

  const validationState = getTradeValidation(stock, quantity, duration);

  previewPrice.textContent = formatCurrency(validationState.currentPrice);
  previewTotal.textContent = formatCurrency(validationState.total);
  previewBalance.textContent = formatCurrency(validationState.projectedCash);
  previewPosition.textContent = validationState.currentPositionLabel;

  if (validationState.showExpiry) {
    expiryRow.style.display = 'flex';
    previewExpiry.textContent = validationState.expiryText;
  }

  if (!validationState.isValid) {
    submitButton.disabled = true;
    if (isUserAction) {
      setInlineStatus(validation, validationState.message, validationState.tone);
    }
  }
}

function updateUI(isUserAction = false) {
  updateActionButtonLabels();
  updateSubmitButton();
  const durationGroup = document.getElementById('durationGroup');
  durationGroup.style.display = currentMode === 'short' && currentAction === 'open' ? 'block' : 'none';
  if (durationGroup.style.display === 'block') {
    loadDurations().then(() => updatePreview(isUserAction)).catch(handleFatalError);
  }
  updatePreview(isUserAction);
}

function setupEventListeners() {
  if (listenersBound) {
    return;
  }

  listenersBound = true;

  document.querySelectorAll('.trade-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      currentMode = tab.dataset.mode;
      currentAction = currentMode === 'spot' ? 'buy' : 'open';
      updateUI(true);
    });
  });

  document.querySelectorAll('.action-btn').forEach((button) => {
    button.addEventListener('click', () => {
      currentAction = button.dataset.action;
      updateUI(true);
    });
  });

  document.getElementById('stockSearch').addEventListener('input', () => {
    populateStockSelect();
    updatePreview(true);
  });

  document.getElementById('stockSelect').addEventListener('change', () => updatePreview(true));
  document.getElementById('quantityInput').addEventListener('input', () => updatePreview(true));
  document.getElementById('durationSelect').addEventListener('change', () => updatePreview(true));
  document.getElementById('tradeForm').addEventListener('submit', handleTrade);
}

async function loadData() {
  clearTradeError();

  const [stocksData, portfolioData] = await Promise.all([
    fetchJson('/api/stocks.php'),
    fetchJson('/api/portfolio.php'),
  ]);

  stocks = stocksData.stocks || [];
  portfolio = portfolioData.portfolio || {};
  positions = portfolioData.positions || [];
  shorts = portfolioData.shorts || [];

  document.getElementById('cashDisplay').textContent = formatCurrency(portfolio.cash_balance);
  populateStockSelect();
  applyQueryParams();
}

async function handleTrade(event) {
  event.preventDefault();

  const stock = getSelectedStock();
  const quantity = Number(document.getElementById('quantityInput').value);
  const duration = Number(document.getElementById('durationSelect').value);
  const button = document.getElementById('submitBtn');
  const validation = document.getElementById('validationMsg');

  if (!stock || !portfolio) {
    setInlineStatus(validation, 'Choose an instrument and enter a valid quantity.', 'negative');
    return;
  }

  const validationState = getTradeValidation(stock, quantity, duration);
  if (!validationState.isValid) {
    setInlineStatus(validation, validationState.message || 'Choose an instrument and enter a valid quantity.', validationState.tone);
    return;
  }

  const payload = {
    stock_id: stock.id,
    quantity,
  };

  let endpoint = '';
  if (currentMode === 'spot') {
    endpoint = currentAction === 'buy' ? '/api/trades_buy.php' : '/api/trades_sell.php';
  } else if (currentAction === 'open') {
    endpoint = '/api/trades_short_open.php';
    payload.duration_seconds = duration;
  } else {
    endpoint = '/api/trades_short_close.php';
  }

  button.disabled = true;
  button.textContent = 'Submitting...';

  try {
    await fetchJson(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setInlineStatus(validation, 'Order submitted successfully.', 'positive');
    await loadData();
    document.getElementById('quantityInput').value = '1';
    updateUI();
  } catch (error) {
    console.error('Trade submission failed', error);
    setInlineStatus(validation, getErrorMessage(error, 'Trade failed. Please try again.'), 'negative');
  } finally {
    button.disabled = false;
    updateSubmitButton();
  }
}

async function init() {
  try {
    clearTradeError();
    updateWsStatus('ws-status', 'disconnected');

    const [config, user] = await Promise.all([
      loadConfig(),
      requireUser(),
    ]);
    if (!user) {
      return;
    }

    await loadData();
    setupEventListeners();
    updateUI();

    if (config.wsPublicUrl) {
      const wsManager = WebSocketManager.getInstance(user.institution_id, config.wsPublicUrl);
      wsManager.onStatusChange((status) => updateWsStatus('ws-status', status));
      wsManager.subscribe((message) => {
        if (message.type === 'price_update') {
          debounceRefresh();
        }
      });
    }
  } catch (error) {
    handleFatalError(error);
  }
}

init();
