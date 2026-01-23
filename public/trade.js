import { WebSocketManager } from './js/ws-manager.js';
import { fetchJson, getErrorMessage } from './js/api.js';

let currentMode = 'spot'; // 'spot' or 'short'
let currentAction = 'buy'; // 'buy', 'sell' (for spot), 'open', 'close' (for short)

let stocks = [];
let portfolio = null;
let positions = [];
let shorts = [];

async function init() {
    try {
        clearTradeError();
        // Load config and auth
        const config = await fetchJson('/api/config.php');
        const me = await fetchJson('/api/auth_me.php');

        // WS
        if (config.wsPublicUrl && me.user) {
            WebSocketManager.getInstance(me.user.institution_id, config.wsPublicUrl).onStatusChange(status => {
                const el = document.getElementById('ws-status');
                if (el) {
                    el.textContent = status === 'connected' ? '● Live' : '○ Offline';
                    el.className = status === 'connected' ? 'status-live' : 'status-offline';
                }
            });
        }

        // Load Data
        await loadData();
        setupEventListeners();
        updateUI();
    } catch (e) {
        console.error('Trade initialization failed', e);
        if (redirectIfUnauthorized(e)) return;
        setTradeError(getErrorMessage(e, 'Failed to initialize trade screen.'));
    }
}

function setTradeError(message) {
    const el = document.getElementById('tradeError');
    if (!el) return;
    el.textContent = message;
    el.style.display = 'block';
}

function clearTradeError() {
    const el = document.getElementById('tradeError');
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

async function loadData() {
    try {
        clearTradeError();
        const [stocksData, portfolioData] = await Promise.all([
            fetchJson('/api/stocks.php'),
            fetchJson('/api/portfolio.php')
        ]);

        stocks = stocksData.stocks || [];
        portfolio = portfolioData.portfolio;
        positions = portfolioData.positions || [];
        shorts = portfolioData.shorts || [];

        // Populate Stock Select
        const select = document.getElementById('stockSelect');
        // Save current selection if exists
        const currentSelection = select.value;
        select.innerHTML = '';

        if (stocks.length === 0) {
            select.innerHTML = '<option disabled>No stocks available</option>';
        } else {
            stocks.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = `${s.ticker} - ${s.name}`;
                opt.dataset.price = s.current_price || s.initial_price;
                opt.dataset.ticker = s.ticker;
                select.appendChild(opt);
            });
        }

        // Restore selection or default
        if (currentSelection && stocks.find(s => s.id == currentSelection)) {
            select.value = currentSelection;
        }

        if (portfolio) {
            document.getElementById('cashDisplay').textContent = `Cash: €${parseFloat(portfolio.cash_balance).toLocaleString()}`;
        }

        // Handle Query Params (Pre-select)
        const urlParams = new URLSearchParams(window.location.search);
        const tickerParam = urlParams.get('ticker');
        const actionParam = urlParams.get('action'); // buy, sell

        if (tickerParam) {
            const stock = stocks.find(s => s.ticker === tickerParam);
            if (stock) {
                select.value = stock.id;
            }
        }

        if (actionParam && ['buy', 'sell'].includes(actionParam.toLowerCase())) {
             currentAction = actionParam.toLowerCase();
             // Determine mode
             // If short action is passed? usually buy/sell are spot.
             updateActionButtons('buy', 'sell'); // default spot
             document.querySelectorAll('.action-btn').forEach(b => {
                 if (b.dataset.action === currentAction) b.classList.add('active');
                 else b.classList.remove('active');
             });
        }

        updatePreview();

    } catch (e) {
        console.error("Failed to load data", e);
        if (redirectIfUnauthorized(e)) return;
        setTradeError(getErrorMessage(e, 'Failed to load trading data. Please refresh.'));
    }
}

function setupEventListeners() {
    // Mode Tabs
    document.querySelectorAll('.trade-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.trade-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentMode = tab.dataset.mode;

            // Reset Action Buttons based on mode
            if (currentMode === 'spot') {
                updateActionButtons('buy', 'sell');
                currentAction = 'buy';
            } else {
                updateActionButtons('open', 'close'); // Open Short, Close Short
                currentAction = 'open';
            }
            updateUI();
        });
    });

    // Action Buttons
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentAction = btn.dataset.action;
            updateUI();
        });
    });

    // Inputs
    document.getElementById('stockSelect').addEventListener('change', updatePreview);
    document.getElementById('quantityInput').addEventListener('input', updatePreview);
    document.getElementById('durationSelect').addEventListener('change', updatePreview);

    // Form Submit
    document.getElementById('tradeForm').addEventListener('submit', handleTrade);
}

