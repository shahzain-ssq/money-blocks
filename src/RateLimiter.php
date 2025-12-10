<?php
require_once __DIR__ . '/Database.php';

interface RateLimitStore
{
    /**
     * @return array{count:int, expires_at:int}
     */
    public function get(string $key, int $window): array;

    public function increment(string $key, int $window): int;

    public function reset(string $key): void;
}

class FileRateLimitStore implements RateLimitStore
{
    private string $directory;

    public function __construct(?string $directory = null)
    {
        $this->directory = $directory ?: sys_get_temp_dir();
    }

    private function getFilePath(string $key): string
    {
        return $this->directory . '/auth_attempts_' . md5($key) . '.json';
    }

    public function get(string $key, int $window): array
    {
        $file = $this->getFilePath($key);
        if (!file_exists($file)) {
            return ['count' => 0, 'expires_at' => time() + $window];
        }

        $data = json_decode((string)@file_get_contents($file), true);
        if (!is_array($data) || !isset($data['count'], $data['expires_at'])) {
            return ['count' => 0, 'expires_at' => time() + $window];
        }

        $count = (int)$data['count'];
        $expiresAt = (int)$data['expires_at'];

        if ($expiresAt <= time()) {
            return ['count' => 0, 'expires_at' => time() + $window];
        }

        return ['count' => $count, 'expires_at' => $expiresAt];
    }

    public function increment(string $key, int $window): int
    {
        $data = $this->get($key, $window);
        if ($data['expires_at'] <= time()) {
            $data['count'] = 1;
            $data['expires_at'] = time() + $window;
        } else {
            $data['count']++;
        }

        $payload = json_encode([
            'count' => $data['count'],
            'expires_at' => $data['expires_at'],
        ]);

        file_put_contents($this->getFilePath($key), $payload, LOCK_EX);

        return $data['count'];
    }

    public function reset(string $key): void
    {
        $file = $this->getFilePath($key);
        if (file_exists($file)) {
            unlink($file);
        }
    }
}

class RedisRateLimitStore implements RateLimitStore
{
    private Redis $redis;

    public function __construct(Redis $redis)
    {
        $this->redis = $redis;
    }

    public function get(string $key, int $window): array
    {
        $ttl = $this->redis->ttl($key);
        if ($ttl === -2) {
            return ['count' => 0, 'expires_at' => time() + $window];
        }

        $count = (int)$this->redis->get($key);
        if ($ttl === -1) {
            $this->redis->expire($key, $window);
            return ['count' => $count, 'expires_at' => time() + $window];
        }

        return ['count' => $count, 'expires_at' => time() + $ttl];
    }

    public function increment(string $key, int $window): int
    {
        $count = $this->redis->incr($key);
        if ($count === 1 || $this->redis->ttl($key) === -1) {
            $this->redis->expire($key, $window);
        }

        return $count;
    }

    public function reset(string $key): void
    {
        $this->redis->del($key);
    }
}

class DatabaseRateLimitStore implements RateLimitStore
{
    private PDO $pdo;
    private string $table;

    public function __construct(PDO $pdo, string $table = 'rate_limit_buckets')
    {
        $this->pdo = $pdo;
        if (!preg_match('/^[a-zA-Z0-9_]+$/', $table)) {
            throw new InvalidArgumentException('Invalid rate limit table name');
        }
        $this->table = $table;
    }

    public function get(string $key, int $window): array
    {
        $stmt = $this->pdo->prepare("SELECT attempts, expires_at FROM {$this->table} WHERE rate_key = ? LIMIT 1");
        $stmt->execute([$key]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return ['count' => 0, 'expires_at' => time() + $window];
        }

        $expiresAt = (int)$row['expires_at'];
        if ($expiresAt <= time()) {
            return ['count' => 0, 'expires_at' => time() + $window];
        }

        return ['count' => (int)$row['attempts'], 'expires_at' => $expiresAt];
    }

    public function increment(string $key, int $window): int
    {
        $now = time();
        $expiresAt = $now + $window;
        $attempts = 1;

        try {
            $this->pdo->beginTransaction();

            $stmt = $this->pdo->prepare("SELECT attempts, expires_at FROM {$this->table} WHERE rate_key = ? FOR UPDATE");
            $stmt->execute([$key]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($row && (int)$row['expires_at'] > $now) {
                $attempts = (int)$row['attempts'] + 1;
                $expiresAt = (int)$row['expires_at'];
            }

            $upsert = $this->pdo->prepare("INSERT INTO {$this->table} (rate_key, attempts, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE attempts = VALUES(attempts), expires_at = VALUES(expires_at)");
            $upsert->execute([$key, $attempts, $expiresAt]);

            $this->pdo->commit();
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }

        return $attempts;
    }

    public function reset(string $key): void
    {
        $stmt = $this->pdo->prepare("DELETE FROM {$this->table} WHERE rate_key = ?");
        $stmt->execute([$key]);
    }
}

class RateLimitStoreFactory
{
    public static function create(): RateLimitStore
    {
        $config = require __DIR__ . '/../config/env.php';
        $backend = $config['rate_limit_backend'] ?? 'file';

        if ($backend === 'redis' && class_exists('Redis')) {
            $redisHost = $config['redis_host'] ?? '127.0.0.1';
            $redisPort = $config['redis_port'] ?? 6379;
            $redisTimeout = $config['redis_timeout'] ?? 1.5;
            $redisAuth = $config['redis_auth'] ?? null;
            $redisDb = $config['redis_db'] ?? null;

            try {
                $redis = new Redis();
                $redis->connect($redisHost, (int)$redisPort, (float)$redisTimeout);
                if ($redisAuth) {
                    $redis->auth($redisAuth);
                }
                if ($redisDb !== null) {
                    $redis->select((int)$redisDb);
                }
                return new RedisRateLimitStore($redis);
            } catch (Throwable $e) {
                error_log('Falling back to file rate limit store: ' . $e->getMessage());
            }
        } elseif ($backend === 'db') {
            try {
                return new DatabaseRateLimitStore(Database::getConnection());
            } catch (Throwable $e) {
                error_log('Falling back to file rate limit store: ' . $e->getMessage());
            }
        }

        return new FileRateLimitStore();
    }
}

class RateLimiter
{
    private RateLimitStore $store;
    private int $window;
    private int $maxAttempts;

    public function __construct(RateLimitStore $store, int $window, int $maxAttempts)
    {
        $this->store = $store;
        $this->window = $window;
        $this->maxAttempts = $maxAttempts;
    }

    public function getStatus(string $key): array
    {
        return $this->store->get($key, $this->window);
    }

    public function tooManyAttempts(string $key): bool
    {
        $status = $this->getStatus($key);
        return $status['count'] >= $this->maxAttempts && $status['expires_at'] > time();
    }

    public function recordFailure(string $key): int
    {
        return $this->store->increment($key, $this->window);
    }

    public function reset(string $key): void
    {
        $this->store->reset($key);
    }
}
