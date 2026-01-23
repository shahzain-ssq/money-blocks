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
    $scenarios = ScenarioService::getAll($user['institution_id']);
    jsonResponse(['scenarios' => $scenarios]);
}
elseif ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!isset($input['title'])) {
        jsonError('title_required', 'Scenario title is required.', 400);
    }

    // Validate starts_at if provided (UTC string)
    $startsAt = !empty($input['starts_at']) ? $input['starts_at'] : null;
    $status = $input['status'] ?? 'draft';

    if (isset($input['id'])) {
        ScenarioService::update($input['id'], $user['institution_id'], $input['title'], $input['description'] ?? '', $status, $startsAt);
        jsonResponse(['message' => 'Updated']);
    } else {
        ScenarioService::create($user['institution_id'], $input['title'], $input['description'] ?? '', $status, $startsAt);
        jsonResponse(['message' => 'Created']);
    }
}
else {
    jsonError('method_not_allowed', 'Method not allowed.', 405);
}
