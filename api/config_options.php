<?php
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/Database.php';

$user = Auth::requireAuth();
$pdo = Database::getConnection();

$stmt = $pdo->prepare('SELECT label, duration_seconds FROM short_duration_options WHERE institution_id = ? ORDER BY duration_seconds ASC');
$stmt->execute([$user['institution_id']]);
$durations = $stmt->fetchAll();

// If no custom durations, provide defaults
if (empty($durations)) {
    $durations = [
        ['label' => '1 Hour', 'duration_seconds' => 3600],
        ['label' => '1 Day', 'duration_seconds' => 86400],
        ['label' => '1 Week', 'duration_seconds' => 604800],
    ];
}

jsonResponse(['durations' => $durations]);
