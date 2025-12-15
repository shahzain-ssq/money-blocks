async function initManager() {
  try {
    const meRes = await fetch('/api/auth_me.php');
    if (!meRes.ok) {
      window.location = '/index.html';
      return;
    }
    const me = await meRes.json();
    if (!me.user || (me.user.role !== 'manager' && me.user.role !== 'admin')) {
      window.location = '/index.html';
      return;
    }
    loadStocks();
    loadCrisis();
    loadParticipants();
  } catch (err) {
    console.error('Failed to initialize manager view:', err);
    window.location = '/index.html';
  }
}

async function loadStocks() {
  try {
    const res = await fetch('/api/manager_stocks.php');
    if (!res.ok) {
      alert('Failed to load stocks');
      return;
    }
    const data = await res.json();
    if (data.error) {
      alert(data.error);
      return;
    }
    const container = document.getElementById('managerStocks');
    if (!container) return;
    container.innerHTML = '';
    (data.stocks || []).forEach((s) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.textContent = `#${s.id} ${s.ticker} - ${s.name} (${s.current_price || s.initial_price})`;
      container.appendChild(card);
    });
  } catch (err) {
    console.error('Failed to load stocks', err);
    alert('Failed to load stocks');
  }
}

async function loadCrisis() {
  try {
    const res = await fetch('/api/manager_crisis.php');
    if (!res.ok) {
      alert('Failed to load crisis scenarios');
      return;
    }
    const data = await res.json();
    if (data.error) {
      alert(data.error);
      return;
    }
    const container = document.getElementById('crisisList');
    if (!container) return;
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
  } catch (err) {
    console.error('Failed to load crisis scenarios', err);
    alert('Failed to load crisis scenarios');
  }
}

async function loadParticipants() {
  try {
    const res = await fetch('/api/manager_participants.php');
    if (!res.ok) {
      alert('Failed to load participants');
      return;
    }
    const data = await res.json();
    if (data.error) {
      alert(data.error);
      return;
    }
    const container = document.getElementById('participants');
    if (!container) return;
    container.innerHTML = '';
    (data.participants || []).forEach((p) => {
      const row = document.createElement('div');
      row.textContent = `${p.username || p.email} - Cash: ${p.cash_balance || 0}`;
      container.appendChild(row);
    });
  } catch (err) {
    console.error('Failed to load participants', err);
    alert('Failed to load participants');
  }
}

const stockForm = document.getElementById('stockForm');
if (stockForm) {
  stockForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const payload = Object.fromEntries(form.entries());
    try {
      const res = await fetch('/api/manager_stocks.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(data.error || 'Failed to add stock');
        return;
      }
      loadStocks();
    } catch (err) {
      console.error('Stock creation failed:', err);
      alert('Failed to add stock');
    }
  });
}

const priceForm = document.getElementById('priceForm');
if (priceForm) {
  priceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const payload = Object.fromEntries(form.entries());
    try {
      const res = await fetch('/api/manager_price.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(data.error || 'Failed to update price');
        return;
      }
      loadStocks();
    } catch (err) {
      console.error('Price update failed:', err);
      alert('Failed to update price');
    }
  });
}

const crisisForm = document.getElementById('crisisForm');
if (crisisForm) {
  crisisForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const payload = Object.fromEntries(form.entries());
    try {
      const res = await fetch('/api/manager_crisis.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(data.error || 'Failed to save scenario');
        return;
      }
      loadCrisis();
    } catch (err) {
      console.error('Crisis scenario save failed:', err);
      alert('Failed to save scenario');
    }
  });
}

initManager();
