<?php
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/TradeService.php';

initApiRequest();

$user = Auth::requireAuth();
$input = json_decode(file_get_contents('php://input'), true);

$stockId = (int)($input['stock_id'] ?? 0);
$quantity = (int)($input['quantity'] ?? 0);

if ($stockId <= 0 || $quantity <= 0) {
    jsonError('invalid_input', 'Stock ID and quantity are required.', 422);
}

$result = TradeService::closeShort((int)$user['id'], (int)$user['institution_id'], $stockId, $quantity);
if (isset($result['error'])) {
    $message = $result['error'] === 'insufficient_shorts'
        ? 'Insufficient short positions to close.'
        : 'Unable to close short position.';
    jsonError($result['error'], $message, 422);
}
jsonResponse($result);
