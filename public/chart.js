import { WebSocketManager } from './js/ws-manager.js';

let chart;
let candleSeries;
let currentStockId = null;

async function init() {
    const config = await fetch('/api/config.php').then(r => r.json());
    const me = await fetch('/api/auth_me.php').then(r => r.json());

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
                // Update chart
                updateChart(msg.price);
            }
        });
    }

    loadWatchlist();
    initChart();
}

async function loadWatchlist() {
    const res = await fetch('/api/stocks.php');
    const data = await res.json();
    const list = document.getElementById('watchlist');
    list.innerHTML = '';

    data.stocks.forEach(stock => {
        const div = document.createElement('div');
        div.className = 'watchlist-item';
        div.innerHTML = `<strong>${stock.ticker}</strong><br><small>${stock.name}</small><br><span class="price">${stock.current_price || stock.initial_price}</span>`;
        div.onclick = () => selectStock(stock);
        list.appendChild(div);
    });

    if (data.stocks.length > 0) {
        selectStock(data.stocks[0]);
    }
}

function initChart() {
    const chartContainer = document.getElementById('tv-chart');
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
            secondsVisible: true,
        },
    });

    // Resize observer
    new ResizeObserver(entries => {
        if (entries.length === 0 || entries[0].target !== chartContainer) { return; }
        const newRect = entries[0].contentRect;
        chart.applyOptions({ height: newRect.height, width: newRect.width });
    }).observe(chartContainer);

    candleSeries = chart.addAreaSeries({
        topColor: 'rgba(38, 198, 218, 0.56)',
        bottomColor: 'rgba(38, 198, 218, 0.04)',
        lineColor: 'rgba(38, 198, 218, 1)',
        lineWidth: 2,
    });
}

async function selectStock(stock) {
    currentStockId = stock.id;
    document.getElementById('selectedStockTitle').textContent = `${stock.ticker} - ${stock.name}`;

    // Highlight item
    document.querySelectorAll('.watchlist-item').forEach(el => el.classList.remove('active'));
    // (Ideally find the specific element, skipping for brevity)

    // Fetch History
    try {
        const res = await fetch(`/api/stock_history.php?stock_id=${stock.id}&limit=100`);
        const data = await res.json();

        if (data.prices) {
            // Transform data for lightweight charts
            // API returns { price: number, created_at: string } sorted DESC
            const sorted = data.prices.reverse().map(p => ({
                time: new Date(p.created_at).getTime() / 1000,
                value: parseFloat(p.price)
            }));

            candleSeries.setData(sorted);
            chart.timeScale().fitContent();
        }
    } catch (e) {
        console.error("Failed to load history", e);
    }
}

function updateChart(price) {
    if (!candleSeries) return;
    candleSeries.update({
        time: Math.floor(Date.now() / 1000),
        value: parseFloat(price)
    });
}

init();
