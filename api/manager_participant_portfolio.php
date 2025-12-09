<?php
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/PortfolioService.php';

$user = Auth::requireAuth();
requireManager($user);
$targetId = (int)($_GET['user_id'] ?? 0);
if ($targetId <= 0) {
    jsonResponse(['error' => 'user_id_required'], 422);
}
$pdo = Database::getConnection();
$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ? AND institution_id = ?');
$stmt->execute([$targetId, $user['institution_id']]);
if (!$stmt->fetch()) {
    jsonResponse(['error' => 'not_found'], 404);
}
jsonResponse(PortfolioService::getUserPortfolio($targetId, (int)$user['institution_id']));
