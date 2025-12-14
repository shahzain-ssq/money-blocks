<?php
require __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/Auth.php';
$user = Auth::currentUser();
if (!$user) {
    jsonResponse(['user' => null]);
}
jsonResponse(['user' => sanitizeUser($user)]);
