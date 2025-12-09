<?php
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/TradeService.php';

$user = Auth::requireAuth();
$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
$stockId = (int)($input['stock_id'] ?? 0);
$qty = (int)($input['quantity'] ?? 0);
$duration = (int)($input['duration_seconds'] ?? 0);
if ($stockId <= 0 || $qty <= 0 || $duration <= 0) {
    jsonResponse(['error' => 'invalid_input'], 422);
}
$result = TradeService::openShort((int)$user['id'], (int)$user['institution_id'], $stockId, $qty, $duration);
jsonResponse($result);
