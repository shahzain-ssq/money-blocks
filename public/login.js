let institutions = [];

async function loadInstitutions() {
  const res = await fetch('/api/institutions.php');
  const data = await res.json();
  institutions = data.institutions || [];

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
    btn.className = 'list-item-btn'; // Need to add style
    btn.textContent = i.name;
    btn.style.width = '100%';
    btn.style.textAlign = 'left';
    btn.style.padding = '0.75rem';
    btn.style.border = '1px solid var(--border-color, #334155)';
    btn.style.marginBottom = '0.5rem';
    btn.style.background = 'var(--bg-main, #0f172a)';
    btn.style.color = 'var(--text-primary, #f8fafc)';
    btn.style.cursor = 'pointer';
    btn.onmouseover = () => btn.style.background = 'var(--bg-hover, #334155)';
    btn.onmouseout = () => btn.style.background = 'var(--bg-main, #0f172a)';

    btn.onclick = async () => {
      // SSO Login logic
      // Redirect user to the institution's login page
      // If we had a stored URL, we'd use it. For now, we simulate Google Auth flow as per original code
      const res = await fetch(`/api/auth_google_url.php?institution_id=${i.id}`);
      const data = await res.json();
      if (data.url) {
        window.location = data.url;
      } else {
        alert('SSO not configured for this institution.');
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
  document.getElementById('institutionSearch').value = '';
  renderInstitutionList(institutions);
}

closeSpan.onclick = function() {
  modal.style.display = 'none';
}

window.onclick = function(event) {
  if (event.target == modal) {
    modal.style.display = 'none';
  }
}

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

  if (!institutionId) {
    document.getElementById('status').textContent = 'Please select an institution.';
    return;
  }

  const payload = { identifier: form.identifier.value, password: form.password.value, institution_id: institutionId };

  try {
    const res = await fetch('/api/auth_login.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    document.getElementById('status').textContent = data.error ? data.error : 'Logged in';
    if (!data.error) window.location = '/dashboard.html';
  } catch (err) {
    console.error('Login error:', err);
    document.getElementById('status').textContent = 'Login failed. Please try again.';
  }
}

document.getElementById('loginForm').addEventListener('submit', handleLogin);

loadInstitutions();
