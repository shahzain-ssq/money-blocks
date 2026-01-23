<?php
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/ScenarioService.php';

initApiRequest();

$user = Auth::requireAuth();

if ($user['role'] !== 'admin' && $user['role'] !== 'manager') {
    jsonError('forbidden', 'You do not have access to manage scenarios.', 403);
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $id = (int)($_GET['id'] ?? 0);
    if ($id) {
        $scenario = ScenarioService::getById($id, (int)$user['institution_id']);
        if (!$scenario) {
            jsonError('not_found', 'Scenario not found.', 404);
        }
        jsonResponse(['scenario' => $scenario]);
    }
    $scenarios = ScenarioService::getAll($user['institution_id']);
    jsonResponse(['scenarios' => $scenarios]);
}

if ($method === 'POST' || $method === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $title = trim($input['title'] ?? '');
    if ($title === '') {
        jsonError('title_required', 'Scenario title is required.', 400);
    }

    $status = $input['status'] ?? 'draft';
    $allowedStatuses = ['draft', 'published', 'archived'];
    if (!in_array($status, $allowedStatuses, true)) {
        jsonError('invalid_status', 'Scenario status is invalid.', 422);
    }

    $startsAt = !empty($input['starts_at']) ? $input['starts_at'] : null;
    if ($startsAt !== null && strtotime($startsAt) === false) {
        jsonError('invalid_start_time', 'Scenario start time is invalid.', 422);
    }

    if ($method === 'PUT') {
        $id = (int)($_GET['id'] ?? ($input['id'] ?? 0));
        if (!$id) {
            jsonError('id_required', 'Scenario ID is required.', 422);
        }
        $scenario = ScenarioService::getById($id, (int)$user['institution_id']);
        if (!$scenario) {
            jsonError('not_found', 'Scenario not found.', 404);
        }
        ScenarioService::update($id, $user['institution_id'], $title, $input['description'] ?? '', $status, $startsAt);
        jsonResponse(['message' => 'Updated']);
    }

    ScenarioService::create($user['institution_id'], $title, $input['description'] ?? '', $status, $startsAt);
    jsonResponse(['message' => 'Created']);
}

jsonError('method_not_allowed', 'Method not allowed.', 405);
