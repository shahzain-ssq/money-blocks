<?php
require __DIR__ . '/../bootstrap.php';

// Simple front controller for PHP built-in server usage
$uri = $_SERVER['REQUEST_URI'];
$path = parse_url($uri, PHP_URL_PATH);

// Serve static assets directly if they exist
if (file_exists(__DIR__ . $path) && !is_dir(__DIR__ . $path)) {
    return false; // serve standard file
}

// Check for .html extension mapping
if (file_exists(__DIR__ . $path . '.html')) {
    require __DIR__ . $path . '.html';
    exit;
}

// Default to index.html (or 404 behavior, but typically SPA/App fallback to index is handled here or allowed to fail)
// If we want "clean URLs" that are not .html files, we might fall back to index.html if it's an SPA.
// But this app seems to be multi-page (dashboard.html, trade.html).
// So if /dashboard is requested, we handled it above.
// If /foo is requested and foo.html doesn't exist, what then?
// For now, let's just serve index.html as a fallback for the root, or 404.
if ($path === '/' || $path === '/index.php') {
    require __DIR__ . '/index.html';
    exit;
}

// 404
http_response_code(404);
echo "Not Found";
