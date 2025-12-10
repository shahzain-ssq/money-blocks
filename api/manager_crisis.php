<?php
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/Database.php';
require_once __DIR__ . '/../src/CrisisService.php';
require_once __DIR__ . '/../src/BroadcastService.php';

$user = Auth::requireAuth();
requireManager($user);
$method = $_SERVER['REQUEST_METHOD'];
$pdo = Database::getConnection();

if ($method === 'GET') {
    jsonResponse(['scenarios' => CrisisService::managerList((int)$user['institution_id'])]);
}

$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
if ($method === 'POST') {
    $pdo->prepare('INSERT INTO crisis_scenarios (institution_id, title, description, status, starts_at, ends_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())')
        ->execute([
            $user['institution_id'],
            $input['title'] ?? '',
            $input['description'] ?? '',
            $input['status'] ?? 'draft',
            $input['starts_at'] ?? null,
            $input['ends_at'] ?? null,
        ]);
    $id = $pdo->lastInsertId();
    if (($input['status'] ?? '') === 'published') {
        BroadcastService::send([
            'type' => 'crisis_published',
            'institution_id' => (int)$user['institution_id'],
            'scenario_id' => (int)$id,
            'title' => $input['title'] ?? '',
            'description' => $input['description'] ?? '',
        ]);
    }
    jsonResponse(['status' => 'created', 'id' => $id]);
}

if ($method === 'PUT') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) {
        jsonResponse(['error' => 'id_required'], 422);
    }
    $pdo->prepare('UPDATE crisis_scenarios SET title = ?, description = ?, status = ?, starts_at = ?, ends_at = ?, updated_at = NOW() WHERE id = ? AND institution_id = ?')
        ->execute([
            $input['title'] ?? '',
            $input['description'] ?? '',
            $input['status'] ?? 'draft',
            $input['starts_at'] ?? null,
            $input['ends_at'] ?? null,
            $id,
            $user['institution_id'],
        ]);
    if (($input['status'] ?? '') === 'published') {
        BroadcastService::send([
            'type' => 'crisis_published',
            'institution_id' => (int)$user['institution_id'],
            'scenario_id' => $id,
            'title' => $input['title'] ?? '',
            'description' => $input['description'] ?? '',
        ]);
    }
    jsonResponse(['status' => 'updated']);
}

jsonResponse(['error' => 'unsupported_method'], 405);
