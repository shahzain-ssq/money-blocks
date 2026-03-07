import { WebSocketManager } from './js/ws-manager.js';
import { fetchJson, getErrorMessage } from './js/api.js';
import {
  createEmptyState,
  escapeHtml,
  formatCurrency,
  formatDateTime,
  formatPercent,
  requireUser,
  updateWsStatus,
} from './js/ui.js';

let chart;
let candleSeries;
let chartContainer;
let resizeObserver;
let pendingCandleData = null;
let pendingFitContent = false;
let currentStock = null;
let currentCandles = [];
let selectionVersion = 0;

function setChartError(message) {
  const el = document.getElementById('chartError');
  if (!el) {
    return;
  }
  el.textContent = message;
  el.style.display = message ? 'block' : 'none';
}

function clearChartError() {
  setChartError('');
}

function updateSelectedStockSummary(stock) {
  currentStock = stock;
  document.getElementById('selectedStockTitle').textContent = stock ? `${stock.ticker} - ${stock.name}` : 'Select a Stock';
  document.getElementById('selectedStockMeta').textContent = stock
    ? 'Live prices update automatically while the websocket connection is active.'
    : 'Choose an instrument from the watchlist to load its chart.';
  document.getElementById('selectedStockPrice').textContent = stock ? formatCurrency(stock.current_price ?? stock.initial_price) : '-';
  document.getElementById('selectedStockChange').textContent = stock
    ? `${formatCurrency(stock.change || 0)} (${formatPercent(stock.change_pct || 0)})`
    : '-';
  const changeValue = Number(stock?.change || 0);
  document.getElementById('selectedStockChange').className = changeValue > 0 ? 'positive' : changeValue < 0 ? 'negative' : 'muted';
  document.getElementById('selectedStockUpdated').textContent = stock?.updated_at ? formatDateTime(stock.updated_at) : 'Awaiting tick';
}

function initChart() {
  chartContainer = document.getElementById('tv-chart');
  if (!chartContainer) {
    return;
  }

  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) {
      return;
    }

    if (!chart) {
      tryCreateChart();
      return;
    }

    chart.applyOptions({
      width: entry.contentRect.width,
      height: Math.max(entry.contentRect.height, 320),
    });
  });

  resizeObserver.observe(chartContainer);
  tryCreateChart();
}

function tryCreateChart() {
  if (chart || !chartContainer) {
    return;
  }

  const width = chartContainer.clientWidth;
  const height = Math.max(chartContainer.clientHeight, 320);
  if (!width || !height) {
    return;
  }

  chart = LightweightCharts.createChart(chartContainer, {
    width,
    height,
    layout: {
      background: { color: '#0d1a31' },
      textColor: '#97a8c9',
    },
    grid: {
      vertLines: { color: 'rgba(132, 157, 210, 0.14)' },
      horzLines: { color: 'rgba(132, 157, 210, 0.14)' },
    },
    rightPriceScale: {
      borderColor: 'rgba(132, 157, 210, 0.16)',
    },
    timeScale: {
      borderColor: 'rgba(132, 157, 210, 0.16)',
      timeVisible: true,
      secondsVisible: false,
    },
  });

  candleSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
    upColor: '#2fd1a3',
    downColor: '#f76f8e',
    wickUpColor: '#2fd1a3',
    wickDownColor: '#f76f8e',
    borderVisible: false,
  });

  if (pendingCandleData) {
    candleSeries.setData(pendingCandleData);
    if (pendingFitContent) {
      chart.timeScale().fitContent();
    }
    pendingCandleData = null;
    pendingFitContent = false;
  }
}

function setCandlestickData(data, fitContent = false) {
  if (!candleSeries) {
    pendingCandleData = data;
    pendingFitContent = fitContent;
    return;
  }

  candleSeries.setData(data);
  if (fitContent) {
    chart.timeScale().fitContent();
  }
}

function parseDate(value) {
  if (typeof value === 'string' && !value.includes('T')) {
    return new Date(value.replace(' ', 'T') + 'Z').getTime() / 1000;
  }
  return new Date(value).getTime() / 1000;
}

function aggregateToCandles(ticks, intervalSeconds) {
  if (!ticks.length) {
    return [];
  }

  const candles = [];
  let currentCandle = null;

  ticks.forEach((tick) => {
    const bucket = Math.floor(tick.time / intervalSeconds) * intervalSeconds;
    if (currentCandle && currentCandle.time === bucket) {
      currentCandle.high = Math.max(currentCandle.high, tick.value);
      currentCandle.low = Math.min(currentCandle.low, tick.value);
      currentCandle.close = tick.value;
      return;
    }

    if (currentCandle) {
      candles.push(currentCandle);
    }

    currentCandle = {
      time: bucket,
      open: tick.value,
      high: tick.value,
      low: tick.value,
      close: tick.value,
    };
  });

  if (currentCandle) {
    candles.push(currentCandle);
  }

  return candles;
}

