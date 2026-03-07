let institutions = [];
let statusEl = document.getElementById('status');
let previouslyFocusedElement = null;

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function setStatus(message, tone = 'neutral') {
  if (!statusEl) {
    statusEl = document.getElementById('status');
  }
  if (!statusEl) {
    return;
  }
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
  statusEl.style.display = message ? 'block' : 'none';
}

function getErrorMessage(data, fallback = 'Login failed.') {
  if (typeof data?.error === 'string') {
    return data.error;
  }
  if (typeof data?.error?.message === 'string') {
    return data.error.message;
  }
  if (data?.error) {
    try {
      return JSON.stringify(data.error);
    } catch (error) {
      console.warn('Failed to serialize login error payload', error);
    }
  }
  return fallback;
}

function getModalFocusableElements() {
  return Array.from(modal.querySelectorAll(FOCUSABLE_SELECTOR)).filter((element) => {
    if (!(element instanceof HTMLElement)) {
      return false;
    }
    return element.offsetParent !== null || element === document.activeElement;
  });
}

function closeInstitutionModal() {
  if (!modal) {
    return;
  }

  if (modal.contains(document.activeElement) && document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }

  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');

  if (previouslyFocusedElement instanceof HTMLElement) {
    previouslyFocusedElement.focus();
  } else if (btn instanceof HTMLElement) {
    btn.focus();
  }
}

function openInstitutionModal() {
  if (!modal) {
    return;
  }

  previouslyFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');

  const searchInput = document.getElementById('institutionSearch');
  if (!searchInput) {
    return;
  }
  searchInput.value = '';
  renderInstitutionList(institutions);
  searchInput.focus();
}

function handleModalKeydown(event) {
  if (modal.getAttribute('aria-hidden') === 'true') {
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    closeInstitutionModal();
    return;
  }

  if (event.key !== 'Tab') {
    return;
  }

  const focusable = getModalFocusableElements();
  if (!focusable.length) {
    event.preventDefault();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

async function loadInstitutions() {
  try {
    const res = await fetch('/api/institutions.php');
    const data = await res.json();
    if (!res.ok) {
      throw new Error(getErrorMessage(data, 'Failed to load institutions.'));
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
          throw new Error(getErrorMessage(data, 'SSO not configured for this institution.'));
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
const closeButton = modal?.querySelector('.modal-close');

if (btn) {
  btn.addEventListener('click', () => {
    openInstitutionModal();
  });
}

if (closeButton) {
  closeButton.addEventListener('click', () => {
    closeInstitutionModal();
  });
}

window.addEventListener('click', (event) => {
  if (event.target === modal) {
    closeInstitutionModal();
  }
});

if (modal) {
  modal.addEventListener('keydown', handleModalKeydown);
}

// Search Logic
const institutionSearchInput = document.getElementById('institutionSearch');
if (institutionSearchInput) {
  institutionSearchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = institutions.filter(i => i.name.toLowerCase().includes(term));
    renderInstitutionList(filtered);
  });
}

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
      setStatus(getErrorMessage(data, 'Login failed.'), 'negative');
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
