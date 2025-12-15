let ws;
let configPromise;
let debounceTimer;

function debouncedInit() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => init(), 300);
}

async function loadConfig() {
  if (!configPromise) {
    configPromise = fetch('/api/config.php').then((res) => {
      if (!res.ok) throw new Error('Failed to load config');
      return res.json();
    });
  }
  return configPromise;
}

async function init() {
  try {
    const appConfig = await loadConfig();
    const meRes = await fetch('/api/auth_me.php');
    if (!meRes.ok) {
      window.location = '/index.html';
      return;
    }
    const me = await meRes.json();
    if (!me.user) return window.location = '/index.html';
    const [portfolioRes, stocksRes, crisisRes] = await Promise.all([
      fetch('/api/portfolio.php'),
      fetch('/api/stocks.php'),
      fetch('/api/crisis.php')
    ]);
    if (!portfolioRes.ok || !stocksRes.ok || !crisisRes.ok) {
      throw new Error('Failed to load dashboard data');
    }
    const portfolio = await portfolioRes.json();
    const stocks = await stocksRes.json();
    const crisis = await crisisRes.json();
    document.getElementById('cash').textContent = `Cash Balance: ${portfolio.portfolio.cash_balance}`;
    const posBody = document.querySelector('#positions tbody');
    posBody.innerHTML = '';
    portfolio.positions.forEach((p) => {
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

    const stocksEl = document.getElementById('stocks');
    stocksEl.innerHTML = '';
    stocks.stocks.forEach((s) => {
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
      buyBtn.addEventListener('click', () => trade(s.id, 'buy'));
      const sellBtn = document.createElement('button');
      sellBtn.textContent = 'Sell';
      sellBtn.addEventListener('click', () => trade(s.id, 'sell'));
      actions.appendChild(buyBtn);
      actions.appendChild(sellBtn);
      card.appendChild(actions);

      stocksEl.appendChild(card);
    });

    const shortsBody = document.querySelector('#shorts tbody');
    shortsBody.innerHTML = '';
    portfolio.shorts.forEach((sh) => {
      const tr = document.createElement('tr');
      const tickerTd = document.createElement('td');
      tickerTd.textContent = sh.ticker;
      const qtyTd = document.createElement('td');
      qtyTd.textContent = sh.quantity;
      const openPriceTd = document.createElement('td');
      openPriceTd.textContent = sh.open_price;
      const expiresTd = document.createElement('td');
      expiresTd.textContent = sh.expires_at;
      tr.appendChild(tickerTd);
      tr.appendChild(qtyTd);
      tr.appendChild(openPriceTd);
      tr.appendChild(expiresTd);
      shortsBody.appendChild(tr);
    });

    const scenariosEl = document.getElementById('scenarios');
    scenariosEl.innerHTML = '';
    crisis.scenarios.forEach((sc) => {
      const li = document.createElement('li');
      const strong = document.createElement('strong');
      strong.textContent = sc.title;
      li.appendChild(strong);
      li.appendChild(document.createTextNode(` - ${sc.description}`));
      scenariosEl.appendChild(li);
    });
    await connectSocket(me.user.institution_id, appConfig.wsPublicUrl);
  } catch (err) {
    console.error('Dashboard initialization failed:', err);
    alert('Failed to load dashboard. Please refresh the page.');
  }
}

async function trade(stockId, type) {
  const qty = prompt('Quantity?');
  if (!qty) return;
  try {
    const endpoint = type === 'buy' ? '/api/trades_buy.php' : '/api/trades_sell.php';
    const res = await fetch(endpoint, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ stock_id: stockId, quantity: Number(qty) }) 
    });
    if (!res.ok) {
      throw new Error(`Trade failed with status ${res.status}`);
    }
    const data = await res.json();
    alert(data.message || 'Trade executed successfully');
    debouncedInit();
  } catch (err) {
    console.error('Trade failed:', err);
    alert('Trade failed. Please try again.');
  }
}

async function connectSocket(institutionId, wsPublicUrl) {
  if (!wsPublicUrl) {
    console.warn('WS_PUBLIC_URL not set; skipping WebSocket connection');
    return;
  }
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    try {
      ws.close();
    } catch (err) {
      console.warn('Error closing previous WebSocket connection', err);
    }
  }
  const url = new URL(wsPublicUrl);
  url.searchParams.set('institution_id', institutionId);
  ws = new WebSocket(url.toString());
  ws.onmessage = (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch (err) {
      console.warn('Invalid WebSocket message', err);
      return;
    }
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
  };
  ws.onclose = () => {
    console.warn('WebSocket disconnected');
    ws = null;
  };
  ws.onerror = (err) => console.warn('WebSocket error', err);
}

init();
