import { WebSocketManager } from './js/ws-manager.js';
import { fetchJson, getErrorMessage } from './js/api.js';
import {
  createEmptyState,
  escapeHtml,
  formatCurrency,
  formatDateTime,
  formatQuantity,
  renderMetricCards,
  requireUser,
  updateWsStatus,
} from './js/ui.js';

function setActivityError(message) {
  const el = document.getElementById('activityError');
  if (!el) {
    return;
  }
  el.textContent = message;
  el.style.display = message ? 'block' : 'none';
}

function clearActivityError() {
  setActivityError('');
}

function getTypeClass(type) {
  switch (type) {
    case 'BUY':
      return 'badge-success';
    case 'SELL':
      return 'badge-danger';
    case 'SHORT_OPEN':
      return 'badge-warning';
    case 'SHORT_CLOSE':
      return 'badge-info';
    default:
      return 'badge-secondary';
  }
}

function renderMetrics(activity) {
  const totalNotional = activity.reduce((sum, row) => sum + (Number(row.price || 0) * Number(row.quantity || 0)), 0);
  const buyCount = activity.filter((row) => row.type === 'BUY').length;
  const shortCount = activity.filter((row) => row.type === 'SHORT_OPEN').length;
  renderMetricCards(document.getElementById('activityMetrics'), [
    {
      label: 'Recorded Orders',
      value: formatQuantity(activity.length),
      helper: 'Latest 100 executions in this portfolio feed.',
    },
    {
      label: 'Total Notional',
      value: formatCurrency(totalNotional),
      helper: 'Absolute notional across the currently loaded orders.',
    },
    {
      label: 'Buys',
      value: formatQuantity(buyCount),
      helper: 'Filled buy-side executions in the current feed.',
    },
    {
      label: 'Short Opens',
      value: formatQuantity(shortCount),
      helper: 'Executed short entries in the current feed.',
    },
  ]);
}

function renderActivity(activity) {
  const tbody = document.getElementById('activityBody');
  tbody.innerHTML = '';

  if (!activity.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.appendChild(createEmptyState('No activity yet.', 'Trades will appear here as soon as you place orders.'));
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  activity.forEach((row) => {
    const total = Number(row.price || 0) * Number(row.quantity || 0);
    const tableRow = document.createElement('tr');

    const timeCell = document.createElement('td');
    timeCell.textContent = formatDateTime(row.created_at);

    const typeCell = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge ${getTypeClass(row.type)}`;
    badge.textContent = row.type.replace('_', ' ');
    typeCell.appendChild(badge);

    const stockCell = document.createElement('td');
    stockCell.innerHTML = `
      <div class="stack">
        <strong>${escapeHtml(row.ticker)}</strong>
        <span class="subtext">${escapeHtml(row.name || 'Instrument')}</span>
      </div>
    `;

    const quantityCell = document.createElement('td');
    quantityCell.className = 'numeric';
    quantityCell.textContent = formatQuantity(row.quantity);

    const priceCell = document.createElement('td');
    priceCell.className = 'numeric';
    priceCell.textContent = formatCurrency(row.price);

    const totalCell = document.createElement('td');
    totalCell.className = 'numeric';
    totalCell.textContent = formatCurrency(total);

    tableRow.append(timeCell, typeCell, stockCell, quantityCell, priceCell, totalCell);
    tbody.appendChild(tableRow);
  });
}

async function init() {
  try {
    clearActivityError();
    updateWsStatus('ws-status', 'disconnected');

    const [config, user] = await Promise.all([
      fetchJson('/api/config.php'),
      requireUser(),
    ]);
    if (!user) {
      return;
    }

    if (config.wsPublicUrl) {
      const wsManager = WebSocketManager.getInstance(user.institution_id, config.wsPublicUrl);
      wsManager.onStatusChange((status) => updateWsStatus('ws-status', status));
    }

    const data = await fetchJson('/api/activity.php');
    const activity = data.activity || [];
    renderMetrics(activity);
    renderActivity(activity);
  } catch (error) {
    console.error('Activity init failed', error);
    setActivityError(getErrorMessage(error, 'Failed to initialize activity feed.'));
  }
}

init();
