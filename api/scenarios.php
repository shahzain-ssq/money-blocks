<?php
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/ScenarioService.php';

$user = Auth::requireAuth();
$action = $_GET['action'] ?? 'list';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (($input['action'] ?? '') === 'toggle_read') {
        ScenarioService::toggleRead($user['id'], $input['scenario_id'], $input['read']);
        jsonResponse(['status' => 'ok']);
    }
}

if ($action === 'count') {
    $count = ScenarioService::getUnreadCount($user['id'], $user['institution_id']);
    jsonResponse(['count' => $count]);
} else {
    $scenarios = ScenarioService::getLiveForUser($user['id'], $user['institution_id']);
    jsonResponse(['scenarios' => $scenarios]);
}