async function selectStock(stock) {
  if (!stock) {
    return;
  }

  const localSelectedId = Number(stock.id);
  selectionVersion += 1;
  const localSelectionVersion = selectionVersion;

  updateSelectedStockSummary(stock);
  document.querySelectorAll('.watchlist-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.id === String(stock.id));
  });
  currentCandles = [];
  setCandlestickData([], true);

  try {
    clearChartError();
    const data = await fetchJson(`/api/stock_history.php?stock_id=${stock.id}&limit=500`);
    const sorted = (data.prices || [])
      .slice()
      .reverse()
      .map((pricePoint) => ({
        time: parseDate(pricePoint.created_at),
        value: Number(pricePoint.price),
      }))
      .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value));

    if (localSelectionVersion !== selectionVersion || Number(currentStock?.id) !== localSelectedId) {
      return;
    }

    currentCandles = aggregateToCandles(sorted, 60);
    setCandlestickData(currentCandles, true);
  } catch (error) {
    console.error('Failed to load history', error);
    setChartError(getErrorMessage(error, 'Failed to load chart history.'));
  }
}

function renderWatchlist(stocks) {
  const list = document.getElementById('watchlist');
  list.innerHTML = '';

  if (!stocks.length) {
    list.appendChild(createEmptyState('No stocks found.', 'Once an administrator adds instruments they will appear here.'));
    return;
  }

  stocks.forEach((stock) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'watchlist-item';
    item.dataset.id = String(stock.id);

    const details = document.createElement('div');
    details.className = 'stack';
    details.innerHTML = `
      <strong>${escapeHtml(stock.ticker)}</strong>
      <span class="subtext">${escapeHtml(stock.name)}</span>
    `;

    const pricing = document.createElement('div');
    pricing.className = 'stack';
    pricing.style.alignItems = 'flex-end';
    pricing.innerHTML = `
      <strong class="watchlist-price">${formatCurrency(stock.current_price ?? stock.initial_price)}</strong>
      <span class="${Number(stock.change || 0) >= 0 ? 'positive' : 'negative'}">${formatPercent(stock.change_pct || 0)}</span>
    `;

    item.append(details, pricing);
    item.addEventListener('click', () => selectStock(stock));
    list.appendChild(item);
  });

  selectStock(currentStock ? stocks.find((stock) => stock.id === currentStock.id) || stocks[0] : stocks[0]);
}

function updateChart(price, timestamp) {
  if (!candleSeries || !currentStock) {
    return;
  }

  const numericPrice = Number(price);
  const time = Number.isFinite(Number(timestamp)) ? Number(timestamp) : Date.now() / 1000;
  if (!Number.isFinite(numericPrice)) {
    return;
  }
  const baselinePrice = Number(currentStock.previous_price ?? currentStock.initial_price ?? numericPrice);

  const bucket = Math.floor(time / 60) * 60;
  const lastCandle = currentCandles[currentCandles.length - 1];

  if (lastCandle && lastCandle.time === bucket) {
    lastCandle.high = Math.max(lastCandle.high, numericPrice);
    lastCandle.low = Math.min(lastCandle.low, numericPrice);
    lastCandle.close = numericPrice;
    candleSeries.update(lastCandle);
  } else {
    const newCandle = {
      time: bucket,
      open: numericPrice,
      high: numericPrice,
      low: numericPrice,
      close: numericPrice,
    };
    currentCandles.push(newCandle);
    candleSeries.update(newCandle);
  }

  currentStock = {
    ...currentStock,
    current_price: numericPrice,
    change: numericPrice - baselinePrice,
    change_pct: baselinePrice
      ? ((numericPrice - baselinePrice) / baselinePrice) * 100
      : 0,
    updated_at: new Date(time * 1000).toISOString(),
  };
  updateSelectedStockSummary(currentStock);
}

function destroyChart() {
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (chart) {
    chart.remove();
    chart = null;
  }
  candleSeries = null;
}

async function init() {
  try {
    clearChartError();
    updateWsStatus('ws-status', 'disconnected');

    const [config, user] = await Promise.all([
      fetchJson('/api/config.php'),
      requireUser(),
    ]);
    if (!user) {
      return;
    }

    initChart();
    const data = await fetchJson('/api/stocks.php');
    renderWatchlist(data.stocks || []);

    if (config.wsPublicUrl) {
      const wsManager = WebSocketManager.getInstance(user.institution_id, config.wsPublicUrl);
      wsManager.onStatusChange((status) => updateWsStatus('ws-status', status));
      wsManager.subscribe((message) => {
        if (message.type === 'price_update' && currentStock && Number(message.stock_id) === Number(currentStock.id)) {
          updateChart(message.price, message.timestamp);
        }
      });
    }
  } catch (error) {
    console.error('Chart initialization failed', error);
    setChartError(getErrorMessage(error, 'Failed to initialize charts.'));
  }
}

window.addEventListener('beforeunload', destroyChart);
init();
