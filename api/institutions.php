<?php
require_once __DIR__ . '/../src/Helpers.php';
require_once __DIR__ . '/../src/InstitutionService.php';
jsonResponse(['institutions' => InstitutionService::listInstitutions()]);
