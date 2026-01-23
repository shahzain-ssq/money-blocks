<?php
declare(strict_types=1);

function envOrDefault(string $key, string $default = ''): string
{
    $value = getenv($key);
    return $value !== false && $value !== '' ? $value : $default;
}

function fail(string $message, int $code = 1): void
{
    fwrite(STDERR, $message . PHP_EOL);
    exit($code);
}

$host = envOrDefault('DB_HOST', '127.0.0.1');
$port = envOrDefault('DB_PORT', '3306');
$name = envOrDefault('DB_NAME');
$user = envOrDefault('DB_USER');
$pass = envOrDefault('DB_PASSWORD');

if ($name === '' || $user === '') {
    fail('Missing DB_NAME or DB_USER environment variables.');
}

$dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $host, $port, $name);

try {
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET time_zone = '+00:00'",
    ]);
} catch (Throwable $e) {
    fail('Database connection failed: ' . $e->getMessage());
}

$requiredTables = [
    'institutions',
    'users',
    'stocks',
    'stock_prices',
    'portfolios',
    'positions',
    'short_positions',
    'trades',
    'crisis_scenarios',
    'short_duration_options',
    'scenario_reads',
    'rate_limit_buckets',
];

$tableStmt = $pdo->prepare('SELECT table_name FROM information_schema.tables WHERE table_schema = ?');
$tableStmt->execute([$name]);
$existingTables = array_map('strtolower', array_column($tableStmt->fetchAll(), 'table_name'));

$missing = array_values(array_diff($requiredTables, $existingTables));
if (!empty($missing)) {
    fail('Missing required tables: ' . implode(', ', $missing));
}

try {
    $pdo->beginTransaction();

    $token = bin2hex(random_bytes(4));
    $institutionName = 'Sanity Check ' . $token;
    $pdo->prepare('INSERT INTO institutions (name, created_at, updated_at) VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)')
        ->execute([$institutionName]);
    $institutionId = (int)$pdo->lastInsertId();

    $email = "sanity_{$token}@example.com";
    $username = "sanity_{$token}";
    $passwordHash = password_hash('sanity-pass', PASSWORD_DEFAULT);
    $pdo->prepare('INSERT INTO users (institution_id, email, username, role, password_hash, created_at, updated_at) VALUES (?, ?, ?, "student", ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)')
        ->execute([$institutionId, $email, $username, $passwordHash]);
    $userId = (int)$pdo->lastInsertId();

    $pdo->prepare('INSERT INTO portfolios (user_id, cash_balance, created_at, updated_at) VALUES (?, 100000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)')
        ->execute([$userId]);
    $portfolioId = (int)$pdo->lastInsertId();

    $ticker = 'SNY' . strtoupper($token);
    $pdo->prepare('INSERT INTO stocks (institution_id, ticker, name, initial_price, active, created_at, updated_at) VALUES (?, ?, ?, 25.00, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)')
        ->execute([$institutionId, $ticker, 'Sanity Stock',]);
    $stockId = (int)$pdo->lastInsertId();

    $pdo->prepare('INSERT INTO stock_prices (stock_id, price, created_at) VALUES (?, 25.25, CURRENT_TIMESTAMP)')
        ->execute([$stockId]);

    $pdo->prepare('INSERT INTO trades (portfolio_id, stock_id, type, quantity, price, created_at) VALUES (?, ?, "BUY", 10, 25.25, CURRENT_TIMESTAMP)')
        ->execute([$portfolioId, $stockId]);
    $tradeId = (int)$pdo->lastInsertId();

    $updateStmt = $pdo->prepare('UPDATE portfolios SET cash_balance = cash_balance - 100 WHERE id = ?');
    $updateStmt->execute([$portfolioId]);
    if ($updateStmt->rowCount() === 0) {
        throw new RuntimeException('Portfolio update check failed.');
    }

    $deleteStmt = $pdo->prepare('DELETE FROM trades WHERE id = ?');
    $deleteStmt->execute([$tradeId]);
    if ($deleteStmt->rowCount() === 0) {
        throw new RuntimeException('Trade delete check failed.');
    }

    $portfolioCheck = $pdo->prepare('SELECT cash_balance FROM portfolios WHERE user_id = ?');
    $portfolioCheck->execute([$userId]);
    if (!$portfolioCheck->fetch()) {
        throw new RuntimeException('Portfolio lookup failed.');
    }

    $priceCheck = $pdo->prepare('SELECT price FROM stock_prices WHERE stock_id = ? ORDER BY created_at DESC LIMIT 1');
    $priceCheck->execute([$stockId]);
    if (!$priceCheck->fetch()) {
        throw new RuntimeException('Stock price lookup failed.');
    }

    $tradeCheck = $pdo->prepare('SELECT id FROM trades WHERE portfolio_id = ? LIMIT 1');
    $tradeCheck->execute([$portfolioId]);
    if ($tradeCheck->fetch()) {
        throw new RuntimeException('Trade delete check did not remove the test trade.');
    }

    $pdo->rollBack();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fail('DB sanity check failed: ' . $e->getMessage());
}

echo "DB sanity check passed.\n";
