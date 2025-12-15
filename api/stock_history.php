<?php
require __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/StockService.php';

$user = Auth::requireAuth();
$stockId = (int)($_GET['stock_id'] ?? 0);
$limit = (int)($_GET['limit'] ?? 30);
if ($stockId <= 0) {
    jsonResponse(['error' => 'stock_required'], 422);
}
try {
    $prices = StockService::history($stockId, (int)$user['institution_id'], $limit > 0 ? $limit : 30);
    jsonResponse(['ok' => true, 'prices' => $prices]);
} catch (RuntimeException $e) {
    jsonResponse(['error' => 'not_found'], 404);
}
