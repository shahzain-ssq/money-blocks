<?php
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/Database.php';

$user = Auth::requireAuth();
$pdo = Database::getConnection();

// Fetch trades for the user's portfolio
// We need to join with portfolios to filter by user_id
// And join with stocks to get ticker

$stmt = $pdo->prepare('
    SELECT t.*, s.ticker, s.name
    FROM trades t
    JOIN portfolios p ON t.portfolio_id = p.id
    JOIN stocks s ON t.stock_id = s.id
    WHERE p.user_id = ?
    ORDER BY t.created_at DESC
    LIMIT 100
');

$stmt->execute([$user['id']]);
$activity = $stmt->fetchAll();

jsonResponse(['activity' => $activity]);
