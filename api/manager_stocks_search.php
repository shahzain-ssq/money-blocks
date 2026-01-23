<?php
require __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/StockService.php';

initApiRequest();

$user = Auth::requireAuth();
requireManager($user);
$query = trim($_GET['q'] ?? '');
if ($query === '') {
    jsonResponse(['ok' => true, 'stocks' => []]);
}
jsonResponse(['ok' => true, 'stocks' => StockService::searchStocks((int)$user['institution_id'], $query)]);
