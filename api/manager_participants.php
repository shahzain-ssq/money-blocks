<?php
require __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/Database.php';

initApiRequest();

$user = Auth::requireAuth();
requireManager($user);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$pdo = Database::getConnection();

if ($method === 'GET') {
    $q = trim($_GET['q'] ?? '');
    if ($q !== '') {
        $like = '%' . $q . '%';
        $stmt = $pdo->prepare('SELECT u.id, u.email, u.username, u.role, p.cash_balance FROM users u LEFT JOIN portfolios p ON p.user_id = u.id WHERE u.institution_id = ? AND (u.username LIKE ? OR u.email LIKE ?) ORDER BY u.id');
        $stmt->execute([$user['institution_id'], $like, $like]);
    } else {
        $stmt = $pdo->prepare('SELECT u.id, u.email, u.username, u.role, p.cash_balance FROM users u LEFT JOIN portfolios p ON p.user_id = u.id WHERE u.institution_id = ? ORDER BY u.id');
        $stmt->execute([$user['institution_id']]);
    }
    $participants = $stmt->fetchAll();
    jsonResponse(['ok' => true, 'participants' => $participants]);
}

$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;

if ($method === 'PUT') {
    $id = (int)($input['id'] ?? 0);
    $role = $input['role'] ?? '';
    if ($id <= 0 || !in_array($role, ['student', 'manager'])) {
        jsonError('invalid_input', 'Valid user ID and role are required.', 422);
    }
    // Prevent demoting self or last admin logic if needed (but currently simple)
    if ($id === (int)$user['id']) {
        jsonError('cannot_modify_self', 'You cannot modify your own role.', 403);
    }

    $check = $pdo->prepare('SELECT id FROM users WHERE id = ? AND institution_id = ?');
    $check->execute([$id, $user['institution_id']]);
    if (!$check->fetch()) {
        jsonError('user_not_found', 'User not found.', 404);
    }

    $update = $pdo->prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    $update->execute([$role, $id]);
    jsonResponse(['ok' => true]);
}

if ($method === 'POST') {
    $username = trim($input['username'] ?? '');
    $email = trim($input['email'] ?? '');
    if ($username === '' && $email === '') {
        jsonError('username_or_email_required', 'Provide a username or email.', 422);
    }
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonError('invalid_email', 'Email address is invalid.', 422);
    }

    if ($email !== '') {
        $check = $pdo->prepare('SELECT id FROM users WHERE institution_id = ? AND (email = ? OR username = ?) LIMIT 1');
        $check->execute([$user['institution_id'], $email, $username]);
    } else {
        $check = $pdo->prepare('SELECT id FROM users WHERE institution_id = ? AND username = ? LIMIT 1');
        $check->execute([$user['institution_id'], $username]);
    }
    if ($check->fetch()) {
        jsonError('user_exists', 'A user with that email or username already exists.', 409);
    }
    $tempPassword = bin2hex(random_bytes(4));
    $hash = password_hash($tempPassword, PASSWORD_DEFAULT);
    $insert = $pdo->prepare('INSERT INTO users (institution_id, email, username, role, password_hash, created_at, updated_at) VALUES (?, ?, ?, "student", ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)');
    $insert->execute([$user['institution_id'], $email, $username, $hash]);
    $id = $pdo->lastInsertId();
    jsonResponse(['ok' => true, 'participant' => ['id' => $id, 'email' => $email, 'username' => $username], 'temp_password' => $tempPassword]);
}

if ($method === 'DELETE') {
    $id = (int)($_GET['id'] ?? ($input['id'] ?? 0));
    if ($id <= 0) {
        jsonError('id_required', 'User ID is required.', 422);
    }
    if ($id === (int)$user['id']) {
        jsonError('cannot_delete_self', 'You cannot delete your own account.', 403);
    }
    try {
        $pdo->beginTransaction();
        $portfolioStmt = $pdo->prepare('SELECT id FROM portfolios WHERE user_id = ?');
        $portfolioStmt->execute([$id]);
        if ($portfolioId = $portfolioStmt->fetchColumn()) {
            $pdo->prepare('DELETE FROM positions WHERE portfolio_id = ?')->execute([$portfolioId]);
            $pdo->prepare('DELETE FROM short_positions WHERE portfolio_id = ?')->execute([$portfolioId]);
            $pdo->prepare('DELETE FROM portfolios WHERE id = ?')->execute([$portfolioId]);
        }
        $delete = $pdo->prepare('DELETE FROM users WHERE id = ? AND institution_id = ?');
        $delete->execute([$id, $user['institution_id']]);
        if ($delete->rowCount() === 0) {
            $pdo->rollBack();
            jsonError('not_found', 'User not found.', 404);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
    jsonResponse(['ok' => true]);
}

jsonError('unsupported_method', 'Method not allowed.', 405);
