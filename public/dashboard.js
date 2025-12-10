let ws;
async function init() {
  const meRes = await fetch('/api/auth_me.php');
  const me = await meRes.json();
  if (!me.user) return window.location = '/public/index.html';
  const [portfolioRes, stocksRes, crisisRes] = await Promise.all([
    fetch('/api/portfolio.php'),
    fetch('/api/stocks.php'),
    fetch('/api/crisis.php')
  ]);
  const portfolio = await portfolioRes.json();
  const stocks = await stocksRes.json();
  const crisis = await crisisRes.json();
  document.getElementById('cash').textContent = `Cash Balance: ${portfolio.portfolio.cash_balance}`;
  const posBody = document.querySelector('#positions tbody');
  posBody.innerHTML = portfolio.positions.map(p => `<tr><td>${p.ticker}</td><td>${p.quantity}</td><td>${p.avg_price}</td></tr>`).join('');
  document.getElementById('stocks').innerHTML = stocks.stocks.map(s => `
    <div class="card">
      <strong>${s.ticker}</strong> ${s.name}<br />
      Price: ${s.current_price || s.initial_price}
      <div class="actions">
        <button onclick="trade(${s.id}, 'buy')">Buy</button>
        <button onclick="trade(${s.id}, 'sell')">Sell</button>
      </div>
    </div>
  `).join('');
  document.querySelector('#shorts tbody').innerHTML = portfolio.shorts.map(sh => `<tr><td>${sh.ticker}</td><td>${sh.quantity}</td><td>${sh.open_price}</td><td>${sh.expires_at}</td></tr>`).join('');
  document.getElementById('scenarios').innerHTML = crisis.scenarios.map(sc => `<li><strong>${sc.title}</strong> - ${sc.description}</li>`).join('');
  connectSocket(me.user.institution_id);
}

async function trade(stockId, type) {
  const qty = prompt('Quantity?');
  if (!qty) return;
  const endpoint = type === 'buy' ? '/api/trades_buy.php' : '/api/trades_sell.php';
  const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stock_id: stockId, quantity: Number(qty) }) });
  const data = await res.json();
  alert(JSON.stringify(data));
  init();
}

function connectSocket(institutionId) {
function connectSocket(institutionId) {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHost = window.WS_HOST || window.location.hostname + ':8765';
  ws = new WebSocket(`${wsProtocol}//${wsHost}/ws?institution_id=${institutionId}`);
}
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'price_update') {
      init();
    }
    if (msg.type === 'crisis_published') {
      alert(`New scenario: ${msg.title}`);
      init();
    }
  };
}

init();
