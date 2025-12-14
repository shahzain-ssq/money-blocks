<?php
require __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/StockService.php';

$user = Auth::requireAuth();
requireManager($user);
$method = $_SERVER['REQUEST_METHOD'];
$pdo = Database::getConnection();

if ($method === 'GET') {
    jsonResponse(['stocks' => StockService::listStocks((int)$user['institution_id'])]);
}

$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
if ($method === 'POST') {
    $pdo->prepare('INSERT INTO stocks (institution_id, ticker, name, initial_price, total_limit, per_user_limit, per_user_short_limit, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())')
        ->execute([
            $user['institution_id'],
            $input['ticker'] ?? '',
            $input['name'] ?? '',
            $input['initial_price'] ?? 0,
            $input['total_limit'] ?? null,
            $input['per_user_limit'] ?? null,
            $input['per_user_short_limit'] ?? null,
        ]);
    jsonResponse(['status' => 'created', 'id' => $pdo->lastInsertId()]);
}

if ($method === 'PUT') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) {
        jsonResponse(['error' => 'id_required'], 422);
    }
    $pdo->prepare('UPDATE stocks SET ticker = ?, name = ?, initial_price = ?, total_limit = ?, per_user_limit = ?, per_user_short_limit = ?, active = ?, updated_at = NOW() WHERE id = ? AND institution_id = ?')
        ->execute([
            $input['ticker'] ?? '',
            $input['name'] ?? '',
            $input['initial_price'] ?? 0,
            $input['total_limit'] ?? null,
            $input['per_user_limit'] ?? null,
            $input['per_user_short_limit'] ?? null,
            isset($input['active']) ? (int)$input['active'] : 1,
            $id,
            $user['institution_id'],
        ]);
    jsonResponse(['status' => 'updated']);
}

jsonResponse(['error' => 'unsupported_method'], 405);
