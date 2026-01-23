<?php
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/Database.php';

initApiRequest();

$user = Auth::requireAuth();
requireManager($user);
$pdo = Database::getConnection();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $stmt = $pdo->prepare('SELECT * FROM short_duration_options WHERE institution_id = ? ORDER BY duration_seconds ASC');
    $stmt->execute([$user['institution_id']]);
    jsonResponse(['short_durations' => $stmt->fetchAll()]);
}

if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $durations = $input['short_durations'] ?? [];

    if (!is_array($durations)) {
        jsonError('invalid_input', 'Short durations must be an array of seconds.', 422);
    }

    try {
        $pdo->beginTransaction();
        // Clear existing (simple approach)
        $pdo->prepare('DELETE FROM short_duration_options WHERE institution_id = ?')->execute([$user['institution_id']]);

        $stmt = $pdo->prepare('INSERT INTO short_duration_options (institution_id, label, duration_seconds) VALUES (?, ?, ?)');
        foreach ($durations as $d) {
            $sec = (int)$d;
            if ($sec > 0) {
                // Auto generate label
                $label = ($sec / 60) . ' mins';
                if ($sec >= 3600) {
                    $label = ($sec / 3600) . ' hours';
                }
                if ($sec >= 86400) {
                    $label = ($sec / 86400) . ' days';
                }

                $stmt->execute([$user['institution_id'], $label, $sec]);
            }
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
