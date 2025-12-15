<?php
require_once __DIR__ . '/Database.php';

class StockService
{
    public static function listStocks(int $institutionId): array
    {
        $pdo = Database::getConnection();
        // TODO: optimize correlated subqueries with a derived latest-price table when datasets grow
        $stmt = $pdo->prepare('SELECT s.*, 
                (SELECT price FROM stock_prices WHERE stock_id = s.id ORDER BY created_at DESC LIMIT 1) AS current_price,
                (SELECT created_at FROM stock_prices WHERE stock_id = s.id ORDER BY created_at DESC LIMIT 1) AS updated_at,
                (SELECT price FROM stock_prices WHERE stock_id = s.id ORDER BY created_at DESC LIMIT 1 OFFSET 1) AS previous_price
            FROM stocks s WHERE s.institution_id = ? AND s.active = 1 ORDER BY s.ticker');
        $stmt->execute([$institutionId]);
        $stocks = $stmt->fetchAll();
        foreach ($stocks as &$stock) {
            $current = $stock['current_price'] ?? $stock['initial_price'];
            $prevBase = $stock['previous_price'] ?? $stock['initial_price'];
            $change = ($current ?? 0) - ($prevBase ?? 0);
            $stock['change'] = $change;
            $stock['change_pct'] = ($prevBase ?? 0) ? ($change / $prevBase) * 100 : 0;
        }
        return $stocks;
    }

    public static function updatePrice(int $stockId, float $price, int $institutionId): void
    {
        $pdo = Database::getConnection();
        $stockStmt = $pdo->prepare('SELECT id FROM stocks WHERE id = ? AND institution_id = ? AND active = 1');
        $stockStmt->execute([$stockId, $institutionId]);
        if (!$stockStmt->fetch()) {
            throw new RuntimeException('Stock not found for institution');
        }

        $pdo->prepare('INSERT INTO stock_prices (stock_id, price, created_at) VALUES (?, ?, NOW())')->execute([$stockId, $price]);
        $pdo->prepare('UPDATE stocks SET updated_at = NOW() WHERE id = ? AND institution_id = ?')->execute([$stockId, $institutionId]);
    }

    public static function latestPrice(int $stockId, int $institutionId): ?array
    {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare('SELECT s.id, s.ticker, s.name, (
                SELECT price FROM stock_prices WHERE stock_id = s.id ORDER BY created_at DESC LIMIT 1
            ) AS current_price,
            (SELECT created_at FROM stock_prices WHERE stock_id = s.id ORDER BY created_at DESC LIMIT 1) AS updated_at
            FROM stocks s WHERE s.id = ? AND s.institution_id = ? AND s.active = 1');
        $stmt->execute([$stockId, $institutionId]);
        $stock = $stmt->fetch();
        return $stock ?: null;
    }

    public static function searchStocks(int $institutionId, string $query): array
    {
        $pdo = Database::getConnection();
        $escaped = addcslashes($query, '%_\\');
        $like = '%' . $escaped . '%';
        $stmt = $pdo->prepare('SELECT s.id, s.ticker, s.name, (
                SELECT price FROM stock_prices WHERE stock_id = s.id ORDER BY created_at DESC LIMIT 1
            ) AS current_price
            FROM stocks s WHERE s.institution_id = ? AND s.active = 1 AND (s.ticker LIKE ? OR s.name LIKE ?) ORDER BY s.ticker LIMIT 20');
        $stmt->execute([$institutionId, $like, $like]);
        return $stmt->fetchAll();
    }

    public static function history(int $stockId, int $institutionId, int $limit = 30): array
    {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare('SELECT s.id FROM stocks s WHERE s.id = ? AND s.institution_id = ? AND s.active = 1');
        $stmt->execute([$stockId, $institutionId]);
        if (!$stmt->fetch()) {
            throw new RuntimeException('Stock not found');
        }
        $historyStmt = $pdo->prepare('SELECT price, created_at FROM stock_prices WHERE stock_id = ? ORDER BY created_at DESC LIMIT ?');
        $historyStmt->bindValue(1, $stockId, PDO::PARAM_INT);
        $historyStmt->bindValue(2, $limit, PDO::PARAM_INT);
        $historyStmt->execute();
        return $historyStmt->fetchAll();
    }
}
