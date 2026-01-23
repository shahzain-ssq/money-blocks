<?php
require __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/StockService.php';
require_once __DIR__ . '/../src/BroadcastService.php';

initApiRequest();

$user = Auth::requireAuth();
requireManager($user);
$method = $_SERVER['REQUEST_METHOD'] ?? 'POST';

if ($method === 'GET') {
    $stockId = (int)($_GET['stock_id'] ?? 0);
    if ($stockId <= 0) {
        jsonError('stock_required', 'Stock ID is required.', 422);
    }
    $stock = StockService::latestPrice($stockId, (int)$user['institution_id']);
    if (!$stock) {
        jsonError('not_found', 'Stock not found.', 404);
    }
    jsonResponse(['ok' => true, 'stock' => $stock]);
}

$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
$stockId = (int)($input['stock_id'] ?? 0);
$price = (float)($input['price'] ?? 0);
if ($stockId <= 0 || $price <= 0) {
    jsonError('invalid_input', 'Stock ID and price are required.', 422);
}
try {
    StockService::updatePrice($stockId, $price, (int)$user['institution_id']);
} catch (RuntimeException $e) {
    jsonError('stock_not_found', 'Stock not found.', 404);
}
BroadcastService::send([
    'type' => 'price_update',
    'institution_id' => (int)$user['institution_id'],
    'stock_id' => $stockId,
    'price' => $price,
]);
jsonResponse(['ok' => true, 'price' => $price]);
