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
  if (!res.ok) {
    alert('Failed to load stocks');
    return;
  }
  const data = await res.json();
  const container = document.getElementById('managerStocks');
  container.innerHTML = '';
  (data.stocks || []).forEach((s) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.textContent = `#${s.id} ${s.ticker} - ${s.name} (${s.current_price || s.initial_price})`;
    container.appendChild(card);
  });
}

async function loadCrisis() {
  const res = await fetch('/api/manager_crisis.php');
  if (!res.ok) {
    alert('Failed to load crisis scenarios');
    return;
  }
  const data = await res.json();
  const container = document.getElementById('crisisList');
  container.innerHTML = '';
  (data.scenarios || []).forEach((sc) => {
    const card = document.createElement('div');
    card.className = 'card';
    const strong = document.createElement('strong');
    strong.textContent = sc.title;
    card.appendChild(strong);
    card.appendChild(document.createTextNode(` [${sc.status}]`));
    container.appendChild(card);
  });
}

async function loadParticipants() {
  const res = await fetch('/api/manager_participants.php');
  if (!res.ok) {
    alert('Failed to load participants');
    return;
  }
  const data = await res.json();
  const container = document.getElementById('participants');
  container.innerHTML = '';
  (data.participants || []).forEach((p) => {
    const row = document.createElement('div');
    row.textContent = `${p.username || p.email} - Cash: ${p.cash_balance || 0}`;
    container.appendChild(row);
  });
}

document.getElementById('stockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const payload = Object.fromEntries(form.entries());
  const res = await fetch('/api/manager_stocks.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) {
    alert('Failed to add stock');
    return;
  }
  loadStocks();
});

document.getElementById('priceForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const payload = Object.fromEntries(form.entries());
  const res = await fetch('/api/manager_price.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) {
    alert('Failed to update price');
    return;
  }
  loadStocks();
});

document.getElementById('crisisForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const payload = Object.fromEntries(form.entries());
  const res = await fetch('/api/manager_crisis.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) {
    alert('Failed to save scenario');
    return;
  }
  loadCrisis();
});

initManager();
