import { WebSocketManager } from './js/ws-manager.js';
import { fetchJson, getErrorMessage } from './js/api.js';

let chart;
let candleSeries;
let chartContainer;
let resizeObserver;
let pendingCandleData = null;
let pendingFitContent = false;
let currentStockId = null;
let currentCandles = []; // Store aggregated candles
let lastTickTime = 0;
const isDevEnv = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

function logDebug(message, ...args) {
    if (!isDevEnv) return;
    console.debug(`[charts] ${message}`, ...args);
}

async function init() {
    try {
        clearChartError();
        const config = await fetchJson('/api/config.php');
        const me = await fetchJson('/api/auth_me.php');

    const chartHeader = document.querySelector('.chart-header');
    const loadingIndicator = document.createElement('span');
    loadingIndicator.id = 'chart-loading';
    loadingIndicator.style.marginLeft = '10px';
    loadingIndicator.style.fontSize = '0.8rem';
    loadingIndicator.style.color = '#94a3b8';
    chartHeader.appendChild(loadingIndicator);

    // Init WebSocket
    if (config.wsPublicUrl && me.user) {
        const wsManager = WebSocketManager.getInstance(me.user.institution_id, config.wsPublicUrl);
        wsManager.onStatusChange((status) => {
             const el = document.getElementById('ws-status');
             if(el) {
                 el.textContent = status === 'connected' ? '● Live' : '○ Offline';
                 el.className = status === 'connected' ? 'status-live' : 'status-offline';
             }
        });

        wsManager.subscribe((msg) => {
            if (msg.type === 'price_update' && msg.stock_id == currentStockId) {
                updateChart(msg.price, msg.timestamp || (Date.now() / 1000));
            }
        });
    }

        initChart();
        loadWatchlist();
    } catch (e) {
        console.error('Chart initialization failed', e);
        if (redirectIfUnauthorized(e)) return;
        setChartError(getErrorMessage(e, 'Failed to initialize charts.'));
    }
}

function setChartError(message) {
    const el = document.getElementById('chartError');
    if (!el) return;
    el.textContent = message;
    el.style.display = 'block';
}

function clearChartError() {
    const el = document.getElementById('chartError');
    if (!el) return;
    el.textContent = '';
    el.style.display = 'none';
}

function redirectIfUnauthorized(err) {
    if (err?.status === 401 || err?.code === 'unauthorized') {
        window.location = '/';
        return true;
    }
    return false;
}

async function loadWatchlist() {
    try {
        clearChartError();
        const data = await fetchJson('/api/stocks.php');
        const list = document.getElementById('watchlist');
        list.innerHTML = '';

        if (!data.stocks || data.stocks.length === 0) {
            list.innerHTML = '<div style="padding:1rem;">No stocks found.</div>';
            return;
        }

        data.stocks.forEach(stock => {
            const div = document.createElement('div');
            div.className = 'watchlist-item';
            div.dataset.id = stock.id;
            const price = parseFloat(stock.current_price || stock.initial_price).toFixed(2);
            div.innerHTML = `<strong>${stock.ticker}</strong><br><small>${stock.name}</small><br><span class="price">€${price}</span>`;
            div.onclick = () => selectStock(stock);
            list.appendChild(div);
        });

        if (data.stocks.length > 0) {
            selectStock(data.stocks[0]);
        }
    } catch (e) {
        console.error("Failed to load watchlist", e);
        document.getElementById('watchlist').innerHTML = '<div style="padding:1rem;">Failed to load stocks.</div>';
        if (redirectIfUnauthorized(e)) return;
        setChartError(getErrorMessage(e, 'Failed to load stocks.'));
    }
}

function initChart() {
    chartContainer = document.getElementById('tv-chart');
    if (!chartContainer) return;

    if (!resizeObserver) {
        resizeObserver = new ResizeObserver(entries => {
            if (entries.length === 0 || entries[0].target !== chartContainer) { return; }
            const newRect = entries[0].contentRect;
            if (!chart) {
                if (newRect.width > 0 && newRect.height > 0) {
                    tryCreateChart();
                }
                return;
            }
            chart.applyOptions({ height: newRect.height, width: newRect.width });
        });
    }
    resizeObserver.observe(chartContainer);
    if (!tryCreateChart()) {
        logDebug('Chart container size is zero, waiting for resize to initialize.');
    }
}

