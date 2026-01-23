<?php
require __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/PortfolioService.php';

initApiRequest();

$user = Auth::requireAuth();
jsonResponse(PortfolioService::getUserPortfolio((int)$user['id'], (int)$user['institution_id']));
