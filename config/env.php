<?php
return [
    'db_host' => getenv('DB_HOST') ?: '127.0.0.1',
    'db_port' => getenv('DB_PORT') ?: '3306',
    'db_name' => getenv('DB_NAME') ?: 'finportal',
    'db_user' => getenv('DB_USER') ?: 'root',
    'db_pass' => getenv('DB_PASSWORD') ?: (getenv('DB_PASS') ?: ''),
    'session_name' => getenv('SESSION_NAME') ?: 'finportal_session',
    'session_domain' => trim(getenv('SESSION_DOMAIN') ?: ''),
    'ws_public_url' => getenv('WS_PUBLIC_URL') ?: '',
    // No insecure default: require WS_ADMIN_TOKEN to be set in production.
    'ws_admin_token' => getenv('WS_ADMIN_TOKEN') ?: '',
    'ws_broadcast_url' => getenv('WS_BROADCAST_URL') ?: 'http://127.0.0.1:8766/admin/broadcast',
    'rate_limit_backend' => getenv('RATE_LIMIT_BACKEND') ?: 'db',
    'redis_host' => getenv('REDIS_HOST') ?: '127.0.0.1',
    'redis_port' => getenv('REDIS_PORT') ?: 6379,
    'redis_timeout' => getenv('REDIS_TIMEOUT') ?: 1.5,
    'redis_auth' => getenv('REDIS_AUTH') ?: null,
    'redis_db' => getenv('REDIS_DB') ?: null,
];