function tryCreateChart() {
    if (chart) return true;
    if (!chartContainer) return false;
    const width = chartContainer.clientWidth;
    const height = chartContainer.clientHeight;
    if (width === 0 || height === 0) return false;

    logDebug('Creating chart instance.', { width, height });
    chart = LightweightCharts.createChart(chartContainer, {
        width,
        height,
        layout: {
            backgroundColor: '#1e293b',
            textColor: '#94a3b8',
        },
        grid: {
            vertLines: { color: '#334155' },
            horzLines: { color: '#334155' },
        },
        timeScale: {
            timeVisible: true,
            secondsVisible: false,
        },
    });

    // Switch to Candlestick Series
    candleSeries = chart.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
    });
    logDebug('Candlestick series created.');
    flushPendingCandleData();
    return true;
}

function setCandlestickData(data, options = {}) {
    if (!candleSeries) {
        console.warn('[charts] Candlestick series not ready. Deferring setData.', options);
        pendingCandleData = data;
        pendingFitContent = Boolean(options.fitContent);
        return false;
    }
    logDebug('Setting candlestick data.', { count: data.length, reason: options.reason });
    candleSeries.setData(data);
    if (options.fitContent && chart) {
        chart.timeScale().fitContent();
    }
    return true;
}

function flushPendingCandleData() {
    if (!candleSeries || !pendingCandleData) return;
    logDebug('Applying deferred candlestick data.', { count: pendingCandleData.length });
    candleSeries.setData(pendingCandleData);
    if (pendingFitContent && chart) {
        chart.timeScale().fitContent();
    }
    pendingCandleData = null;
    pendingFitContent = false;
}

function destroyChart() {
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
    if (chart) {
        chart.remove();
        chart = null;
    }
    candleSeries = null;
    pendingCandleData = null;
    pendingFitContent = false;
}

async function selectStock(stock) {
    if (currentStockId === stock.id) return;
    currentStockId = stock.id;
    document.getElementById('selectedStockTitle').textContent = `${stock.ticker} - ${stock.name}`;

    // Highlight item
    document.querySelectorAll('.watchlist-item').forEach(el => el.classList.remove('active'));
    const activeItem = document.querySelector(`.watchlist-item[data-id="${stock.id}"]`);
    if (activeItem) activeItem.classList.add('active');

    const loader = document.getElementById('chart-loading');
    if (loader) loader.textContent = 'Loading...';

    // Fetch History
    try {
        // Request more data points to build candles
        const data = await fetchJson(`/api/stock_history.php?stock_id=${stock.id}&limit=1000`);
        logDebug('History fetch complete.', { stockId: stock.id, count: data.prices?.length || 0 });

        if (loader) loader.textContent = '';

        if (data.prices && data.prices.length > 0) {
            // Transform data for lightweight charts
            // API returns { price: number, created_at: string } sorted DESC (newest first)
            // We need ASC (oldest first)
            const sorted = data.prices.reverse().map(p => {
                const priceValue = Number.parseFloat(p.price);
                const parsedTime = parseDate(p.created_at);
                return {
                    time: parsedTime,
                    value: priceValue
                };
            }).filter(point => Number.isFinite(point.value) && Number.isFinite(point.time));

            // Aggregate into candles (1 minute intervals)
            currentCandles = aggregateToCandles(sorted, 60);

            if (currentCandles.length > 0) {
                setCandlestickData(currentCandles, { fitContent: true, reason: 'initial-load' });
                // Update lastTickTime
                lastTickTime = currentCandles[currentCandles.length - 1].time;
            } else {
                setCandlestickData([], { reason: 'empty-aggregate' });
            }
        } else {
             setCandlestickData([], { reason: 'no-history' });
             if (loader) loader.textContent = 'No data';
        }
    } catch (e) {
        console.error("Failed to load history", e);
        if (loader) loader.textContent = 'Error loading data';
        if (redirectIfUnauthorized(e)) return;
        setChartError(getErrorMessage(e, 'Failed to load chart history.'));
    }
}

