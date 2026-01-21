<?php
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/Database.php';

$user = Auth::requireAuth();

if ($user['role'] !== 'admin' && $user['role'] !== 'manager') {
    http_response_code(403);
    jsonResponse(['error' => 'Forbidden']);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    jsonResponse(['error' => 'Method not allowed']);
}

$input = json_decode(file_get_contents('php://input'), true);
if (empty($input['user_id']) || empty($input['password'])) {
    http_response_code(400);
    jsonResponse(['error' => 'Missing user_id or password']);
}

$pdo = Database::getConnection();
$pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ? AND institution_id = ?')
    ->execute([password_hash($input['password'], PASSWORD_DEFAULT), $input['user_id'], $user['institution_id']]);

jsonResponse(['message' => 'Password updated successfully']);
