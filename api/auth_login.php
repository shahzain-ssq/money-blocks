<?php
require __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/InstitutionService.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/RateLimiter.php';

const LOGIN_RATE_LIMIT_WINDOW = 300; // 5 minutes
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;

function getRateLimitKey(int $institutionId): string
{
    // Check X-Forwarded-For from trusted proxies, fallback to REMOTE_ADDR
    $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    // If X-Forwarded-For contains multiple IPs, take the first (client IP)
    if (strpos($ip, ',') !== false) {
        $ip = trim(explode(',', $ip)[0]);
    }
    return $institutionId . '|' . $ip;
}

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
$rateLimiter = new RateLimiter(
    RateLimitStoreFactory::create(),
    LOGIN_RATE_LIMIT_WINDOW,
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS
);
$rateLimitKey = getRateLimitKey($institutionId);
if ($rateLimiter->tooManyAttempts($rateLimitKey)) {
    jsonResponse(['error' => 'too_many_attempts'], 429);
}
$user = Auth::login($identifier, $password, $institutionId);
if (!$user) {
    $rateLimiter->recordFailure($rateLimitKey);
    jsonResponse(['error' => 'invalid_credentials'], 401);
}
$rateLimiter->reset($rateLimitKey);
$safeUser = [
    'id' => (int)$user['id'],
    'institution_id' => (int)$user['institution_id'],
    'role' => $user['role'],
];
jsonResponse(['user' => $safeUser]);
