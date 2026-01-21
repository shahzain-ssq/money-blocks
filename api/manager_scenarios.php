<?php
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/ScenarioService.php';

$user = Auth::requireAuth();

if ($user['role'] !== 'admin' && $user['role'] !== 'manager') {
    http_response_code(403);
    jsonResponse(['error' => 'Forbidden']);
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $scenarios = ScenarioService::getAll($user['institution_id']);
    jsonResponse(['scenarios' => $scenarios]);
}
elseif ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!isset($input['title'])) {
        http_response_code(400);
        jsonResponse(['error' => 'Title required']);
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
    http_response_code(405);
}
