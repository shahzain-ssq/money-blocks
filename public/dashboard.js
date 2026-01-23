import { WebSocketManager } from './js/ws-manager.js';
import { fetchJson, getErrorMessage } from './js/api.js';

let configPromise;
let debounceTimer;

function debouncedInit() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => init(), 300);
}

async function loadConfig() {
  if (!configPromise) {
    configPromise = fetchJson('/api/config.php');
  }
  return configPromise;
}

function setDashboardError(message) {
  const el = document.getElementById('dashboardError');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
}

function clearDashboardError() {
  const el = document.getElementById('dashboardError');
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

async function init() {
  try {
    clearDashboardError();
    const appConfig = await loadConfig();
    const me = await fetchJson('/api/auth_me.php');
    if (!me.user) return window.location = '/';
    const [portfolio, stocks, crisis] = await Promise.all([
      fetchJson('/api/portfolio.php'),
      fetchJson('/api/stocks.php'),
      fetchJson('/api/crisis.php')
    ]);
    if (portfolio.warnings && portfolio.warnings.length > 0) {
      setDashboardError(portfolio.warnings[0]);
    }
    document.getElementById('cash').textContent = `Cash Balance: ${portfolio.portfolio.cash_balance}`;
    const posBody = document.querySelector('#positions tbody');
    posBody.innerHTML = '';
    const positions = portfolio.positions || [];
    positions.forEach((p) => {
      const tr = document.createElement('tr');
      const tickerTd = document.createElement('td');
      tickerTd.textContent = p.ticker;
      const qtyTd = document.createElement('td');
      qtyTd.textContent = p.quantity;
      const priceTd = document.createElement('td');
      priceTd.textContent = p.avg_price;
      tr.appendChild(tickerTd);
      tr.appendChild(qtyTd);
      tr.appendChild(priceTd);
      posBody.appendChild(tr);
    });
    if (positions.length === 0) {
      posBody.innerHTML = '<tr><td colspan="3" class="text-center muted">No positions yet.</td></tr>';
    }

    const stocksEl = document.getElementById('stocks');
    stocksEl.innerHTML = '';
    const stockList = stocks.stocks || [];
    stockList.forEach((s) => {
      const card = document.createElement('div');
      card.classList.add('card');

      const strong = document.createElement('strong');
      strong.textContent = s.ticker;
      card.appendChild(strong);
      card.appendChild(document.createTextNode(` ${s.name}`));
      card.appendChild(document.createElement('br'));
      card.appendChild(document.createTextNode(`Price: ${s.current_price || s.initial_price}`));

      const actions = document.createElement('div');
      actions.classList.add('actions');
      const buyBtn = document.createElement('button');
      buyBtn.textContent = 'Buy';
      buyBtn.classList.add('btn', 'btn-sm', 'btn-primary');
      buyBtn.style.marginRight = '0.5rem';
      buyBtn.onclick = () => window.location = `/trade?ticker=${encodeURIComponent(s.ticker)}&action=buy`;

      const sellBtn = document.createElement('button');
      sellBtn.textContent = 'Sell';
      sellBtn.classList.add('btn', 'btn-sm', 'btn-outline');
      sellBtn.onclick = () => window.location = `/trade?ticker=${encodeURIComponent(s.ticker)}&action=sell`;

      actions.appendChild(buyBtn);
      actions.appendChild(sellBtn);
      card.appendChild(actions);

      stocksEl.appendChild(card);
    });
    if (stockList.length === 0) {
      stocksEl.innerHTML = '<p class="muted">No active stocks available.</p>';
    }

    const shortsBody = document.querySelector('#shorts tbody');
    shortsBody.innerHTML = '';
    const shorts = portfolio.shorts || [];
    shorts.forEach((sh) => {
      const tr = document.createElement('tr');
      const tickerTd = document.createElement('td');
      tickerTd.textContent = sh.ticker;
      const qtyTd = document.createElement('td');
      qtyTd.textContent = sh.quantity;
      const openPriceTd = document.createElement('td');
      openPriceTd.textContent = sh.open_price;
      const expiresTd = document.createElement('td');
      expiresTd.textContent = sh.expires_at ? new Date(`${sh.expires_at}Z`).toLocaleString() : '-';
      tr.appendChild(tickerTd);
      tr.appendChild(qtyTd);
      tr.appendChild(openPriceTd);
      tr.appendChild(expiresTd);
      shortsBody.appendChild(tr);
    });
    if (shorts.length === 0) {
      shortsBody.innerHTML = '<tr><td colspan="4" class="text-center muted">No active shorts.</td></tr>';
    }

    const scenariosEl = document.getElementById('scenarios');
    scenariosEl.innerHTML = '';
    const scenarios = crisis.scenarios || [];
    scenarios.forEach((sc) => {
      const li = document.createElement('li');
      const strong = document.createElement('strong');
      strong.textContent = sc.title;
      li.appendChild(strong);
      li.appendChild(document.createTextNode(` - ${sc.description}`));
      scenariosEl.appendChild(li);
    });
    if (scenarios.length === 0) {
      scenariosEl.innerHTML = '<li class="muted">No active scenarios.</li>';
    }

    // Initialize WS Manager
    if (appConfig.wsPublicUrl) {
      const wsManager = WebSocketManager.getInstance(me.user.institution_id, appConfig.wsPublicUrl);

      // Subscribe to messages
      wsManager.subscribe((msg) => {
        if (msg.type === 'price_update') {
          debouncedInit();
        }
        if (msg.type === 'crisis_published') {
           if (!msg.title || typeof msg.title !== 'string') {
            console.warn('Invalid crisis_published message', msg);
            return;
          }
          alert(`New scenario: ${msg.title}`);
          debouncedInit();
        }
      });

      // Update UI Status (if element exists)
      const statusEl = document.getElementById('ws-status');
      if (statusEl) {
          wsManager.onStatusChange((status) => {
              statusEl.textContent = status === 'connected' ? '● Live' : '○ Offline';
              statusEl.className = status === 'connected' ? 'status-live' : 'status-offline';
          });
      }
    }

  } catch (err) {
    console.error('Dashboard initialization failed:', err);
    if (redirectIfUnauthorized(err)) return;
    setDashboardError(getErrorMessage(err, 'Failed to load dashboard data. Please refresh.'));
  }
}

async function trade(stockId, type) {
  const qty = prompt('Quantity?');
  if (!qty) return;
  try {
    const endpoint = type === 'buy' ? '/api/trades_buy.php' : '/api/trades_sell.php';
    const data = await fetchJson(endpoint, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ stock_id: stockId, quantity: Number(qty) }) 
    });
    alert(data.message || 'Trade executed successfully');
    debouncedInit();
  } catch (err) {
    console.error('Trade failed:', err);
    alert(getErrorMessage(err, 'Trade failed. Please try again.'));
  }
}

init();
