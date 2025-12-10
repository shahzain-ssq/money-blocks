<?php
require_once __DIR__ . '/../src/Helpers.php';

$config = require __DIR__ . '/../config/env.php';

jsonResponse([
    'wsPublicUrl' => $config['ws_public_url'] ?? null,
]);
