<?php
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/InstitutionService.php';
require_once __DIR__ . '/../src/Auth.php';

$institutionId = (int)($_GET['institution_id'] ?? 0);
$institution = $institutionId ? InstitutionService::getInstitution($institutionId) : null;
if (!$institution) {
    jsonResponse(['error' => 'invalid_institution'], 400);
}
Auth::startSession();
$state = bin2hex(random_bytes(16));
$_SESSION['oauth_state'] = $state;
$_SESSION['oauth_institution_id'] = $institutionId;
// This is a simplified placeholder URL; in production integrate full OAuth flow.
$redirectUri = urlencode('https://example.com/auth/google/callback');
$url = "https://accounts.google.com/o/oauth2/v2/auth?client_id={$institution['google_client_id']}&redirect_uri={$redirectUri}&response_type=code&scope=openid%20email&state={$state}";
jsonResponse(['url' => $url]);
