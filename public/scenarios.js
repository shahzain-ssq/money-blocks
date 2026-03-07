import { WebSocketManager } from './js/ws-manager.js';
import { fetchJson, getErrorMessage } from './js/api.js';
import {
  createEmptyState,
  formatDateTime,
  formatQuantity,
  renderMetricCards,
  requireUser,
  updateWsStatus,
} from './js/ui.js';

function setScenarioError(message) {
  const el = document.getElementById('scenariosError');
  if (!el) {
    return;
  }
  el.textContent = message;
  el.style.display = message ? 'block' : 'none';
}

function clearScenarioError() {
  setScenarioError('');
}

function renderMetrics(scenarios) {
  const unread = scenarios.filter((scenario) => Number(scenario.is_read) === 0).length;
  const latest = scenarios[0];

  renderMetricCards(document.getElementById('scenarioMetrics'), [
    {
      label: 'Live Scenarios',
      value: formatQuantity(scenarios.length),
      helper: 'Currently published and active for this institution.',
    },
    {
      label: 'Unread',
      value: formatQuantity(unread),
      helper: 'Items that still need acknowledgement.',
    },
    {
      label: 'Last Published',
      value: latest ? formatDateTime(latest.starts_at || latest.created_at) : '-',
      helper: latest ? latest.title : 'No scenarios published yet.',
    },
  ]);
}

async function toggleRead(id, shouldMarkRead) {
  await fetchJson('/api/scenarios.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'toggle_read',
      scenario_id: id,
      read: shouldMarkRead,
    }),
  });
}

function renderScenarios(scenarios) {
  const list = document.getElementById('scenariosList');
  list.innerHTML = '';

  if (!scenarios.length) {
    list.appendChild(createEmptyState('No active scenarios.', 'Published crisis events will appear here as soon as they are live.'));
    return;
  }

  scenarios.forEach((scenario) => {
    const card = document.createElement('article');
    card.className = `card scenario-card ${Number(scenario.is_read) === 0 ? 'unread' : ''}`;

    const meta = document.createElement('div');
    meta.className = 'scenario-meta';
    const date = document.createElement('span');
    date.textContent = formatDateTime(scenario.starts_at || scenario.created_at);
    const badge = document.createElement('span');
    badge.className = `badge ${Number(scenario.is_read) === 0 ? 'badge-danger' : 'badge-secondary'}`;
    badge.textContent = Number(scenario.is_read) === 0 ? 'Unread' : 'Reviewed';
    meta.append(date, badge);

    const title = document.createElement('h3');
    title.textContent = scenario.title;

    const description = document.createElement('p');
    description.textContent = scenario.description || 'No additional description provided.';

    const actionRow = document.createElement('div');
    actionRow.className = 'stock-card-footer';
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'btn btn-sm btn-outline';
    action.textContent = Number(scenario.is_read) === 0 ? 'Mark as Reviewed' : 'Mark as Unread';
    action.addEventListener('click', async () => {
      try {
        await toggleRead(scenario.id, Number(scenario.is_read) === 0);
        await loadScenarios();
        if (window.updateNotifications) {
          window.updateNotifications();
        }
      } catch (error) {
        console.error('Scenario toggle failed', error);
        setScenarioError(getErrorMessage(error, 'Failed to update scenario status.'));
      }
    });
    actionRow.appendChild(action);

    card.append(meta, title, description, actionRow);
    list.appendChild(card);
  });
}

async function loadScenarios() {
  clearScenarioError();
  const data = await fetchJson('/api/scenarios.php');
  const scenarios = data.scenarios || [];
  renderMetrics(scenarios);
  renderScenarios(scenarios);
}

async function init() {
  try {
    clearScenarioError();
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
      wsManager.subscribe((message) => {
        if (message.type === 'crisis_published') {
          loadScenarios().catch((error) => {
            console.error('Scenario refresh failed', error);
            setScenarioError(getErrorMessage(error, 'Failed to refresh scenarios.'));
          });
        }
      });
    }

    await loadScenarios();
  } catch (error) {
    console.error('Scenario init failed', error);
    setScenarioError(getErrorMessage(error, 'Failed to initialize scenarios.'));
  }
}

init();
