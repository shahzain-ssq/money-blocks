<?php
require __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/Database.php';
require_once __DIR__ . '/../src/PortfolioService.php';

initApiRequest();

$user = Auth::requireAuth();
requireManager($user);
$targetId = (int)($_GET['user_id'] ?? 0);
if ($targetId <= 0) {
    jsonError('user_id_required', 'User ID is required.', 422);
}
$pdo = Database::getConnection();
$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ? AND institution_id = ?');
$stmt->execute([$targetId, $user['institution_id']]);
if (!$stmt->fetch()) {
    jsonError('not_found', 'User not found.', 404);
}
jsonResponse(PortfolioService::getUserPortfolio($targetId, (int)$user['institution_id']));
