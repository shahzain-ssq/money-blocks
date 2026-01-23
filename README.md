# Money Blocks Trading Portal

A trading simulation platform with institution-scoped events and stock market mechanics.

## Architecture

- **Backend**: PHP 8.x (API)
- **Frontend**: Vanilla HTML/JS (SPA-like navigation)
- **Database**: MySQL/MariaDB (Schema in `sql/schema.sql`).
- **Real-time**: Python WebSocket Server (`websocket/server.py`)

## Setup

### 1. Database
Import `sql/schema.sql` into your MySQL database.
Configure database connection in `config/env.php` (values come from environment variables).

**Required environment variables:**
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`

**Migrations:**
For updates to an existing database:
1.  Check `sql/migrations/` for new SQL files.
2.  Run the files in chronological order against your database (e.g., via phpMyAdmin).

### 2. Web Server
Serve the repository root.
- **Apache**: `.htaccess` is provided for URL rewriting.
- **PHP Built-in**: `php -S localhost:8000` (Router handled by `public/index.php`).

### 3. WebSocket Server (Required for Charts & Live Updates)
The Python WebSocket server broadcasts price updates and crisis events.

**Requirements:**
- Python 3.11+
- `websockets` library
- `aiohttp` library
- `python-dotenv` (optional)

**Installation:**
```bash
pip install -r requirements.txt
```

**Running:**
```bash
# Set environment variables (or use .env file)
export WS_ADMIN_TOKEN="secret_admin_token"
export WS_ALLOWED_ORIGINS="http://localhost:8000"

# Run server
python3 websocket/server.py
```

**Troubleshooting:**
- **Chart not loading?** Ensure the WebSocket server is running and the `wsPublicUrl` in `api/config.php` matches the server address (e.g., `ws://localhost:8787`).
- **Offline status?** Check browser console for connection errors. Ensure `WS_ALLOWED_ORIGINS` includes your web server's origin.

## Sanity Checklist (Manual Verification)

1.  **Login**: Verify "Login with Institution" button is visible and modal works.
2.  **Charts**: Visit "Markets & Charts". Ensure candlestick chart loads and populates with historical data. Verify live updates (green dot).
3.  **Trading**:
    -   Try to buy more stock than you can afford (should show error).
    -   Try to sell stock you don't own (should show error).
    -   Open a short position with a valid quantity and duration.
    -   Verify portfolio holdings (Owned/Shorts) update after trade.
4.  **Admin Panel**:
    -   **Participants**: Promote a user to Manager. Verify "Manager" badge appears.
    -   **Stocks**: Edit a stock's price/name. Verify changes persist. Search for a stock.
    -   **Scenarios**: Add a new scenario. Verify it appears in the list and dashboard.

## Development

- **Frontend**: Edit files in `public/`.
- **API**: Edit files in `api/` and classes in `src/`.
- **Auth**: Google OAuth configured via `institutions` table.
- **Charts**: `public/chart.html` loads lightweight-charts from a pinned CDN version (`lightweight-charts@5.0.1`) to avoid breaking API changes.

## DB Sanity Check

Run a non-destructive check against your configured MySQL/MariaDB instance:

```bash
php scripts/db_sanity_check.php
```

The script verifies core tables, runs basic SELECT/INSERT/UPDATE/DELETE logic inside a transaction, and exits non-zero on failure.

## License
Proprietary.
