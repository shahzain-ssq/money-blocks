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
    $stmt = $pdo->prepare('INSERT INTO stocks (institution_id, ticker, name, initial_price, total_limit, per_user_limit, per_user_short_limit, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())');
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
    $stmt = $pdo->prepare('UPDATE stocks SET active = 0, updated_at = UTC_TIMESTAMP() WHERE id = ? AND institution_id = ?');
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
    $stockStmt = $pdo->prepare('SELECT id, ticker, name, initial_price, total_limit, per_user_limit, per_user_short_limit, active FROM stocks WHERE id = ? AND institution_id = ?');
    $stockStmt->execute([$id, $user['institution_id']]);
    $stock = $stockStmt->fetch();
    if (!$stock) {
        jsonError('not_found', 'Stock not found.', 404);
    }

    $hasPrice = array_key_exists('price', $input) || array_key_exists('current_price', $input);
    $hasMetadata = false;
    foreach (['ticker', 'name', 'initial_price', 'total_limit', 'per_user_limit', 'per_user_short_limit', 'active'] as $field) {
        if (array_key_exists($field, $input)) {
            $hasMetadata = true;
            break;
        }
    }

    if (!$hasPrice && !$hasMetadata) {
        jsonError('invalid_input', 'No updates provided.', 422);
    }

    $incomingActive = array_key_exists('active', $input) ? (int)$input['active'] : (int)$stock['active'];
    if ($hasPrice && (int)$stock['active'] !== 1 && $incomingActive !== 1) {
        jsonError('not_found', 'Stock not found.', 404);
    }

    $requiresActivation = $hasPrice && (int)$stock['active'] !== 1 && $incomingActive === 1;

    if ($hasMetadata) {
        $ticker = array_key_exists('ticker', $input) ? trim($input['ticker'] ?? '') : $stock['ticker'];
        $name = array_key_exists('name', $input) ? trim($input['name'] ?? '') : $stock['name'];
        if ($ticker === '' || $name === '') {
            jsonError('invalid_input', 'Ticker and name are required for metadata updates.', 422);
        }

        $initialPrice = $stock['initial_price'];
        if (array_key_exists('initial_price', $input)) {
            $initialPrice = (float)$input['initial_price'];
            if ($initialPrice <= 0) {
                jsonError('invalid_input', 'Initial price must be greater than zero.', 422);
            }
        }

        $totalLimit = array_key_exists('total_limit', $input) ? $input['total_limit'] : $stock['total_limit'];
        $perUserLimit = array_key_exists('per_user_limit', $input) ? $input['per_user_limit'] : $stock['per_user_limit'];
        $perUserShortLimit = array_key_exists('per_user_short_limit', $input) ? $input['per_user_short_limit'] : $stock['per_user_short_limit'];
        $active = $incomingActive;

        $updatePayload = [
            $ticker,
            $name,
            $initialPrice,
            $totalLimit,
            $perUserLimit,
            $perUserShortLimit,
            $active,
            $id,
            $user['institution_id'],
        ];

        if ($requiresActivation) {
            $update = $pdo->prepare('UPDATE stocks SET ticker = ?, name = ?, initial_price = ?, total_limit = ?, per_user_limit = ?, per_user_short_limit = ?, active = ?, updated_at = UTC_TIMESTAMP() WHERE id = ? AND institution_id = ?');
            $update->execute($updatePayload);
        }
    }

    if ($hasPrice) {
        $priceInput = $input['price'] ?? $input['current_price'] ?? null;
        $price = (float)$priceInput;
        if ($price <= 0) {
            jsonError('invalid_input', 'Price must be greater than zero.', 422);
        }
        try {
            StockService::updatePrice($id, $price, (int)$user['institution_id']);
        } catch (RuntimeException $e) {
            jsonError('not_found', 'Stock not found.', 404);
        }
    }

    if ($hasMetadata && !$requiresActivation) {
        $update = $pdo->prepare('UPDATE stocks SET ticker = ?, name = ?, initial_price = ?, total_limit = ?, per_user_limit = ?, per_user_short_limit = ?, active = ?, updated_at = UTC_TIMESTAMP() WHERE id = ? AND institution_id = ?');
        $update->execute($updatePayload);
    }

    jsonResponse(['ok' => true]);
}

jsonError('unsupported_method', 'Method not allowed.', 405);
