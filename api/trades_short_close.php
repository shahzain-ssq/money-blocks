<?php
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/TradeService.php';
require_once __DIR__ . '/../src/BroadcastService.php';

$user = Auth::requireAuth();
$input = json_decode(file_get_contents('php://input'), true);

$stockId = (int)($input['stock_id'] ?? 0);
$quantity = (int)($input['quantity'] ?? 0);

if ($stockId <= 0 || $quantity <= 0) {
    jsonResponse(['error' => 'invalid_input'], 422);
}

try {
    $result = TradeService::closeShort((int)$user['id'], (int)$user['institution_id'], $stockId, $quantity);
    if (isset($result['error'])) {
        jsonResponse($result, 422);
    }
    jsonResponse($result);
} catch (Exception $e) {
    error_log($e->getMessage());
    jsonResponse(['error' => 'trade_failed'], 500);
}
