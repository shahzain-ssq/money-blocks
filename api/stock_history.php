<?php
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/StockService.php';

initApiRequest();

$user = Auth::requireAuth();
$stockId = (int)($_GET['stock_id'] ?? 0);
// Default to 30 and clamp to avoid excessive history fetches
$rawLimit = (int)($_GET['limit'] ?? 30);
$limit = max(1, min($rawLimit, 500));
if ($stockId <= 0) {
    jsonError('stock_required', 'Stock ID is required.', 422);
}
try {
    $prices = StockService::history($stockId, (int)$user['institution_id'], $limit);
    jsonResponse(['prices' => $prices]);
} catch (RuntimeException $e) {
    jsonError('not_found', 'Stock not found.', 404);
}
