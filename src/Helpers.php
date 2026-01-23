<?php
require_once __DIR__ . '/Auth.php';

function jsonResponse($data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

function jsonError(string $code, string $message, int $status = 400, array $meta = []): void
{
    $payload = ['error' => ['code' => $code, 'message' => $message]];
    if (!empty($meta)) {
        $payload['error']['meta'] = $meta;
    }
    logDev(sprintf('API error [%s]: %s', $code, $message));
    jsonResponse($payload, $status);
}

function initApiRequest(): void
{
    static $initialized = false;
    if ($initialized) {
        return;
    }
    $initialized = true;

    set_error_handler(function (int $severity, string $message, string $file, int $line): bool {
        if (!(error_reporting() & $severity)) {
            return false;
        }
        throw new ErrorException($message, 0, $severity, $file, $line);
    });

    set_exception_handler(function (Throwable $e): void {
        $env = getenv('APP_ENV') ?: 'production';
        $isProduction = $env === 'production';
        $code = $e instanceof PDOException ? 'db_error' : 'server_error';
        $message = $isProduction
            ? 'Something went wrong while processing your request. Please try again.'
            : $e->getMessage();

        error_log(sprintf(
            "[%s] %s in %s:%d\n%s",
            $code,
            $e->getMessage(),
            $e->getFile(),
            $e->getLine(),
            $e->getTraceAsString()
        ));

        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json');
        }

        echo json_encode(['error' => ['code' => $code, 'message' => $message]]);
        exit;
    });
}

function logDev(string $message): void
{
    $env = getenv('APP_ENV') ?: 'production';
    if ($env !== 'production') {
        error_log($message);
    }
}

function sanitizeUser(array $user): array
{
    return [
        'id' => (int)$user['id'],
        'institution_id' => (int)$user['institution_id'],
        'email' => $user['email'],
        'username' => $user['username'],
        'role' => $user['role'],
        'created_at' => $user['created_at'],
        'updated_at' => $user['updated_at'],
    ];
}

function requireManager(array $user): void
{
    if ($user['role'] !== 'manager' && $user['role'] !== 'admin') {
        jsonError('forbidden', 'You do not have permission to access this resource.', 403);
    }
}

function validateTimeRange($startsAt, $endsAt): void
{
    if ($startsAt !== null && $startsAt !== '' && $endsAt !== null && $endsAt !== '') {
        $startTimestamp = strtotime($startsAt);
        $endTimestamp = strtotime($endsAt);
        if ($startTimestamp === false || $endTimestamp === false || $startTimestamp >= $endTimestamp) {
            jsonError('invalid_time_range', 'Start time must be before end time.', 422);
        }
    }
}
