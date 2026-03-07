<?php
require __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/Database.php';
require_once __DIR__ . '/../src/TradeService.php';

initApiRequest();

$user = Auth::requireAuth();
$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
$stockId = (int)($input['stock_id'] ?? 0);
$qty = (int)($input['quantity'] ?? 0);
$duration = (int)($input['duration_seconds'] ?? 0);
if ($stockId <= 0 || $qty <= 0 || $duration <= 0) {
    jsonError('invalid_input', 'Stock ID, quantity, and duration are required.', 422);
}
$result = TradeService::openShort((int)$user['id'], (int)$user['institution_id'], $stockId, $qty, $duration);
if (isset($result['error'])) {
    $message = match ($result['error']) {
        'per_user_short_limit_exceeded' => 'This order exceeds your short-selling limit for the selected stock.',
        'invalid_duration' => 'The selected short duration is no longer available.',
        'stock_inactive' => 'This stock is not currently available for new trades.',
        default => 'Unable to open the short position.',
    };
    jsonError($result['error'], $message, 400);
}
jsonResponse($result);
