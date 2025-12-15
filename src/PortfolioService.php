<?php
require_once __DIR__ . '/Database.php';

class PortfolioService
{
    private static function getCurrentPriceSubquery(): string
    {
        return '(SELECT price FROM stock_prices WHERE stock_id = s.id ORDER BY created_at DESC LIMIT 1)';
    }

    public static function getUserPortfolio(int $userId, int $institutionId): array
    {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare('SELECT * FROM portfolios WHERE user_id = ?');
        $stmt->execute([$userId]);
        $portfolio = $stmt->fetch();
        if (!$portfolio) {
            $pdo->prepare('INSERT INTO portfolios (user_id, cash_balance, created_at, updated_at) VALUES (?, 100000, NOW(), NOW())')->execute([$userId]);
            $portfolio = ['id' => $pdo->lastInsertId(), 'user_id' => $userId, 'cash_balance' => 100000];
        }
        $priceSubquery = self::getCurrentPriceSubquery();
        $positionsStmt = $pdo->prepare("SELECT p.*, s.ticker, s.name,
                $priceSubquery AS current_price
            FROM positions p JOIN stocks s ON p.stock_id = s.id AND s.institution_id = ? WHERE p.portfolio_id = ?");
        $positionsStmt->execute([$institutionId, $portfolio['id']]);
        $positions = $positionsStmt->fetchAll();
        $portfolioValue = 0;
        $unrealized = 0;
        foreach ($positions as &$pos) {
            $current = $pos['current_price'] ?? $pos['avg_price'] ?? 0;
            $avg = $pos['avg_price'] ?? 0;
            $pos['position_value'] = $current * $pos['quantity'];
            $pos['unrealized_pl'] = ($current - $avg) * $pos['quantity'];
            $portfolioValue += $pos['position_value'];
            $unrealized += $pos['unrealized_pl'];
        }

        $shortsStmt = $pdo->prepare("SELECT sp.*, s.ticker,
                $priceSubquery AS current_price
            FROM short_positions sp JOIN stocks s ON sp.stock_id = s.id WHERE sp.portfolio_id = ? AND s.institution_id = ? AND sp.closed = 0");
        $shortsStmt->execute([$portfolio['id'], $institutionId]);
        $shorts = $shortsStmt->fetchAll();
        foreach ($shorts as &$sh) {
            $current = $sh['current_price'] ?? $sh['open_price'] ?? 0;
            $open = $sh['open_price'] ?? 0;
            $sh['pl'] = ($open - $current) * $sh['quantity'];
            $portfolioValue -= $current * $sh['quantity'];
            $unrealized += $sh['pl'];
        }

        return [
            'portfolio' => $portfolio,
            'positions' => $positions,
            'shorts' => $shorts,
            'totals' => [
                'portfolio_value' => $portfolioValue,
                'unrealized' => $unrealized,
                // TODO: track realized P&L when closing positions
                'realized' => 0,
            ],
        ];
    }
}
