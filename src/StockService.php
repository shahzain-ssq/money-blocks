<?php
require_once __DIR__ . '/Database.php';

class StockService
{
    /**
     * Build a trusted SQL fragment for the latest price fields.
     * Alias and column values are interpolated directly and must only be called with trusted strings.
     */
    private static function latestPriceFragment(string $alias = 's', string $column = 'price', int $offset = 0): string
    {
        $allowedAliases = ['s'];
        $allowedColumns = ['price', 'created_at'];
        if (!in_array($alias, $allowedAliases, true) || !in_array($column, $allowedColumns, true)) {
            throw new InvalidArgumentException('Invalid alias or column for latestPriceFragment');
        }
        $safeOffset = max(0, $offset);
        $offsetClause = $safeOffset > 0 ? " OFFSET {$safeOffset}" : '';
        return sprintf('(SELECT %s FROM stock_prices WHERE stock_id = %s.id ORDER BY created_at DESC LIMIT 1%s)', $column, $alias, $offsetClause);
    }

    public static function listStocks(int $institutionId): array
    {
        $pdo = Database::getConnection();
        $currentPrice = self::latestPriceFragment();
        $currentTimestamp = self::latestPriceFragment('s', 'created_at');
        $previousPrice = self::latestPriceFragment('s', 'price', 1);
        // updated_at here reflects the latest price timestamp to keep UI displays consistent with price freshness.
        $stmt = $pdo->prepare("SELECT s.*,{$currentPrice} AS current_price,{$currentTimestamp} AS updated_at,{$previousPrice} AS previous_price FROM stocks s WHERE s.institution_id = ? AND s.active = 1 ORDER BY s.ticker");
        $stmt->execute([$institutionId]);
        $stocks = $stmt->fetchAll();
        foreach ($stocks as &$stock) {
            $current = $stock['current_price'] ?? $stock['initial_price'] ?? 0;
            $prevBase = $stock['previous_price'] ?? $stock['initial_price'] ?? 0;
            $change = $current - $prevBase;
            $stock['change'] = $change;
            $stock['change_pct'] = $prevBase ? ($change / $prevBase) * 100 : 0;
        }
        unset($stock);
        return $stocks;
    }

    public static function getById(int $stockId, int $institutionId): ?array
    {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare('SELECT id, ticker, name, initial_price, total_limit, per_user_limit, per_user_short_limit, active FROM stocks WHERE id = ? AND institution_id = ?');
        $stmt->execute([$stockId, $institutionId]);
        $stock = $stmt->fetch();
        return $stock ?: null;
    }

    public static function updatePrice(int $stockId, float $price, int $institutionId): void
    {
        $pdo = Database::getConnection();
        $stockStmt = $pdo->prepare('SELECT id FROM stocks WHERE id = ? AND institution_id = ? AND active = 1');
        $stockStmt->execute([$stockId, $institutionId]);
        if (!$stockStmt->fetch()) {
            throw new RuntimeException('Stock not found for institution');
        }

        $pdo->prepare('INSERT INTO stock_prices (stock_id, price, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)')->execute([$stockId, $price]);
        $pdo->prepare('UPDATE stocks SET updated_at = CURRENT_TIMESTAMP WHERE id = ? AND institution_id = ?')->execute([$stockId, $institutionId]);
    }

    public static function latestPrice(int $stockId, int $institutionId): ?array
    {
        $pdo = Database::getConnection();
        $currentPrice = self::latestPriceFragment('s');
        $updatedAt = self::latestPriceFragment('s', 'created_at');
        $stmt = $pdo->prepare("SELECT s.id, s.ticker, s.name, {$currentPrice} AS current_price, {$updatedAt} AS updated_at FROM stocks s WHERE s.id = ? AND s.institution_id = ? AND s.active = 1");
        $stmt->execute([$stockId, $institutionId]);
        $stock = $stmt->fetch();
        return $stock ?: null;
    }

    public static function searchStocks(int $institutionId, string $query): array
    {
        $pdo = Database::getConnection();
        $trimmed = trim($query);
        if ($trimmed === '') {
            return [];
        }
        $escaped = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $trimmed);
        $like = '%' . $escaped . '%';
        $currentPrice = self::latestPriceFragment();
        $stmt = $pdo->prepare("SELECT s.id, s.ticker, s.name, {$currentPrice} AS current_price
            FROM stocks s WHERE s.institution_id = ? AND s.active = 1 AND (s.ticker LIKE ? ESCAPE '\\\\' OR s.name LIKE ? ESCAPE '\\\\') ORDER BY s.ticker LIMIT 20");
        $stmt->execute([$institutionId, $like, $like]);
        return $stmt->fetchAll();
    }

    public static function history(int $stockId, int $institutionId, int $limit = 30): array
    {
        $pdo = Database::getConnection();
        $limit = max(1, min($limit, 365));
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
