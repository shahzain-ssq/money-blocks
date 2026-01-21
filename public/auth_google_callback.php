<?php
require __DIR__ . '/../bootstrap.php';
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
$redirectUri = $_SESSION['oauth_redirect_uri'] ?? null;
unset($_SESSION['oauth_state'], $_SESSION['oauth_institution_id'], $_SESSION['oauth_redirect_uri']);

if (!$institutionId) {
    echo 'Invalid Google callback.';
    exit;
}

$institution = InstitutionService::getInstitution($institutionId);
if (!$institution || empty($institution['google_client_id']) || empty($institution['google_client_secret'])) {
    echo 'Institution is not configured for Google login.';
    exit;
}

$authorizationCode = $_GET['code'] ?? null;
if (!$authorizationCode) {
    echo 'Missing authorization code.';
    exit;
}

$resolvedRedirect = $redirectUri ?: ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . '/auth_google_callback.php');

$tokenResponse = file_get_contents('https://oauth2.googleapis.com/token', false, stream_context_create([
    'http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
        'content' => http_build_query([
            'code' => $authorizationCode,
            'client_id' => $institution['google_client_id'],
            'client_secret' => $institution['google_client_secret'],
            'redirect_uri' => $resolvedRedirect,
            'grant_type' => 'authorization_code',
        ]),
        'timeout' => 10,
    ],
]));

if ($tokenResponse === false) {
    echo 'Failed to contact Google.';
    exit;
}

$tokenData = json_decode($tokenResponse, true);
if (!is_array($tokenData) || (!isset($tokenData['id_token']) && !isset($tokenData['access_token']))) {
    echo 'Invalid token response from Google.';
    exit;
}

$email = null;
if (!empty($tokenData['id_token'])) {
    $parts = explode('.', $tokenData['id_token']);
    if (count($parts) === 3) {
        $payload = json_decode(base64_decode(strtr($parts[1], '-_', '+/')), true);
        if (is_array($payload) && ($payload['aud'] ?? null) === $institution['google_client_id']) {
            $email = $payload['email'] ?? null;
            $hostedDomain = $payload['hd'] ?? null;
            if ($institution['google_allowed_domain'] && $hostedDomain && $hostedDomain !== $institution['google_allowed_domain']) {
                echo 'Email domain not allowed.';
                exit;
            }
        }
    }
}

if (!$email && !empty($tokenData['access_token'])) {
    $userInfo = file_get_contents('https://www.googleapis.com/oauth2/v3/userinfo', false, stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => 'Authorization: Bearer ' . $tokenData['access_token'],
            'timeout' => 10,
        ],
    ]));

    if ($userInfo !== false) {
        $userData = json_decode($userInfo, true);
        if (is_array($userData)) {
            $email = $userData['email'] ?? null;
            if ($institution['google_allowed_domain'] && ($userData['hd'] ?? null) !== $institution['google_allowed_domain']) {
                echo 'Email domain not allowed.';
                exit;
            }
        }
    }
}

if (!$email) {
    echo 'Unable to retrieve Google account email.';
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

header('Location: /dashboard');
