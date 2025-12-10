<?php
require_once __DIR__ . '/Auth.php';

function jsonResponse($data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
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
        jsonResponse(['error' => 'forbidden'], 403);
    }
}
