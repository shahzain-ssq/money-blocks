<?php
require __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/TradeService.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/Database.php';

initApiRequest();

$user = Auth::requireAuth();
$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
$stockId = (int)($input['stock_id'] ?? 0);
$qty = (int)($input['quantity'] ?? 0);
if ($stockId <= 0 || $qty <= 0) {
    jsonError('invalid_input', 'Stock ID and quantity are required.', 422);
}
$result = TradeService::buy((int)$user['id'], (int)$user['institution_id'], $stockId, $qty);
if (isset($result['error'])) {
    $message = match ($result['error']) {
        'insufficient_cash' => 'Insufficient cash balance.',
        'per_user_limit_exceeded' => 'This order exceeds your per-user position limit.',
        'total_limit_exceeded' => 'This order exceeds the institution-wide stock limit.',
        'stock_inactive' => 'This stock is not currently available for new trades.',
        default => 'Unable to complete the trade.',
    };
    jsonError($result['error'], $message, 400);
}
jsonResponse($result);
