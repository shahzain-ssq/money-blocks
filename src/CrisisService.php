<?php
require_once __DIR__ . '/Database.php';

class CrisisService
{
    public static function listByInstitution(int $institutionId): array
    {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare('SELECT * FROM crisis_scenarios
            WHERE institution_id = ?
              AND status = \'published\'
              AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
              AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)
            ORDER BY COALESCE(starts_at, created_at) DESC, created_at DESC');
        $stmt->execute([$institutionId]);
        return $stmt->fetchAll();
    }

    public static function managerList(int $institutionId): array
    {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare('SELECT * FROM crisis_scenarios WHERE institution_id = ? ORDER BY created_at DESC');
        $stmt->execute([$institutionId]);
        return $stmt->fetchAll();
    }
}