function updateActionButtons(label1, label2) {
    const btn1 = document.getElementById('btnBuy');
    const btn2 = document.getElementById('btnSell');

    btn1.textContent = label1 === 'open' ? 'Open Short' : 'Buy';
    btn1.dataset.action = label1;
    btn2.textContent = label2 === 'close' ? 'Close Short' : 'Sell';
    btn2.dataset.action = label2;

    // Reset active state
    btn1.classList.add('active');
    btn2.classList.remove('active');

    // Update classes for color
    btn1.className = `action-btn active ${label1 === 'buy' || label1 === 'open' ? 'buy' : ''}`;
    btn2.className = `action-btn ${label2 === 'sell' || label2 === 'close' ? 'sell' : ''}`;
}

function updateUI() {
    const durationGroup = document.getElementById('durationGroup');
    if (currentMode === 'short' && currentAction === 'open') {
        durationGroup.style.display = 'block';
        loadDurations();
    } else {
        durationGroup.style.display = 'none';
    }
    updatePreview();
}

let durationsLoaded = false;
async function loadDurations() {
    if (durationsLoaded) return;
    try {
        const data = await fetchJson('/api/config_options.php');
        const select = document.getElementById('durationSelect');
        select.innerHTML = '';
        if (data.durations && data.durations.length > 0) {
            data.durations.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.duration_seconds;
                opt.textContent = d.label;
                select.appendChild(opt);
            });
            // Select first one by default
            select.selectedIndex = 0;
        } else {
             select.innerHTML = '<option value="" disabled>No durations available</option>';
        }
        durationsLoaded = true;
        updatePreview();
    } catch (e) {
        console.error('Failed to load durations', e);
        if (redirectIfUnauthorized(e)) return;
        setTradeError(getErrorMessage(e, 'Failed to load short durations.'));
    }
}

function updatePreview() {
    const stockId = document.getElementById('stockSelect').value;
    const qtyInput = document.getElementById('quantityInput');
    const qty = parseFloat(qtyInput.value); // Allow float? Usually stocks are ints. But JS handles numbers.
    // Ensure numeric
    if (isNaN(qty) || qty < 0) {
         // Maybe just show invalid?
    }

    const stock = stocks.find(s => s.id == stockId);
    const submitBtn = document.getElementById('submitBtn');
    const msg = document.getElementById('validationMsg') || createValidationMsg();
    msg.textContent = '';
    submitBtn.disabled = false;

    if (!stock) return;

    const price = parseFloat(stock.current_price || stock.initial_price);
    const total = price * qty;

    // Display Holdings Info
    displayHoldingsInfo(stockId);

    document.getElementById('previewPrice').textContent = `€${price.toFixed(2)}`;
    document.getElementById('previewTotal').textContent = `€${(total || 0).toFixed(2)}`;

    // Balance Projection & Validation
    if (!portfolio) return;

    const currentCash = parseFloat(portfolio.cash_balance);
    let newBalance = currentCash;
    let isValid = true;
    let errorText = '';

    if (qty <= 0 || isNaN(qty)) {
        isValid = false;
        errorText = "Enter a valid quantity.";
    }

    if (currentMode === 'spot') {
        if (currentAction === 'buy') {
             newBalance -= total;
             if (newBalance < 0) {
                 isValid = false;
                 errorText = `Insufficient funds. You need €${(total - currentCash).toFixed(2)} more.`;
             }
        } else {
             // Sell validation
             newBalance += total;
             const pos = positions.find(p => p.stock_id == stockId);
             const owned = pos ? parseInt(pos.quantity) : 0;
             if (qty > owned) {
                 isValid = false;
                 errorText = `Insufficient holdings. You own ${owned}.`;
             }
        }
    } else if (currentMode === 'short') {
        if (currentAction === 'open') {
             // Validate limits if any
             const shortLimit = parseInt(stock.per_user_short_limit);
             // We need to count ACTIVE shorts for this stock?
             // Or is the limit global per user per stock?
             // The API check is `StockService` or `TradeService`.
             // Assuming limit check happens on backend, but we can hint.
             // Also min quantity check?
        } else {
             // Close Short
             // Find active short positions
             // Logic: We might have multiple short positions for same stock with different expiries.
             // We sum them up for validation?
             const stockShorts = shorts.filter(s => s.stock_id == stockId && s.closed == 0);
             const totalShortQty = stockShorts.reduce((sum, s) => sum + parseInt(s.quantity), 0);

             if (qty > totalShortQty) {
                 isValid = false;
                 errorText = `Cannot close more than open short position (${totalShortQty}).`;
             }
        }
    }

    document.getElementById('previewBalance').textContent = `€${newBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}`;

    if (!isValid) {
        submitBtn.disabled = true;
        msg.textContent = errorText;
        msg.style.color = 'var(--danger-color)';
    } else {
        msg.textContent = '';
    }

    // Expiry
    const expiryRow = document.getElementById('expiryRow');
    if (currentMode === 'short' && currentAction === 'open') {
        expiryRow.style.display = 'flex';
        const duration = parseInt(document.getElementById('durationSelect').value) || 0;
        if (duration > 0) {
            const expiresAt = new Date(Date.now() + duration * 1000);
            document.getElementById('previewExpiry').textContent = expiresAt.toLocaleString();
        } else {
            document.getElementById('previewExpiry').textContent = '-';
        }
    } else {
        expiryRow.style.display = 'none';
    }
}

