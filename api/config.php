<?php
require __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';

initApiRequest();

$config = require __DIR__ . '/../config/env.php';

jsonResponse([
    'wsPublicUrl' => $config['ws_public_url'] ?? null,
]);
