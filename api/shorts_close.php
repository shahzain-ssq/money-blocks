<?php
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/TradeService.php';

$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
$institutionId = (int)($input['institution_id'] ?? ($_GET['institution_id'] ?? 0));
if ($institutionId <= 0) {
    jsonResponse(['error' => 'institution_required'], 422);
}
$closed = TradeService::closeExpiredShorts($institutionId);
jsonResponse(['closed' => $closed]);
