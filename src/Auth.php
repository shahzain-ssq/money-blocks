<?php
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Proxy.php';

class Auth
{
    public static function startSession(): void
    {
        $config = require __DIR__ . '/../config/env.php';
        if (session_status() === PHP_SESSION_NONE) {
            $trustedProxies = parseTrustedProxies();
            $remoteAddr = $_SERVER['REMOTE_ADDR'] ?? '';
            $isTrustedProxy = isTrustedProxyAddress($remoteAddr, $trustedProxies);

            $isHttps = !empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off';
            if ($isTrustedProxy) {
                // Only honor forwarded proto from trusted proxies to avoid spoofing by clients.
                $forwardedProto = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '';
                if ($forwardedProto !== '') {
                    $firstProto = strtolower(trim(explode(',', $forwardedProto)[0]));
                    if ($firstProto === 'https') {
                        $isHttps = true;
                    } elseif ($firstProto === 'http') {
                        $isHttps = false;
                    }
                }
            }

            $sessionOptions = [
                'lifetime' => 0,
                'path' => '/',
                'secure' => $isHttps,
                'httponly' => true,
                'samesite' => 'Lax',
            ];

            if (!empty($config['session_domain'])) {
                $sessionOptions['domain'] = $config['session_domain'];
            }

            session_name($config['session_name']);
            session_set_cookie_params($sessionOptions);
            session_start();
        }
    }

    public static function currentUser(): ?array
    {
        self::startSession();
        if (!isset($_SESSION['user_id'])) {
            return null;
        }
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$_SESSION['user_id']]);
        return $stmt->fetch() ?: null;
    }

    public static function requireAuth(): array
    {
        $user = self::currentUser();
        if (!$user) {
            if (function_exists('jsonError')) {
                jsonError('unauthorized', 'Authentication required.', 401);
            }
            http_response_code(401);
            header('Content-Type: application/json');
            echo json_encode(['error' => ['code' => 'unauthorized', 'message' => 'Authentication required.']]);
            exit;
        }
        return $user;
    }

    public static function login(string $identifier, string $password, int $institutionId): ?array
    {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare('SELECT * FROM users WHERE institution_id = ? AND (email = ? OR username = ?) LIMIT 1');
        $stmt->execute([$institutionId, $identifier, $identifier]);
        $user = $stmt->fetch();
        if ($user && $user['password_hash'] && password_verify($password, $user['password_hash'])) {
            self::startSession();
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['institution_id'] = $user['institution_id'];
            return $user;
        }
        return null;
    }

    public static function googleLogin(string $email, int $institutionId): ?array
    {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare('SELECT * FROM users WHERE institution_id = ? AND email = ? LIMIT 1');
        $stmt->execute([$institutionId, $email]);
        $user = $stmt->fetch();
        if ($user) {
            self::startSession();
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['institution_id'] = $user['institution_id'];
            return $user;
        }
        return null;
    }
}
