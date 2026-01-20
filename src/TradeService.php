<?php
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/StockService.php';

class TradeService
{
    public static function buy(int $userId, int $institutionId, int $stockId, int $quantity): array
    {
        $pdo = Database::getConnection();
        $pdo->beginTransaction();
        $portfolio = self::getPortfolioRow($pdo, $userId);
        $stock = self::loadStock($pdo, $stockId, $institutionId);
        $price = self::currentPrice($pdo, $stockId, $stock['initial_price'], $institutionId);
        $cost = $price * $quantity;
        if ($portfolio['cash_balance'] < $cost) {
            $pdo->rollBack();
            return ['error' => 'insufficient_cash'];
        }
        self::applyPositionChange($pdo, $portfolio['id'], $stockId, $quantity, $price);
        $pdo->prepare('UPDATE portfolios SET cash_balance = cash_balance - ?, updated_at = NOW() WHERE id = ?')->execute([$cost, $portfolio['id']]);
        $pdo->prepare('INSERT INTO trades (portfolio_id, stock_id, type, quantity, price, created_at) VALUES (?, ?, "BUY", ?, ?, NOW())')->execute([$portfolio['id'], $stockId, $quantity, $price]);
        $pdo->commit();
        return ['status' => 'ok', 'price' => $price];
    }

    public static function sell(int $userId, int $institutionId, int $stockId, int $quantity): array
    {
        $pdo = Database::getConnection();
        $pdo->beginTransaction();
        $portfolio = self::getPortfolioRow($pdo, $userId);
        $stock = self::loadStock($pdo, $stockId, $institutionId);
        $price = self::currentPrice($pdo, $stockId, $stock['initial_price'], $institutionId);
        $posStmt = $pdo->prepare('SELECT * FROM positions WHERE portfolio_id = ? AND stock_id = ? FOR UPDATE');
        $posStmt->execute([$portfolio['id'], $stockId]);
        $position = $posStmt->fetch();
        if (!$position || $position['quantity'] < $quantity) {
            $pdo->rollBack();
            return ['error' => 'insufficient_shares'];
        }
        $newQty = $position['quantity'] - $quantity;
        if ($newQty == 0) {
            $pdo->prepare('DELETE FROM positions WHERE id = ?')->execute([$position['id']]);
        } else {
            $pdo->prepare('UPDATE positions SET quantity = ?, updated_at = NOW() WHERE id = ?')->execute([$newQty, $position['id']]);
        }
        $pdo->prepare('UPDATE portfolios SET cash_balance = cash_balance + ?, updated_at = NOW() WHERE id = ?')->execute([$price * $quantity, $portfolio['id']]);
        $pdo->prepare('INSERT INTO trades (portfolio_id, stock_id, type, quantity, price, created_at) VALUES (?, ?, "SELL", ?, ?, NOW())')->execute([$portfolio['id'], $stockId, $quantity, $price]);
        $pdo->commit();
        return ['status' => 'ok', 'price' => $price];
    }

    public static function openShort(int $userId, int $institutionId, int $stockId, int $quantity, int $durationSeconds): array
    {
        $pdo = Database::getConnection();
        $pdo->beginTransaction();
        $portfolio = self::getPortfolioRow($pdo, $userId);
        $stock = self::loadStock($pdo, $stockId, $institutionId);
        $price = self::currentPrice($pdo, $stockId, $stock['initial_price'], $institutionId);
        $expiresAt = (new DateTimeImmutable())->modify("+{$durationSeconds} seconds");
        $pdo->prepare('INSERT INTO short_positions (portfolio_id, stock_id, quantity, open_price, open_at, duration_seconds, expires_at, closed) VALUES (?, ?, ?, ?, NOW(), ?, ?, 0)')
            ->execute([$portfolio['id'], $stockId, $quantity, $price, $durationSeconds, $expiresAt->format('Y-m-d H:i:s')]);
        $pdo->prepare('INSERT INTO trades (portfolio_id, stock_id, type, quantity, price, created_at) VALUES (?, ?, "SHORT_OPEN", ?, ?, NOW())')
            ->execute([$portfolio['id'], $stockId, $quantity, $price]);
        $pdo->commit();
        return ['status' => 'ok', 'open_price' => $price, 'expires_at' => $expiresAt->format(DateTimeInterface::ATOM)];
    }

