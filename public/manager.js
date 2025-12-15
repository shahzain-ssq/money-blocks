async function initManager() {
  const meRes = await fetch('/api/auth_me.php');
  const me = await meRes.json();
  if (!me.user || (me.user.role !== 'manager' && me.user.role !== 'admin')) return window.location = '/index.html';
  loadStocks();
  loadCrisis();
  loadParticipants();
}

async function loadStocks() {
  const res = await fetch('/api/manager_stocks.php');
  const data = await res.json();
  document.getElementById('managerStocks').innerHTML = data.stocks.map(s => `<div class="card">#${s.id} ${s.ticker} - ${s.name} (${s.current_price || s.initial_price})</div>`).join('');
}

async function loadCrisis() {
  const res = await fetch('/api/manager_crisis.php');
  const data = await res.json();
  document.getElementById('crisisList').innerHTML = data.scenarios.map(sc => `<div class="card"><strong>${sc.title}</strong> [${sc.status}]</div>`).join('');
}

async function loadParticipants() {
  const res = await fetch('/api/manager_participants.php');
  const data = await res.json();
  document.getElementById('participants').innerHTML = data.participants.map(p => `<div>${p.username || p.email} - Cash: ${p.cash_balance || 0}</div>`).join('');
}

document.getElementById('stockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const payload = Object.fromEntries(form.entries());
  await fetch('/api/manager_stocks.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  loadStocks();
});

document.getElementById('priceForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const payload = Object.fromEntries(form.entries());
  await fetch('/api/manager_price.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  loadStocks();
});

document.getElementById('crisisForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const payload = Object.fromEntries(form.entries());
  await fetch('/api/manager_crisis.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  loadCrisis();
});

initManager();
