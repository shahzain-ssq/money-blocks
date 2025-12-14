<?php
require __DIR__ . '/../bootstrap.php';
// Simple front controller for PHP built-in server usage
if (preg_match('/\.(?:png|jpg|jpeg|gif|css|js|html)$/', $_SERVER['REQUEST_URI'])) {
    return false;
}
require __DIR__ . '/index.html';