function parseDate(dateStr) {
    // Handle MySQL DATETIME format "YYYY-MM-DD HH:MM:SS" (stored in UTC).
    if (typeof dateStr === 'string' && dateStr.indexOf('T') === -1) {
        return new Date(dateStr.replace(' ', 'T') + 'Z').getTime() / 1000;
    }
    return new Date(dateStr).getTime() / 1000;
}

function aggregateToCandles(ticks, intervalSeconds) {
    if (!ticks || ticks.length === 0) return [];

    const candles = [];
    let currentCandle = null;
    let periodStart = 0;

    ticks.forEach(tick => {
        const tickTime = tick.time;
        // Align time to interval bucket
        const bucket = Math.floor(tickTime / intervalSeconds) * intervalSeconds;

        if (currentCandle && bucket === periodStart) {
            // Update current candle
            currentCandle.high = Math.max(currentCandle.high, tick.value);
            currentCandle.low = Math.min(currentCandle.low, tick.value);
            currentCandle.close = tick.value;
        } else {
            // Close previous candle and start new one
            if (currentCandle) {
                candles.push(currentCandle);
            }
            periodStart = bucket;
            currentCandle = {
                time: periodStart,
                open: tick.value,
                high: tick.value,
                low: tick.value,
                close: tick.value
            };
        }
    });

    // Push the last one
    if (currentCandle) {
        candles.push(currentCandle);
    }

    return candles;
}

function updateChart(price, timestamp) {
    if (!candleSeries) {
        console.warn('[charts] Candlestick series not ready. Skipping update.');
        return;
    }

    // Use provided timestamp or now
    // If timestamp is not provided from WS, use Date.now()
    const timestampSeconds = Number(timestamp);
    const now = Number.isFinite(timestampSeconds) ? timestampSeconds : (Date.now() / 1000);
    const priceFloat = parseFloat(price);
    if (!Number.isFinite(priceFloat)) {
        console.warn('[charts] Invalid price update received.', price);
        return;
    }

    // 1-minute interval
    const intervalSeconds = 60;
    const bucket = Math.floor(now / intervalSeconds) * intervalSeconds;

    // Check if we need to update the last candle or start a new one
    // We need to look at the last candle in data
    // But lightweight charts doesn't give us easy access to "last candle data" from the series object directly
    // So we maintain `currentCandles` state or at least the last one.

    // Actually, `candleSeries.update(candle)` updates the candle with matching time, or appends if new time.

    // We need to know the state of the candle for 'bucket'.
    // Since we aggregated 1000 ticks, we might have a candle for 'bucket' already if it's recent.
    // OR we might be starting a fresh one.

    // Limitation: If we just refreshed, we have `currentCandles`.
    // Let's rely on `candleSeries.update` logic:
    // If we pass a candle with same time, it replaces it.
    // But we need to know the OPEN, HIGH, LOW to update it correctly.
    // We can't query the chart for current values easily.

    // Workaround: We track the "active candle" in memory.
    let lastCandle = currentCandles.length > 0 ? currentCandles[currentCandles.length - 1] : null;

    if (lastCandle && lastCandle.time === bucket) {
        // Update existing candle
        lastCandle.high = Math.max(lastCandle.high, priceFloat);
        lastCandle.low = Math.min(lastCandle.low, priceFloat);
        lastCandle.close = priceFloat;
        candleSeries.update(lastCandle);
    } else {
        // New candle
        const newCandle = {
            time: bucket,
            open: priceFloat,
            high: priceFloat,
            low: priceFloat,
            close: priceFloat
        };
        currentCandles.push(newCandle);
        candleSeries.update(newCandle);
        lastTickTime = bucket;
    }
}

window.addEventListener('beforeunload', destroyChart);
init();