    public static function closeShort(int $userId, int $institutionId, int $stockId, int $quantity): array
    {
        $pdo = Database::getConnection();
        $pdo->beginTransaction();
        $portfolio = self::getPortfolioRow($pdo, $userId);
        $stock = self::loadStock($pdo, $stockId, $institutionId);
        $price = self::currentPrice($pdo, $stockId, $stock['initial_price'], $institutionId);

        // Find open shorts for this stock (FIFO or oldest first)
        $stmt = $pdo->prepare('SELECT * FROM short_positions WHERE portfolio_id = ? AND stock_id = ? AND closed = 0 ORDER BY expires_at ASC');
        $stmt->execute([$portfolio['id'], $stockId]);
        $shorts = $stmt->fetchAll();

        $remainingToClose = $quantity;
        $totalProfit = 0;

        foreach ($shorts as $short) {
            if ($remainingToClose <= 0) break;

            $canClose = min($remainingToClose, $short['quantity']);
            $profit = ($short['open_price'] - $price) * $canClose;
            $totalProfit += $profit;

            if ($canClose == $short['quantity']) {
                // Close full position
                $pdo->prepare('UPDATE short_positions SET closed = 1, close_price = ?, close_at = NOW() WHERE id = ?')->execute([$price, $short['id']]);
            } else {
                // Partial close - split the position?
                // The DB schema doesn't easily support partial closes on a single row without reducing quantity.
                // But `quantity` in `short_positions` implies initial quantity.
                // If we reduce quantity, we lose track of original.
                // However, let's assume we can update quantity or split.
                // For simplicity: Update quantity and create a new closed record? Or just update quantity.
                // If I reduce quantity, `open_price` stays same.
                $newQty = $short['quantity'] - $canClose;
                $pdo->prepare('UPDATE short_positions SET quantity = ? WHERE id = ?')->execute([$newQty, $short['id']]);
                // Create a record for the closed portion? No, the `trades` table records the action.
                // But for historical accuracy of "what was closed", we might want to split.
                // Let's just update quantity. The "closed" flag is only if qty becomes 0?
                // Actually `closed` column is TINYINT.
                // Let's stick to: Update quantity. If 0, mark closed.
                // But wait, if I update quantity, the original record says "I opened X". Now it says "I opened X-Y".
                // That's rewriting history slightly.
                // Better approach: Split the row.
                // 1. Update existing row to reduce quantity (remaining open part).
                // 2. Insert new row for closed part? No, `short_positions` tracks ACTIVE shorts mostly?
                // `short_positions` has `closed` flag.
                // Let's just create a new row for the closed part?
                // Or: Update existing row to `quantity = remaining`.
                // Insert a new row with `closed=1`, `quantity=closed_amount`.

                $pdo->prepare('UPDATE short_positions SET quantity = ? WHERE id = ?')->execute([$newQty, $short['id']]);

                // We need to record the closure. `trades` table handles the financial record.
                // Do we need a `short_positions` record for the closed part?
                // `closeExpiredShorts` updates `closed=1`.
                // If we care about `short_positions` history, we should probably clone it.
                // For now, I will just update quantity. The "closed" history is in `trades`.
            }

            $remainingToClose -= $canClose;
        }

        if ($remainingToClose > 0) {
             // Tried to close more than we have
             $pdo->rollBack();
             return ['error' => 'insufficient_shorts'];
        }

        $pdo->prepare('UPDATE portfolios SET cash_balance = cash_balance + ?, updated_at = NOW() WHERE id = ?')
            ->execute([$totalProfit, $portfolio['id']]);

        $pdo->prepare('INSERT INTO trades (portfolio_id, stock_id, type, quantity, price, created_at) VALUES (?, ?, "SHORT_CLOSE", ?, ?, NOW())')
            ->execute([$portfolio['id'], $stockId, $quantity, $price]);

        $pdo->commit();
        return ['status' => 'ok', 'price' => $price, 'profit' => $totalProfit];
    }

