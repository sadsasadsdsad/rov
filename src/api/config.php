<?php
/* ==========================================================================
 * config.php — настройки сервера «Черновика»
 * Локально по умолчанию работает SQLite (файл api/data.sqlite) — ничего
 *   настраивать не нужно. На хостинге задайте переменные окружения
 *   или отредактируйте значения ниже.
 * ========================================================================== */
return [
    /* sqlite | mysql — на боевом хостинге обычно mysql */
    'driver' => getenv('CHEROVIK_DB') ?: 'sqlite',

    'sqlite' => [
        'path' => getenv('CHEROVIK_SQLITE') ?: __DIR__ . '/data.sqlite',
    ],

    'mysql' => [
        'dsn'  => getenv('CHEROVIK_MYSQL_DSN') ?: 'mysql:host=localhost;dbname=chernovik;charset=utf8mb4',
        'user' => getenv('CHEROVIK_MYSQL_USER') ?: 'chernovik',
        'pass' => getenv('CHEROVIK_MYSQL_PASS') ?: '',
    ],

    /* имя cookie сессии и срок её жизни */
    'session_cookie' => 'chernovik_session',
    'session_days'   => 60,

    /* ограничения */
    'max_book_bytes' => 16 * 1024 * 1024,
];
