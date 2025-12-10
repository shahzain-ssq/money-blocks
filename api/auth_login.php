<?php
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/InstitutionService.php';

$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
$identifier = $input['identifier'] ?? '';
$password = $input['password'] ?? '';
$institutionId = (int)($input['institution_id'] ?? 0);
if (!$identifier || !$password || !$institutionId) {
    jsonResponse(['error' => 'missing_fields'], 422);
}
$institution = InstitutionService::getInstitution($institutionId);
if (!$institution) {
    jsonResponse(['error' => 'invalid_institution'], 400);
}
$user = Auth::login($identifier, $password, $institutionId);
if (!$user) {
    jsonResponse(['error' => 'invalid_credentials'], 401);
}
jsonResponse(['user' => sanitizeUser($user)]);
