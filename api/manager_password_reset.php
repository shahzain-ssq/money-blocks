<?php
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/Database.php';

initApiRequest();

$user = Auth::requireAuth();

if ($user['role'] !== 'admin' && $user['role'] !== 'manager') {
    jsonError('forbidden', 'You do not have access to reset passwords.', 403);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonError('method_not_allowed', 'Method not allowed.', 405);
}

$input = json_decode(file_get_contents('php://input'), true);
if (empty($input['user_id']) || empty($input['password'])) {
    jsonError('missing_fields', 'User ID and password are required.', 400);
}

$pdo = Database::getConnection();
$stmt = $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ? AND institution_id = ?');
$stmt->execute([password_hash($input['password'], PASSWORD_DEFAULT), $input['user_id'], $user['institution_id']]);
if ($stmt->rowCount() === 0) {
    jsonError('not_found', 'User not found.', 404);
}

jsonResponse(['message' => 'Password updated successfully']);
