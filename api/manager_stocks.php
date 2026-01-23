<?php
require __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/Database.php';
require_once __DIR__ . '/../src/StockService.php';

initApiRequest();

$user = Auth::requireAuth();
requireManager($user);
$method = $_SERVER['REQUEST_METHOD'];
$pdo = Database::getConnection();

if ($method === 'GET') {
    $id = (int)($_GET['id'] ?? 0);
    if ($id) {
        $stock = StockService::getById($id, (int)$user['institution_id']);
        if (!$stock) {
            jsonError('not_found', 'Stock not found.', 404);
        }
        jsonResponse(['ok' => true, 'stock' => $stock]);
    }
    jsonResponse(['ok' => true, 'stocks' => StockService::listStocks((int)$user['institution_id'])]);
}

$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
if ($method === 'POST') {
    $ticker = trim($input['ticker'] ?? '');
    $name = trim($input['name'] ?? '');
    $initialPrice = (float)($input['initial_price'] ?? 0);
    if ($ticker === '' || $name === '' || $initialPrice <= 0) {
        jsonError('invalid_input', 'Ticker, name, and initial price are required.', 422);
    }
    $stmt = $pdo->prepare('INSERT INTO stocks (institution_id, ticker, name, initial_price, total_limit, per_user_limit, per_user_short_limit, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)');
    $stmt->execute([
        $user['institution_id'],
        $ticker,
        $name,
        $initialPrice,
        $input['total_limit'] ?? null,
        $input['per_user_limit'] ?? null,
        $input['per_user_short_limit'] ?? null,
    ]);
    jsonResponse(['ok' => true, 'id' => $pdo->lastInsertId()]);
}

if ($method === 'DELETE') {
    $id = (int)($_GET['id'] ?? ($input['id'] ?? 0));
    if (!$id) {
        jsonError('id_required', 'Stock ID is required.', 422);
    }
    $stmt = $pdo->prepare('UPDATE stocks SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND institution_id = ?');
    $stmt->execute([$id, $user['institution_id']]);
    if ($stmt->rowCount() === 0) {
        jsonError('not_found', 'Stock not found.', 404);
    }
    jsonResponse(['ok' => true]);
}

if ($method === 'PUT') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) {
        jsonError('id_required', 'Stock ID is required.', 422);
    }
    $exists = $pdo->prepare('SELECT 1 FROM stocks WHERE id = ? AND institution_id = ?');
    $exists->execute([$id, $user['institution_id']]);
    if (!$exists->fetchColumn()) {
        jsonError('not_found', 'Stock not found.', 404);
    }
    $ticker = trim($input['ticker'] ?? '');
    $name = trim($input['name'] ?? '');
    $initialPrice = (float)($input['initial_price'] ?? 0);
    if ($ticker === '' || $name === '' || $initialPrice <= 0) {
        jsonError('invalid_input', 'Ticker, name, and initial price are required.', 422);
    }
    $update = $pdo->prepare('UPDATE stocks SET ticker = ?, name = ?, initial_price = ?, total_limit = ?, per_user_limit = ?, per_user_short_limit = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND institution_id = ?');
    $update->execute([
        $ticker,
        $name,
        $initialPrice,
        $input['total_limit'] ?? null,
        $input['per_user_limit'] ?? null,
        $input['per_user_short_limit'] ?? null,
        isset($input['active']) ? (int)$input['active'] : 1,
        $id,
        $user['institution_id'],
    ]);
    jsonResponse(['ok' => true]);
}

jsonError('unsupported_method', 'Method not allowed.', 405);
