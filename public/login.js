let institutions = [];
const statusEl = document.getElementById('status');

function setStatus(message, tone = 'neutral') {
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
  statusEl.style.display = message ? 'block' : 'none';
}

async function loadInstitutions() {
  try {
    const res = await fetch('/api/institutions.php');
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message || 'Failed to load institutions.');
    }
    institutions = data.institutions || [];
  } catch (e) {
    console.error('Failed to load institutions', e);
    setStatus('Failed to load institutions.', 'negative');
    return;
  }

  // Populate Login Dropdown
  const select = document.getElementById('loginInstitution');
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select Institution';
  select.appendChild(placeholder);

  institutions.forEach((i) => {
    const opt = document.createElement('option');
    opt.value = i.id;
    opt.textContent = i.name;
    select.appendChild(opt);
  });

  // Also populate/refresh modal list if needed (handled by search)
  renderInstitutionList(institutions);
}

function renderInstitutionList(list) {
  const container = document.getElementById('institutionList');
  container.innerHTML = '';
  if (list.length === 0) {
    container.innerHTML = '<p class="muted text-center">No institutions found.</p>';
    return;
  }

  list.forEach(i => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-outline list-item-btn';
    btn.textContent = i.name;

    btn.onclick = async () => {
      try {
        const res = await fetch(`/api/auth_google_url.php?institution_id=${i.id}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error?.message || 'SSO not configured for this institution.');
        }
        if (data.url) {
          window.location = data.url;
        } else {
          setStatus('SSO is not configured for the selected institution.', 'negative');
        }
      } catch (e) {
        setStatus(e.message || 'SSO is not configured for the selected institution.', 'negative');
      }
    };

    container.appendChild(btn);
  });
}

// Modal Logic
const modal = document.getElementById('institutionModal');
const btn = document.getElementById('institutionLoginBtn');
const closeSpan = document.getElementsByClassName('modal-close')[0];

btn.onclick = function() {
  modal.style.display = 'block';
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('institutionSearch').value = '';
  renderInstitutionList(institutions);
}

closeSpan.onclick = function() {
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
}

window.onclick = function(event) {
  if (event.target == modal) {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }
}

closeSpan.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }
});

// Search Logic
document.getElementById('institutionSearch').addEventListener('input', (e) => {
  const term = e.target.value.toLowerCase();
  const filtered = institutions.filter(i => i.name.toLowerCase().includes(term));
  renderInstitutionList(filtered);
});

// Login Form Logic
async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  const institutionId = document.getElementById('loginInstitution').value;
  const submitButton = form.querySelector('button[type="submit"]');

  if (!institutionId) {
    setStatus('Please select an institution.', 'warning');
    return;
  }

  const payload = { identifier: form.identifier.value, password: form.password.value, institution_id: institutionId };
  submitButton.disabled = true;
  submitButton.textContent = 'Signing in...';
  setStatus('');

  try {
    const res = await fetch('/api/auth_login.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data?.error?.message || data?.error || 'Login failed.', 'negative');
      return;
    }
    setStatus('Login successful. Redirecting...', 'positive');
    window.location = '/dashboard';
  } catch (err) {
    console.error('Login error:', err);
    setStatus('Login failed. Please try again.', 'negative');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Login';
  }
}

document.getElementById('loginForm').addEventListener('submit', handleLogin);

loadInstitutions();
