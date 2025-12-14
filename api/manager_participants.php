<?php
require __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/Database.php';

$user = Auth::requireAuth();
requireManager($user);
$pdo = Database::getConnection();

$stmt = $pdo->prepare('SELECT u.id, u.email, u.username, p.cash_balance FROM users u LEFT JOIN portfolios p ON p.user_id = u.id WHERE u.institution_id = ? ORDER BY u.id');
$stmt->execute([$user['institution_id']]);
$participants = $stmt->fetchAll();
jsonResponse(['participants' => $participants]);
