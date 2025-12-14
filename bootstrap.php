<?php
declare(strict_types=1);

$envPath = __DIR__ . '/.env';

if (!is_readable($envPath)) {
    return;
}

$lines = file($envPath, FILE_IGNORE_NEW_LINES);

if ($lines === false) {
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
}
