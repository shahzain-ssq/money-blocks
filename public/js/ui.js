import { fetchJson } from './api.js';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function normalizeDateInput(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'string' && value.includes('T')) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'string') {
    const normalized = new Date(value.replace(' ', 'T') + 'Z');
    return Number.isNaN(normalized.getTime()) ? null : normalized;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatCurrency(value) {
  const amount = Number(value);
  return currencyFormatter.format(Number.isFinite(amount) ? amount : 0);
}

export function formatQuantity(value) {
  const quantity = Number(value);
  return integerFormatter.format(Number.isFinite(quantity) ? quantity : 0);
}

export function formatPercent(value) {
  const percent = Number(value);
  const normalized = Number.isFinite(percent) ? percent : 0;
  const sign = normalized > 0 ? '+' : '';
  return `${sign}${percentFormatter.format(normalized)}%`;
}

export function formatDateTime(value, fallback = '-') {
  const date = normalizeDateInput(value);
  return date ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : fallback;
}

export function formatDate(value, fallback = '-') {
  const date = normalizeDateInput(value);
  return date ? date.toLocaleDateString(undefined, { dateStyle: 'medium' }) : fallback;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function setManagerLink(user, managerLinkId = 'managerLink') {
  const managerLink = document.getElementById(managerLinkId);
  if (!managerLink) {
    return;
  }

  managerLink.style.display = user && (user.role === 'manager' || user.role === 'admin') ? 'block' : 'none';
}

export function updateWsStatus(target, status) {
  const element = typeof target === 'string' ? document.getElementById(target) : target;
  if (!element) {
    return;
  }

  const normalizedStatus = status === 'connected'
    ? 'connected'
    : (status === 'connecting' || status === 'reconnecting')
      ? 'connecting'
      : 'disconnected';

  const label = normalizedStatus === 'connected'
    ? 'Live'
    : normalizedStatus === 'connecting'
      ? 'Connecting'
      : 'Offline';

  element.className = `status-indicator ${normalizedStatus}`;
  element.innerHTML = `<span class="status-bullet" aria-hidden="true"></span><span>${label}</span>`;
}

export async function logout(redirectTo = '/') {
  try {
    await fetch('/api/auth_login.php', {
      method: 'DELETE',
      credentials: 'same-origin',
    });
  } catch (error) {
    console.warn('Logout request failed', error);
  }

  window.location = redirectTo;
}

export function bindLogoutButton(buttonId = 'logoutBtn') {
  const logoutButton = document.getElementById(buttonId);
  if (!logoutButton || logoutButton.dataset.bound === 'true') {
    return;
  }

  logoutButton.dataset.bound = 'true';
  logoutButton.addEventListener('click', (event) => {
    event.preventDefault();
    logout();
  });
}

export async function requireUser({ managerOnly = false } = {}) {
  const auth = await fetchJson('/api/auth_me.php');
  const user = auth.user ?? null;
  if (!user) {
    window.location = '/';
    return null;
  }

  if (managerOnly && user.role !== 'manager' && user.role !== 'admin') {
    window.location = '/';
    return null;
  }

  bindLogoutButton();
  bindMobileNav();
  setManagerLink(user);

  return user;
}

export function bindMobileNav() {
  const MOBILE_BP = 768;
  const toggleBtn = document.getElementById('mobileNavToggle');
  const sidebar = document.querySelector('.sidebar');
  if (!toggleBtn || !sidebar || toggleBtn.dataset.bound === 'true') {
    return;
  }

  toggleBtn.dataset.bound = 'true';
  if (!sidebar.id) sidebar.id = 'app-sidebar';
  toggleBtn.setAttribute('aria-controls', sidebar.id);

  function isMobile() {
    return window.innerWidth <= MOBILE_BP;
  }

  // Only lock the sidebar on mobile when the drawer is closed
  function syncSidebarState() {
    if (!isMobile()) {
      // Desktop: sidebar is always visible and interactive
      sidebar.removeAttribute('aria-hidden');
      sidebar.removeAttribute('inert');
      toggleBtn.setAttribute('aria-expanded', 'false');
      return;
    }
    // Mobile: lock sidebar unless drawer is open
    const isOpen = sidebar.classList.contains('is-open');
    toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (isOpen) {
      sidebar.removeAttribute('aria-hidden');
      sidebar.removeAttribute('inert');
    } else {
      sidebar.setAttribute('aria-hidden', 'true');
      sidebar.setAttribute('inert', '');
    }
  }

  // Initialize
  syncSidebarState();

  // Re-sync when crossing the breakpoint
  window.addEventListener('resize', syncSidebarState);

  toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('is-open');
    syncSidebarState();
  });

  // Close drawer if clicking outside of the sidebar on mobile
  document.addEventListener('click', (event) => {
    if (isMobile() &&
      sidebar.classList.contains('is-open') &&
      !sidebar.contains(event.target) &&
      !toggleBtn.contains(event.target)) {
      sidebar.classList.remove('is-open');
      syncSidebarState();
    }
  });
}

export function renderMetricCards(container, items) {
  if (!container) {
    return;
  }

  container.innerHTML = '';
  items.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'metric-card';
    if (item.tone) {
      card.dataset.tone = item.tone;
    }

    const label = document.createElement('p');
    label.className = 'metric-label';
    label.textContent = item.label;

    const value = document.createElement('strong');
    value.className = 'metric-value';
    value.textContent = item.value;

    card.append(label, value);

    if (item.helper) {
      const helper = document.createElement('span');
      helper.className = 'metric-helper';
      helper.textContent = item.helper;
      card.appendChild(helper);
    }

    container.appendChild(card);
  });
}

export function createEmptyState(message, helper = '') {
  const wrapper = document.createElement('div');
  wrapper.className = 'empty-state';

  const title = document.createElement('p');
  title.className = 'empty-state-title';
  title.textContent = message;
  wrapper.appendChild(title);

  if (helper) {
    const subtitle = document.createElement('p');
    subtitle.className = 'empty-state-helper';
    subtitle.textContent = helper;
    wrapper.appendChild(subtitle);
  }

  return wrapper;
}

export function setInlineStatus(element, message, tone = 'neutral') {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.dataset.tone = tone;
  element.style.display = message ? 'block' : 'none';
}
