<?php
class BroadcastService
{
    public static function send(array $payload): void
    {
        $config = require __DIR__ . '/../config/env.php';
        $opts = [
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/json\r\nX-WS-TOKEN: {$config['ws_admin_token']}",
                'content' => json_encode($payload),
                'timeout' => 3,
            ],
        ];
        @file_get_contents($config['ws_broadcast_url'], false, stream_context_create($opts));
    }
}
