# Money Blocks Trading Portal

A trading simulation platform with institution-scoped events and stock market mechanics.

## Architecture

- **Backend**: PHP 8.x (API)
- **Frontend**: Vanilla HTML/JS (SPA-like navigation)
- **Database**: MySQL/MariaDB (Schema in `sql/schema.sql`)
- **Real-time**: Python WebSocket Server (`websocket/server.py`)

## Setup

### 1. Database
Import `sql/schema.sql` into your MySQL database.
Configure database connection in `config/env.php`.

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

## Development

- **Frontend**: Edit files in `public/`.
- **API**: Edit files in `api/` and classes in `src/`.
- **Auth**: Google OAuth configured via `institutions` table.

## License
Proprietary.
