<?php
require_once __DIR__ . '/Auth.php';

function jsonResponse($data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

function requireManager(array $user): void
{
    if ($user['role'] !== 'manager' && $user['role'] !== 'admin') {
        jsonResponse(['error' => 'forbidden'], 403);
    }
}
