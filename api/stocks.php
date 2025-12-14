<?php
require __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/StockService.php';

$user = Auth::requireAuth();
jsonResponse(['stocks' => StockService::listStocks((int)$user['institution_id'])]);
