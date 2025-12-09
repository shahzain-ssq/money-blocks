<?php
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/InstitutionService.php';

// In production, exchange code for token, verify email and domain.
$institutionId = (int)($_GET['state'] ?? 0);
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
$domain = substr(strrchr($email, '@'), 1);
if ($institution['google_allowed_domain'] && $domain !== $institution['google_allowed_domain']) {
    echo 'Email domain not allowed.';
    exit;
}
$user = Auth::googleLogin($email, $institutionId);
if (!$user) {
    echo 'No matching user. Please contact manager.';
    exit;
}
header('Location: /public/dashboard.html');
