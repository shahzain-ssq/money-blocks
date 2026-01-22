<?php
require_once __DIR__ . '/Database.php';

class ScenarioService
{
    public static function getAll(int $institutionId): array
    {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare('SELECT * FROM crisis_scenarios WHERE institution_id = ? ORDER BY created_at DESC');
        $stmt->execute([$institutionId]);
        return $stmt->fetchAll();
    }

    public static function create(int $institutionId, string $title, string $description, string $status, ?string $startsAt): int
    {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare('INSERT INTO crisis_scenarios (institution_id, title, description, status, starts_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)');
        $stmt->execute([$institutionId, $title, $description, $status, $startsAt]);
        return (int)$pdo->lastInsertId();
    }

    public static function update(int $id, int $institutionId, string $title, string $description, string $status, ?string $startsAt): bool
    {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare('UPDATE crisis_scenarios SET title = ?, description = ?, status = ?, starts_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND institution_id = ?');
        return $stmt->execute([$title, $description, $status, $startsAt, $id, $institutionId]);
    }

    public static function getLiveForUser(int $userId, int $institutionId): array
    {
        $pdo = Database::getConnection();
        // Live scenarios: status='published' AND starts_at <= CURRENT_TIMESTAMP (or null, if immediate).
        // We assume starts_at is UTC.
        // Also fetch read status.
        $sql = "SELECT s.*,
                (CASE WHEN sr.read_at IS NOT NULL THEN 1 ELSE 0 END) as is_read
                FROM crisis_scenarios s
                LEFT JOIN scenario_reads sr ON s.id = sr.scenario_id AND sr.user_id = ?
                WHERE s.institution_id = ?
                  AND s.status = 'published'
                  AND (s.starts_at IS NULL OR s.starts_at <= CURRENT_TIMESTAMP)
                ORDER BY s.starts_at DESC, s.created_at DESC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$userId, $institutionId]);
        return $stmt->fetchAll();
    }

    public static function markAsRead(int $userId, int $scenarioId): bool
    {
        $pdo = Database::getConnection();
        // Check if already read
        $stmt = $pdo->prepare('SELECT 1 FROM scenario_reads WHERE user_id = ? AND scenario_id = ?');
        $stmt->execute([$userId, $scenarioId]);
        if ($stmt->fetch()) return true;

        $stmt = $pdo->prepare('INSERT INTO scenario_reads (user_id, scenario_id, read_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
        return $stmt->execute([$userId, $scenarioId]);
    }

    public static function toggleRead(int $userId, int $scenarioId, bool $read): bool
    {
        $pdo = Database::getConnection();
        if ($read) {
             return self::markAsRead($userId, $scenarioId);
        } else {
             $stmt = $pdo->prepare('DELETE FROM scenario_reads WHERE user_id = ? AND scenario_id = ?');
             return $stmt->execute([$userId, $scenarioId]);
        }
    }

    public static function getUnreadCount(int $userId, int $institutionId): int
    {
        $pdo = Database::getConnection();
        $sql = "SELECT COUNT(*) as cnt
                FROM crisis_scenarios s
                LEFT JOIN scenario_reads sr ON s.id = sr.scenario_id AND sr.user_id = ?
                WHERE s.institution_id = ?
                  AND s.status = 'published'
                  AND (s.starts_at IS NULL OR s.starts_at <= CURRENT_TIMESTAMP)
                  AND sr.read_at IS NULL";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$userId, $institutionId]);
        $row = $stmt->fetch();
        return $row ? (int)$row['cnt'] : 0;
    }
}
