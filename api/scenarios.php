<?php
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/ScenarioService.php';

initApiRequest();

$user = Auth::requireAuth();
$action = $_GET['action'] ?? 'list';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (($input['action'] ?? '') === 'toggle_read') {
        $scenarioId = (int)($input['scenario_id'] ?? 0);
        if ($scenarioId <= 0) {
            jsonError('invalid_input', 'Scenario ID is required.', 422);
        }
        $read = filter_var($input['read'] ?? false, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($read === null) {
            jsonError('invalid_input', 'Read flag must be true or false.', 422);
        }
        ScenarioService::toggleRead($user['id'], $scenarioId, $read);
        jsonResponse(['status' => 'ok']);
    }
    jsonError('invalid_action', 'Unsupported action.', 400);
}

if ($action === 'count') {
    $count = ScenarioService::getUnreadCount($user['id'], $user['institution_id']);
    jsonResponse(['count' => $count]);
} else {
    $scenarios = ScenarioService::getLiveForUser($user['id'], $user['institution_id']);
    jsonResponse(['scenarios' => $scenarios]);
}
