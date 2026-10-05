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
    db_migrate_share_token($pdo, $cfg['driver'] ?? 'sqlite');
    return $pdo;
}

/**
 * F9: уникальный индекс по share_token (схема — только для новых БД).
 * Для существующей таблицы: сначала снимаем дубли (оставляем MIN(id),
 * остальным NULL), потом пробуем создать индекс — ошибку «уже существует»
 * глушим.
 */
function db_migrate_share_token(PDO $pdo, string $driver): void
{
    /* индекс уже есть — дублей не появится, выходим */
    try {
        if ($driver === 'mysql') {
            $n = (int)$pdo->query(
                "SELECT COUNT(*) FROM information_schema.statistics
                  WHERE table_schema = DATABASE() AND table_name = 'books'
                    AND index_name = 'uq_books_token'"
            )->fetchColumn();
        } else {
            $n = 0;
            foreach ($pdo->query("PRAGMA index_list('books')") as $r) {
                if (($r['name'] ?? '') === 'uq_books_token') { $n = 1; break; }
            }
        }
        if ($n > 0) return;
    } catch (Throwable $e) { return; }   /* таблицы ещё нет */

    try {
        $pdo->exec(
            "UPDATE books SET share_token = NULL
              WHERE share_token IS NOT NULL AND share_token <> ''
                AND id NOT IN (
                  SELECT keep_id FROM (
                    SELECT MIN(id) AS keep_id FROM books
                     WHERE share_token IS NOT NULL AND share_token <> ''
                     GROUP BY share_token
                  ) t
                )"
        );
    } catch (Throwable $e) { /* нет колонки — не критично */ }

    try {
        if ($driver === 'mysql') {
            $pdo->exec('CREATE UNIQUE INDEX uq_books_token ON books(share_token)');
        } else {
            $pdo->exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_books_token ON books(share_token)');
        }
    } catch (Throwable $e) { /* уже существует (Duplicate key name) */ }
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
