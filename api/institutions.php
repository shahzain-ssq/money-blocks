<?php
require __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/InstitutionService.php';
initApiRequest();
jsonResponse(['institutions' => InstitutionService::listInstitutions()]);
