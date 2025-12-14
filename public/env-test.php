<?php
require __DIR__ . '/../bootstrap.php';

$keys = [
    'DB_HOST',
    'DB_NAME',
    'DB_USER',
    'DB_PASS',
    'ADMIN_TOKEN',
    'WS_ADMIN_TOKEN',
];

header('Content-Type: text/plain');
foreach ($keys as $key) {
    $status = getenv($key) === false ? '[NOT SET]' : '[SET]';
    echo $key . ': ' . $status . "\n";
}
