<?php
require __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/InstitutionService.php';
require_once __DIR__ . '/../src/Auth.php';

function isHttpsRequest(): bool
{
    $forwardedProto = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '';
    if ($forwardedProto !== '') {
        $firstProto = strtolower(trim(explode(',', $forwardedProto)[0]));
        if ($firstProto === 'https') {
            return true;
        }
        if ($firstProto === 'http') {
            return false;
        }
    }

    $forwardedSsl = strtolower((string)($_SERVER['HTTP_X_FORWARDED_SSL'] ?? ''));
    if ($forwardedSsl === 'on' || $forwardedSsl === '1') {
        return true;
    }

    if (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off') {
        return true;
    }

    return ($_SERVER['SERVER_PORT'] ?? null) === '443';
}

$institutionId = (int)($_GET['institution_id'] ?? 0);
$institution = $institutionId ? InstitutionService::getInstitution($institutionId) : null;
if (!$institution || empty($institution['google_client_id'])) {
    jsonResponse(['error' => 'invalid_institution'], 400);
}
Auth::startSession();
$state = bin2hex(random_bytes(16));
$_SESSION['oauth_state'] = $state;
$_SESSION['oauth_institution_id'] = $institutionId;

$configuredRedirect = getenv('GOOGLE_REDIRECT_URI');
$allowedHostsEnv = getenv('ALLOWED_OAUTH_HOSTS') ?: '';
$allowedHosts = array_values(array_filter(array_map('trim', explode(',', $allowedHostsEnv))));
$defaultHost = getenv('APP_HOST') ?: ($allowedHosts[0] ?? 'localhost');
$allowedHostsLower = array_map('strtolower', $allowedHosts);
if (!in_array(strtolower($defaultHost), $allowedHostsLower, true)) {
    $allowedHostsLower[] = strtolower($defaultHost);
}

$scheme = isHttpsRequest() ? 'https' : 'http';
$defaultRedirect = $scheme . '://' . $defaultHost . '/auth_google_callback.php';
$redirectUri = $configuredRedirect ?: $defaultRedirect;

$parsedRedirect = parse_url($redirectUri);
$redirectHost = strtolower($parsedRedirect['host'] ?? '');
$redirectScheme = strtolower($parsedRedirect['scheme'] ?? $scheme);
if ($redirectHost === '' || !in_array($redirectHost, $allowedHostsLower, true) || !in_array($redirectScheme, ['http', 'https'], true)) {
    $redirectUri = $defaultRedirect;
}

$encodedRedirect = urlencode($redirectUri);
$url = "https://accounts.google.com/o/oauth2/v2/auth?client_id={$institution['google_client_id']}&redirect_uri={$encodedRedirect}&response_type=code&scope=openid%20email&state={$state}";
jsonResponse(['url' => $url]);
