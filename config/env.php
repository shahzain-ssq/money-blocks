<?php
return [
    'db_host' => getenv('DB_HOST') ?: '127.0.0.1',
    'db_name' => getenv('DB_NAME') ?: 'finportal',
    'db_user' => getenv('DB_USER') ?: 'root',
    'db_pass' => getenv('DB_PASS') ?: '',
    'session_name' => getenv('SESSION_NAME') ?: 'finportal_session',
    'ws_admin_token' => getenv('WS_ADMIN_TOKEN') ?: 'change-me',
    'ws_broadcast_url' => getenv('WS_BROADCAST_URL') ?: 'http://localhost:8766/admin/broadcast',
];
