<?php
require_once __DIR__ . '/Database.php';

class StockService
{
    public static function listStocks(int $institutionId): array
    {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare('SELECT s.*, (
                SELECT price FROM stock_prices WHERE stock_id = s.id ORDER BY created_at DESC LIMIT 1
            ) AS current_price
            FROM stocks s WHERE s.institution_id = ? AND s.active = 1 ORDER BY s.ticker');
        $stmt->execute([$institutionId]);
        return $stmt->fetchAll();
    }

    public static function updatePrice(int $stockId, float $price, int $institutionId): void
    {
        $pdo = Database::getConnection();
        $pdo->prepare('INSERT INTO stock_prices (stock_id, price, created_at) VALUES (?, ?, NOW())')->execute([$stockId, $price]);
        $pdo->prepare('UPDATE stocks SET updated_at = NOW() WHERE id = ? AND institution_id = ?')->execute([$stockId, $institutionId]);
    }
}
