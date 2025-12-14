<?php
require __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/InstitutionService.php';
require_once __DIR__ . '/../src/Auth.php';

function parseTrustedProxies(): array
{
    $trustedProxiesEnv = getenv('TRUSTED_PROXIES') ?: '';

    return array_filter(array_map('trim', explode(',', $trustedProxiesEnv)));
}

function ipMatchesCidr(string $ip, string $cidr): bool
{
    if (!str_contains($cidr, '/')) {
        return false;
    }

    [$subnet, $mask] = explode('/', $cidr, 2);
    $maskBits = (int)$mask;
    $ipBinary = inet_pton($ip);
    $subnetBinary = inet_pton($subnet);

    if ($ipBinary === false || $subnetBinary === false) {
        return false;
    }

    $ipUnpacked = unpack('C*', $ipBinary);
    $subnetUnpacked = unpack('C*', $subnetBinary);

    if ($ipUnpacked === false || $subnetUnpacked === false) {
        return false;
    }

    $bits = count($ipUnpacked) * 8;
    if ($maskBits < 0 || $maskBits > $bits) {
        return false;
    }

    $fullBytes = intdiv($maskBits, 8);
    $remainingBits = $maskBits % 8;

    for ($i = 1; $i <= $fullBytes; $i++) {
        if ($ipUnpacked[$i] !== $subnetUnpacked[$i]) {
            return false;
        }
    }

    if ($remainingBits === 0) {
        return true;
    }

    $maskByte = 0xFF << (8 - $remainingBits) & 0xFF;

    return ($ipUnpacked[$fullBytes + 1] & $maskByte) === ($subnetUnpacked[$fullBytes + 1] & $maskByte);
}

function isTrustedProxyAddress(string $remoteAddr, array $trustedProxies): bool
{
    if ($remoteAddr === '' || empty($trustedProxies)) {
        return false;
    }

    foreach ($trustedProxies as $proxy) {
        if (str_contains($proxy, '/')) {
            if (ipMatchesCidr($remoteAddr, $proxy)) {
                return true;
            }
            continue;
        }

        if ($remoteAddr === $proxy) {
            return true;
        }
    }

    return false;
}

function isLoopbackHost(string $host): bool
{
    $hostLower = strtolower($host);

    if ($hostLower === 'localhost') {
        return true;
    }

    if (filter_var($hostLower, FILTER_VALIDATE_IP)) {
        if (strpos($hostLower, ':') !== false) {
            return $hostLower === '::1';
        }

        $ipLong = ip2long($hostLower);
        if ($ipLong === false) {
            return false;
        }

        return ($ipLong & 0xFF000000) === 0x7F000000;
    }

    return false;
}

function isHttpsRequest(): bool
{
    $appEnv = getenv('APP_ENV') ?: '';
    $isProduction = $appEnv === 'production';
    $trustedProxies = parseTrustedProxies();
    $remoteAddr = $_SERVER['REMOTE_ADDR'] ?? '';
    $isTrustedProxy = isTrustedProxyAddress($remoteAddr, $trustedProxies);

    if ($isTrustedProxy) {
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
    }

    if (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off') {
        return true;
    }

    $serverPort = (int)($_SERVER['SERVER_PORT'] ?? 0);
    if ($serverPort === 443) {
        return true;
    }

    return $isProduction && empty($trustedProxies);
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
$allowedHosts = array_filter(array_map('trim', explode(',', $allowedHostsEnv)));
$allowedHostsLower = array_map('strtolower', $allowedHosts);
$appHost = trim((string)getenv('APP_HOST'));
$defaultHost = $appHost !== '' ? $appHost : ($allowedHosts[0] ?? '');
$isProduction = (getenv('APP_ENV') ?: '') === 'production';

if ($isProduction) {
    $hasAllowedHosts = !empty($allowedHostsLower);
    $hasAppHost = $appHost !== '';
    $defaultHostIsLoopback = $defaultHost === '' ? false : isLoopbackHost($defaultHost);
    if ((!$hasAllowedHosts && !$hasAppHost) || $defaultHostIsLoopback) {
        jsonResponse([
            'error' => 'server_not_configured',
            'message' => 'Set APP_HOST or ALLOWED_OAUTH_HOSTS for production (non-loopback hosts only).',
        ], 500);
    }
}

if ($defaultHost === '') {
    $defaultHost = 'localhost';
}

if (!in_array(strtolower($defaultHost), $allowedHostsLower, true)) {
    $allowedHostsLower[] = strtolower($defaultHost);
}

$scheme = isHttpsRequest() ? 'https' : 'http';
$defaultRedirect = $scheme . '://' . $defaultHost . '/auth_google_callback.php';
$redirectUri = $configuredRedirect ?: $defaultRedirect;

$parsedRedirect = parse_url($redirectUri);
$redirectHost = strtolower($parsedRedirect['host'] ?? '');
$redirectScheme = strtolower($parsedRedirect['scheme'] ?? $scheme);
$redirectPath = $parsedRedirect['path'] ?? '';
$isValidHost = $redirectHost !== '' && in_array($redirectHost, $allowedHostsLower, true);
$isValidScheme = in_array($redirectScheme, ['http', 'https'], true);
$isValidPath = $redirectPath === '/auth_google_callback.php' || str_ends_with($redirectPath, '/auth_google_callback.php');

if ($isProduction && ($redirectHost === 'localhost' || isLoopbackHost($redirectHost))) {
    $isValidHost = false;
}

if (!$isValidHost || !$isValidScheme || !$isValidPath) {
    if ($isProduction && ($redirectHost === '' || $redirectHost === 'localhost' || isLoopbackHost($redirectHost))) {
        jsonResponse([
            'error' => 'server_not_configured',
            'message' => 'Configure GOOGLE_REDIRECT_URI, APP_HOST, or ALLOWED_OAUTH_HOSTS with a non-loopback host.',
        ], 500);
    }

    $redirectUri = $defaultRedirect;
}

$params = [
    'client_id' => $institution['google_client_id'],
    'redirect_uri' => $redirectUri,
    'response_type' => 'code',
    'scope' => 'openid email',
    'state' => $state,
];
$url = 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query($params);
jsonResponse(['url' => $url]);