function displayHoldingsInfo(stockId) {
    // Add or update an element under the Stock Select
    let infoEl = document.getElementById('holdingsInfo');
    if (!infoEl) {
        infoEl = document.createElement('div');
        infoEl.id = 'holdingsInfo';
        infoEl.style.fontSize = '0.85rem';
        infoEl.style.marginTop = '0.5rem';
        infoEl.style.color = 'var(--text-muted)';
        document.getElementById('stockSelect').parentNode.appendChild(infoEl);
    }

    if (currentMode === 'spot') {
        const pos = positions.find(p => p.stock_id == stockId);
        const owned = pos ? pos.quantity : 0;
        infoEl.textContent = `Owned: ${owned}`;
        infoEl.style.color = owned > 0 ? 'var(--success-color)' : 'var(--text-muted)';
    } else {
        // Show Short info
        const stockShorts = shorts.filter(s => s.stock_id == stockId && s.closed == 0);
        const totalShortQty = stockShorts.reduce((sum, s) => sum + parseInt(s.quantity), 0);
        infoEl.textContent = `Open Shorts: ${totalShortQty}`;
        infoEl.style.color = totalShortQty > 0 ? 'var(--warning-color)' : 'var(--text-muted)';
    }
}

function createValidationMsg() {
    const div = document.createElement('div');
    div.id = 'validationMsg';
    div.style.marginTop = '1rem';
    div.style.fontWeight = '500';
    document.getElementById('tradeForm').appendChild(div);
    return div;
}

async function handleTrade(e) {
    e.preventDefault();
    const stockId = document.getElementById('stockSelect').value;
    const qty = document.getElementById('quantityInput').value;
    const duration = document.getElementById('durationSelect').value;

    let endpoint = '';
    // Corrected Payload: always send duration_seconds for shorts
    let payload = { stock_id: stockId, quantity: qty };

    if (currentMode === 'spot') {
        endpoint = currentAction === 'buy' ? '/api/trades_buy.php' : '/api/trades_sell.php';
    } else {
        if (currentAction === 'open') {
            endpoint = '/api/trades_short_open.php';
            payload.duration_seconds = duration; // FIXED: Changed from duration to duration_seconds
        } else {
            endpoint = '/api/trades_short_close.php';
        }
    }

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';

    try {
        const data = await fetchJson(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!data.error) {
            // alert('Trade Successful');
            // Show inline success message or toast
            const msg = document.getElementById('validationMsg');
            msg.textContent = 'Trade Successful!';
            msg.style.color = 'var(--success-color)';

            await loadData(); // Refresh data

            // Reset quantity?
            document.getElementById('quantityInput').value = 1;
            updatePreview();
        }
    } catch (err) {
        console.error(err);
        if (redirectIfUnauthorized(err)) return;
        const msg = document.getElementById('validationMsg');
        msg.textContent = `Trade Failed: ${getErrorMessage(err, 'Network or Server Error')}`;
        msg.style.color = 'var(--danger-color)';
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Trade';
    }
}

init();
