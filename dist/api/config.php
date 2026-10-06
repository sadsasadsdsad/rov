<?php
/* ==========================================================================
 * config.php — настройки сервера «Черновика»
 * Локально по умолчанию работает SQLite (файл api/data.sqlite) — ничего
 *   настраивать не нужно. На хостинге задайте переменные окружения
 *   (в nginx через fastcgi_param — см. README) или отредактируйте
 *   значения ниже.
 * Ключи читаются из окружения (getenv), затем из $_SERVER (fastcgi_param).
 * ========================================================================== */
$env = function (string $key, ?string $def = null): ?string {
    $v = getenv($key);
    if ($v === false || $v === '') $v = $_SERVER[$key] ?? $_ENV[$key] ?? null;
    return ($v === null || $v === '') ? $def : $v;
};

return [
    /* sqlite | mysql — на боевом хостинге обычно mysql */
    'driver' => $env('CHEROVIK_DB', 'sqlite'),

    'sqlite' => [
        'path' => $env('CHEROVIK_SQLITE') ?: __DIR__ . '/data.sqlite',
    ],

    'mysql' => [
        'dsn'  => $env('CHEROVIK_MYSQL_DSN', 'mysql:host=localhost;dbname=chernovik;charset=utf8mb4'),
        'user' => $env('CHEROVIK_MYSQL_USER', 'chernovik'),
        'pass' => $env('CHEROVIK_MYSQL_PASS', ''),
    ],

    /* имя cookie сессии и срок её жизни */
    'session_cookie' => 'chernovik_session',
    'session_days'   => 60,

    /* ограничения */
    'max_book_bytes' => 16 * 1024 * 1024,
];
