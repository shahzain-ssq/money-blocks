<?php
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/InstitutionService.php';
require_once __DIR__ . '/../src/Auth.php';

// In production, exchange code for token, verify email and domain.
$receivedState = $_GET['state'] ?? '';
Auth::startSession();
$storedState = $_SESSION['oauth_state'] ?? null;
$institutionId = (int)($_SESSION['oauth_institution_id'] ?? 0);
if (!$storedState || !$receivedState || !hash_equals($storedState, $receivedState)) {
    echo 'Invalid OAuth state.';
    exit;
}
unset($_SESSION['oauth_state'], $_SESSION['oauth_institution_id']);
$email = $_GET['email'] ?? null; // placeholder for demo
if (!$institutionId || !$email) {
    echo 'Invalid Google callback.';
    exit;
}
$institution = InstitutionService::getInstitution($institutionId);
if (!$institution) {
    echo 'Unknown institution';
    exit;
}
$validatedEmail = filter_var($email, FILTER_VALIDATE_EMAIL);
if ($validatedEmail === false) {
    echo 'Invalid email provided.';
    exit;
}
$domain = substr(strrchr($validatedEmail, '@'), 1);
if ($institution['google_allowed_domain'] && $domain !== $institution['google_allowed_domain']) {
    echo 'Email domain not allowed.';
    exit;
}
$user = Auth::googleLogin($validatedEmail, $institutionId);
if (!$user) {
    echo 'No matching user. Please contact manager.';
    exit;
}
header('Location: /public/dashboard.html');
