<?php
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/InstitutionService.php';
require_once __DIR__ . '/../src/Auth.php';

const LOGIN_RATE_LIMIT_WINDOW = 300; // 5 minutes
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;

function getRateLimitKey(int $institutionId): string
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    return $institutionId . '|' . $ip;
}

function getRateLimitFile(string $key): string
{
    return sys_get_temp_dir() . '/auth_attempts_' . md5($key) . '.json';
}

function readRateLimit(string $key): array
{
    $file = getRateLimitFile($key);
    if (!file_exists($file)) {
        return ['count' => 0, 'expires_at' => time() + LOGIN_RATE_LIMIT_WINDOW];
    }
    $data = json_decode((string)file_get_contents($file), true);
    if (!is_array($data) || !isset($data['count'], $data['expires_at'])) {
        return ['count' => 0, 'expires_at' => time() + LOGIN_RATE_LIMIT_WINDOW];
    }
    if ((int)$data['expires_at'] <= time()) {
        return ['count' => 0, 'expires_at' => time() + LOGIN_RATE_LIMIT_WINDOW];
    }
    return ['count' => (int)$data['count'], 'expires_at' => (int)$data['expires_at']];
}

function writeRateLimit(string $key, array $data): void
{
    $file = getRateLimitFile($key);
    $payload = json_encode([
        'count' => (int)$data['count'],
        'expires_at' => (int)$data['expires_at'],
    ]);
    file_put_contents($file, $payload, LOCK_EX);
}

function incrementFailedAttempt(string $key): void
{
    $rate = readRateLimit($key);
    $rate['count'] = $rate['expires_at'] <= time() ? 1 : $rate['count'] + 1;
    $rate['expires_at'] = $rate['expires_at'] <= time() ? time() + LOGIN_RATE_LIMIT_WINDOW : $rate['expires_at'];
    writeRateLimit($key, $rate);
}

function resetRateLimit(string $key): void
{
    $file = getRateLimitFile($key);
    if (file_exists($file)) {
        unlink($file);
    }
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
$rateLimitKey = getRateLimitKey($institutionId);
$rateData = readRateLimit($rateLimitKey);
if ($rateData['count'] >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS && $rateData['expires_at'] > time()) {
    jsonResponse(['error' => 'too_many_attempts'], 429);
}
$user = Auth::login($identifier, $password, $institutionId);
if (!$user) {
    incrementFailedAttempt($rateLimitKey);
    jsonResponse(['error' => 'invalid_credentials'], 401);
}
resetRateLimit($rateLimitKey);
$safeUser = [
    'id' => (int)$user['id'],
    'institution_id' => (int)$user['institution_id'],
    'role' => $user['role'],
];
jsonResponse(['user' => $safeUser]);
