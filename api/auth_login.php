<?php
require __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/InstitutionService.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/RateLimiter.php';
require_once __DIR__ . '/../src/Proxy.php';

initApiRequest();

const LOGIN_RATE_LIMIT_WINDOW = 300; // 5 minutes
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;

function getRateLimitKey(int $institutionId): string
{
    $trustedProxies = parseTrustedProxies();
    $remoteAddr = $_SERVER['REMOTE_ADDR'] ?? '';
    $ip = $remoteAddr !== '' ? $remoteAddr : 'unknown';

    if (isTrustedProxyAddress($remoteAddr, $trustedProxies)) {
        $forwardedFor = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
        if ($forwardedFor !== '') {
            $ip = trim(explode(',', $forwardedFor)[0]);
        }
    }
    return $institutionId . '|' . $ip;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'POST';

if ($method === 'DELETE') {
    Auth::logout();
    jsonResponse(['ok' => true]);
}

if ($method !== 'POST') {
    jsonError('method_not_allowed', 'Method not allowed.', 405);
}

$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
$identifier = $input['identifier'] ?? '';
$password = $input['password'] ?? '';
$institutionId = (int)($input['institution_id'] ?? 0);
if (!$identifier || !$password || !$institutionId) {
    jsonError('missing_fields', 'Identifier, password, and institution are required.', 422);
}
$institution = InstitutionService::getInstitution($institutionId);
if (!$institution) {
    jsonError('invalid_institution', 'Institution not found.', 400);
}
$rateLimiter = new RateLimiter(
    RateLimitStoreFactory::create(),
    LOGIN_RATE_LIMIT_WINDOW,
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS
);
$rateLimitKey = getRateLimitKey($institutionId);
if ($rateLimiter->tooManyAttempts($rateLimitKey)) {
    jsonError('too_many_attempts', 'Too many login attempts. Please wait and try again.', 429);
}
$user = Auth::login($identifier, $password, $institutionId);
if (!$user) {
    $rateLimiter->recordFailure($rateLimitKey);
    jsonError('invalid_credentials', 'Invalid credentials provided.', 401);
}
$rateLimiter->reset($rateLimitKey);
$safeUser = [
    'id' => (int)$user['id'],
    'institution_id' => (int)$user['institution_id'],
    'role' => $user['role'],
];
jsonResponse(['user' => $safeUser]);
