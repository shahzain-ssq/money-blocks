<?php
require_once __DIR__ . '/Database.php';

class InstitutionService
{
    public static function listInstitutions(): array
    {
        $pdo = Database::getConnection();
        return $pdo->query('SELECT id, name, google_allowed_domain FROM institutions ORDER BY name')->fetchAll();
    }

    public static function getInstitution(int $id): ?array
    {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare('SELECT * FROM institutions WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }
}
