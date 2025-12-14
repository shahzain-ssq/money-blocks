<?php
declare(strict_types=1);

/**
 * Minimal .env loader supporting KEY=VALUE lines with optional single/double quotes.
 * Blank lines and lines beginning with # are ignored. No variable expansion or
 * escape sequences are processed. Requires PHP 8+ for str_starts_with/str_contains.
 */

if (!function_exists('str_starts_with')) {
    trigger_error('bootstrap.php requires PHP 8 or higher.', E_USER_WARNING);
    return;
}

$envPath = __DIR__ . '/.env';
$environment = getenv('APP_ENV') ?: ($_ENV['APP_ENV'] ?? '');
$shouldWarn = $environment !== 'production';

if (!is_readable($envPath)) {
    if ($shouldWarn) {
        trigger_error("bootstrap.php: .env is missing or unreadable at {$envPath}.", E_USER_WARNING);
    }
    return;
}

$lines = file($envPath, FILE_IGNORE_NEW_LINES);

if ($lines === false) {
    if ($shouldWarn) {
        trigger_error('bootstrap.php: unable to read .env contents.', E_USER_WARNING);
    }
    return;
}

foreach ($lines as $line) {
    $line = trim($line);

    if ($line === '' || str_starts_with($line, '#')) {
        continue;
    }

    if (!str_contains($line, '=')) {
        continue;
    }

    [$key, $value] = explode('=', $line, 2);

    $key = trim($key);
    $value = trim($value);

    if ($key === '' || getenv($key) !== false) {
        continue;
    }

    $firstChar = $value[0] ?? '';
    $lastChar = $value !== '' ? $value[strlen($value) - 1] : '';

    if (($firstChar === '"' && $lastChar === '"') || ($firstChar === "'" && $lastChar === "'")) {
        $value = substr($value, 1, -1);
    }

    putenv($key . '=' . $value);
    $_ENV[$key] = $value;
    $_SERVER[$key] = $value;
}
