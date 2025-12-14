<?php
require __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/CrisisService.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/Database.php';

$user = Auth::requireAuth();
jsonResponse(['scenarios' => CrisisService::listByInstitution((int)$user['institution_id'])]);
