import { WebSocketManager } from './js/ws-manager.js';

let chart;
let candleSeries;
let currentStockId = null;
let currentCandles = []; // Store aggregated candles
let lastTickTime = 0;

async function init() {
    const config = await fetch('/api/config.php').then(r => r.json());
    const me = await fetch('/api/auth_me.php').then(r => r.json());

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

    loadWatchlist();
    initChart();
}

async function loadWatchlist() {
    try {
        const res = await fetch('/api/stocks.php');
        const data = await res.json();
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
    }
}

function initChart() {
    const chartContainer = document.getElementById('tv-chart');
    if (!chartContainer) return;

    chart = LightweightCharts.createChart(chartContainer, {
        width: chartContainer.clientWidth,
        height: chartContainer.clientHeight,
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

    // Resize observer
    new ResizeObserver(entries => {
        if (entries.length === 0 || entries[0].target !== chartContainer) { return; }
        const newRect = entries[0].contentRect;
        chart.applyOptions({ height: newRect.height, width: newRect.width });
    }).observe(chartContainer);

    // Switch to Candlestick Series
    candleSeries = chart.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
    });
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
        const res = await fetch(`/api/stock_history.php?stock_id=${stock.id}&limit=1000`);
        const data = await res.json();

        if (loader) loader.textContent = '';

        if (data.prices && data.prices.length > 0) {
            // Transform data for lightweight charts
            // API returns { price: number, created_at: string } sorted DESC (newest first)
            // We need ASC (oldest first)
            const sorted = data.prices.reverse().map(p => ({
                time: parseDate(p.created_at),
                value: parseFloat(p.price)
            }));

            // Aggregate into candles (1 minute intervals)
            currentCandles = aggregateToCandles(sorted, 60);

            if (currentCandles.length > 0) {
                candleSeries.setData(currentCandles);
                chart.timeScale().fitContent();
                // Update lastTickTime
                lastTickTime = currentCandles[currentCandles.length - 1].time;
            } else {
                candleSeries.setData([]);
            }
        } else {
             candleSeries.setData([]);
             if (loader) loader.textContent = 'No data';
        }
    } catch (e) {
        console.error("Failed to load history", e);
        if (loader) loader.textContent = 'Error loading data';
    }
}

function parseDate(dateStr) {
    // Handle MySQL/SQLite format "YYYY-MM-DD HH:MM:SS" -> ISO "YYYY-MM-DDTHH:MM:SS"
    // Also handle possible already ISO
    if (typeof dateStr === 'string' && dateStr.indexOf('T') === -1) {
        return new Date(dateStr.replace(' ', 'T')).getTime() / 1000;
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
    if (!candleSeries) return;

    // Use provided timestamp or now
    // If timestamp is not provided from WS, use Date.now()
    const now = timestamp || (Date.now() / 1000);
    const priceFloat = parseFloat(price);

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

init();
