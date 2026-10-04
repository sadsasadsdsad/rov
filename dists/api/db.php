<?php
/* ==========================================================================
 * db.php — подключение PDO (SQLite локально / MySQL на хостинге)
 * Таблицы создаются автоматически из schema-<driver>.sql — ручной импорт
 *   не обязателен, но файлы схем приложены для справки.
 * ========================================================================== */

function db()
{
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    $cfg = require __DIR__ . '/config.php';
    $opts = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ];

    if ($cfg['driver'] === 'mysql') {
        $c = $cfg['mysql'];
        $pdo = new PDO($c['dsn'], $c['user'], $c['pass'], $opts);
        $schema = __DIR__ . '/schema-mysql.sql';
    } else {
        $c = $cfg['sqlite'];
        $dir = dirname($c['path']);
        if (!is_dir($dir)) @mkdir($dir, 0775, true);
        $pdo = new PDO('sqlite:' . $c['path'], null, null, $opts);
        $pdo->exec('PRAGMA journal_mode=WAL');
        $pdo->exec('PRAGMA foreign_keys=ON');
        $schema = __DIR__ . '/schema-sqlite.sql';
    }

    db_migrate($pdo, $schema);
    return $pdo;
}

function db_migrate(PDO $pdo, string $schemaFile): void
{
    $sql = @file_get_contents($schemaFile);
    if ($sql === false) throw new RuntimeException('schema not found: ' . $schemaFile);
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) {
        $pdo->exec($stmt);
    }
}

function db_one(string $sql, array $args = []): ?array
{
    $st = db()->prepare($sql);
    $st->execute($args);
    $row = $st->fetch();
    return $row === false ? null : $row;
}

function db_all(string $sql, array $args = []): array
{
    $st = db()->prepare($sql);
    $st->execute($args);
    return $st->fetchAll();
}

function db_run(string $sql, array $args = []): int
{
    $st = db()->prepare($sql);
    $st->execute($args);
    return $st->rowCount();
}
