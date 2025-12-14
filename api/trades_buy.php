<?php
require __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/TradeService.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/Database.php';

$user = Auth::requireAuth();
$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
$stockId = (int)($input['stock_id'] ?? 0);
$qty = (int)($input['quantity'] ?? 0);
if ($stockId <= 0 || $qty <= 0) {
    jsonResponse(['error' => 'invalid_input'], 422);
}
$result = TradeService::buy((int)$user['id'], (int)$user['institution_id'], $stockId, $qty);
if (isset($result['error'])) {
    jsonResponse($result, 400);
}
jsonResponse($result);