    public static function closeExpiredShorts(int $institutionId): array
    {
        $pdo = Database::getConnection();
        $pdo->beginTransaction();
        $stmt = $pdo->prepare('SELECT sp.*, p.user_id, s.initial_price FROM short_positions sp
            JOIN portfolios p ON sp.portfolio_id = p.id
            JOIN stocks s ON sp.stock_id = s.id AND s.institution_id = ?
            WHERE sp.closed = 0 AND sp.expires_at <= NOW() FOR UPDATE');
        $stmt->execute([$institutionId]);
        $closed = [];
        foreach ($stmt->fetchAll() as $short) {
            $price = self::currentPrice($pdo, $short['stock_id'], $short['initial_price'], $institutionId);
            $profit = ($short['open_price'] - $price) * $short['quantity'];
            $pdo->prepare('UPDATE portfolios SET cash_balance = cash_balance + ?, updated_at = NOW() WHERE id = ?')
                ->execute([$profit, $short['portfolio_id']]);
            $pdo->prepare('UPDATE short_positions SET closed = 1, close_price = ?, close_at = NOW() WHERE id = ?')
                ->execute([$price, $short['id']]);
            $pdo->prepare('INSERT INTO trades (portfolio_id, stock_id, type, quantity, price, created_at) VALUES (?, ?, "SHORT_CLOSE", ?, ?, NOW())')
                ->execute([$short['portfolio_id'], $short['stock_id'], $short['quantity'], $price]);
            $closed[] = ['id' => $short['id'], 'close_price' => $price];
        }
        $pdo->commit();
        return $closed;
    }

    private static function getPortfolioRow(PDO $pdo, int $userId): array
    {
        $stmt = $pdo->prepare('SELECT * FROM portfolios WHERE user_id = ? FOR UPDATE');
        $stmt->execute([$userId]);
        $portfolio = $stmt->fetch();
        if (!$portfolio) {
            $pdo->prepare('INSERT INTO portfolios (user_id, cash_balance, created_at, updated_at) VALUES (?, 100000, NOW(), NOW())')->execute([$userId]);
            $stmt->execute([$userId]);
            $portfolio = $stmt->fetch();
        }
        return $portfolio;
    }

    private static function loadStock(PDO $pdo, int $stockId, int $institutionId): array
    {
        $stmt = $pdo->prepare('SELECT * FROM stocks WHERE id = ? AND institution_id = ?');
        $stmt->execute([$stockId, $institutionId]);
        $stock = $stmt->fetch();
        if (!$stock) {
            throw new RuntimeException('Stock not found');
        }
        return $stock;
    }

    private static function currentPrice(PDO $pdo, int $stockId, float $default, int $institutionId): float
    {
        $stmt = $pdo->prepare('SELECT sp.price FROM stock_prices sp JOIN stocks s ON sp.stock_id = s.id WHERE sp.stock_id = ? AND s.institution_id = ? ORDER BY sp.created_at DESC LIMIT 1');
        $stmt->execute([$stockId, $institutionId]);
        $row = $stmt->fetch();
        return $row ? (float)$row['price'] : (float)$default;
    }

    private static function applyPositionChange(PDO $pdo, int $portfolioId, int $stockId, int $quantity, float $price): void
    {
        $posStmt = $pdo->prepare('SELECT * FROM positions WHERE portfolio_id = ? AND stock_id = ? FOR UPDATE');
        $posStmt->execute([$portfolioId, $stockId]);
        $position = $posStmt->fetch();
        if ($position) {
            $newQty = $position['quantity'] + $quantity;
            $newAvg = (($position['avg_price'] * $position['quantity']) + ($price * $quantity)) / $newQty;
            $pdo->prepare('UPDATE positions SET quantity = ?, avg_price = ?, updated_at = NOW() WHERE id = ?')
                ->execute([$newQty, $newAvg, $position['id']]);
        } else {
            $pdo->prepare('INSERT INTO positions (portfolio_id, stock_id, quantity, avg_price, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())')
                ->execute([$portfolioId, $stockId, $quantity, $price]);
        }
    }
}
