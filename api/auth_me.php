<?php
require_once __DIR__ . '/../src/Helpers.php';
$user = Auth::currentUser();
if (!$user) {
    jsonResponse(['user' => null]);
}
jsonResponse(['user' => $user]);
