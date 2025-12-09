<?php
require_once __DIR__ . '/Database.php';

class PortfolioService
{
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
        $positionsStmt = $pdo->prepare('SELECT p.*, s.ticker, s.name FROM positions p JOIN stocks s ON p.stock_id = s.id AND s.institution_id = ? WHERE p.portfolio_id = ?');
        $positionsStmt->execute([$institutionId, $portfolio['id']]);
        $shortsStmt = $pdo->prepare('SELECT sp.*, s.ticker FROM short_positions sp JOIN stocks s ON sp.stock_id = s.id WHERE sp.portfolio_id = ? AND sp.closed = 0');
        $shortsStmt->execute([$portfolio['id']]);
        return [
            'portfolio' => $portfolio,
            'positions' => $positionsStmt->fetchAll(),
            'shorts' => $shortsStmt->fetchAll(),
        ];
    }
}
