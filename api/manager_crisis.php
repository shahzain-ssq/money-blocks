<?php
require __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/Database.php';
require_once __DIR__ . '/../src/CrisisService.php';
require_once __DIR__ . '/../src/BroadcastService.php';

initApiRequest();

$user = Auth::requireAuth();
requireManager($user);
$method = $_SERVER['REQUEST_METHOD'];
$pdo = Database::getConnection();

if ($method === 'GET') {
    jsonResponse(['ok' => true, 'scenarios' => CrisisService::managerList((int)$user['institution_id'])]);
}

$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;

if ($method === 'POST') {
    $title = trim($input['title'] ?? '');
    if ($title === '') {
        jsonError('title_required', 'Scenario title is required.', 422);
    }
    $startsAt = $input['starts_at'] ?? null;
    $endsAt = $input['ends_at'] ?? null;
    validateTimeRange($startsAt, $endsAt);

    $pdo->prepare('INSERT INTO crisis_scenarios (institution_id, title, description, status, starts_at, ends_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)')
        ->execute([
            $user['institution_id'],
            $title,
            $input['description'] ?? '',
            $input['status'] ?? 'draft',
            $startsAt ?? null,
            $endsAt ?? null,
        ]);
    $id = $pdo->lastInsertId();
    if (($input['status'] ?? '') === 'published') {
        BroadcastService::send([
            'type' => 'crisis_published',
            'institution_id' => (int)$user['institution_id'],
            'scenario_id' => (int)$id,
            'title' => $title,
            'description' => $input['description'] ?? '',
        ]);
    }
    jsonResponse(['ok' => true, 'id' => $id]);
}

if ($method === 'PUT') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) {
        jsonError('id_required', 'Scenario ID is required.', 422);
    }

    $title = trim($input['title'] ?? '');
    if ($title === '') {
        jsonError('title_required', 'Scenario title is required.', 422);
    }

    $startsAt = $input['starts_at'] ?? null;
    $endsAt = $input['ends_at'] ?? null;
    validateTimeRange($startsAt, $endsAt);

    $check = $pdo->prepare('SELECT id FROM crisis_scenarios WHERE id = ? AND institution_id = ?');
    $check->execute([$id, $user['institution_id']]);
    if (!$check->fetch()) {
        jsonError('not_found', 'Scenario not found.', 404);
    }

    $stmt = $pdo->prepare('UPDATE crisis_scenarios SET title = ?, description = ?, status = ?, starts_at = ?, ends_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND institution_id = ?');
    $stmt->execute([
        $title,
        $input['description'] ?? '',
        $input['status'] ?? 'draft',
        $startsAt ?? null,
        $endsAt ?? null,
        $id,
        $user['institution_id'],
    ]);

    if (($input['status'] ?? '') === 'published') {
        BroadcastService::send([
            'type' => 'crisis_published',
            'institution_id' => (int)$user['institution_id'],
            'scenario_id' => $id,
            'title' => $title,
            'description' => $input['description'] ?? '',
        ]);
    }
    jsonResponse(['ok' => true]);
}

if ($method === 'DELETE') {
    $id = (int)($_GET['id'] ?? ($input['id'] ?? 0));
    if (!$id) {
        jsonError('id_required', 'Scenario ID is required.', 422);
    }
    $stmt = $pdo->prepare('DELETE FROM crisis_scenarios WHERE id = ? AND institution_id = ?');
    $stmt->execute([$id, $user['institution_id']]);
    if ($stmt->rowCount() === 0) {
        jsonError('not_found', 'Scenario not found.', 404);
    }
    jsonResponse(['ok' => true]);
}

jsonError('unsupported_method', 'Method not allowed.', 405);
