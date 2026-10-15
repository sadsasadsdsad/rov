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
        /* WAL допускает параллельные писателей: без таймаута второй процесс
           вместо ожидания получал исключение «database is locked» → 500 */
        $pdo->exec('PRAGMA busy_timeout=5000');
        /* файл с пользователями и хешами паролей читаем только сами;
           -wal/-shm несут свежие страницы (в т.ч. хеши) — им тоже 0600 */
        @chmod($c['path'], 0600);
        @chmod($c['path'] . '-wal', 0600);
        @chmod($c['path'] . '-shm', 0600);
        $schema = __DIR__ . '/schema-sqlite.sql';
    }

    db_migrate_cached($pdo, $schema, $cfg['driver'] ?? 'sqlite');
    return $pdo;
}

/**
 * F13: какое хранилище реально используется — подсказка в меню аккаунта
 * («SQLite» локально, «MySQL» на хостинге). Падение подключения не ломает ответ.
 */
function db_engine(): string
{
    try {
        $name = db()->getAttribute(PDO::ATTR_DRIVER_NAME);
        if (is_string($name) && $name !== '') return strtolower($name);
    } catch (Throwable $e) {
        /* проглотили: ниже fallback из конфига */
    }
    $cfg = require __DIR__ . '/config.php';
    return (string)($cfg['driver'] ?? 'sqlite');
}

/**
 * F9: уникальный индекс по share_token (схема — только для новых БД).
 * Для существующей таблицы: сначала снимаем дубли (оставляем MIN(id),
 * остальным NULL), потом пробуем создать индекс — ошибку «уже существует»
 * глушим.
 */
/** маркер выполнения под-миграции в schema_meta (id 2 — share_token) */
function db_meta_mark(PDO $pdo, string $driver, int $id, string $hash): void
{
    try {
        if ($driver === 'mysql') {
            $pdo->exec('CREATE TABLE IF NOT EXISTS schema_meta(id INT NOT NULL PRIMARY KEY, hash VARCHAR(40) NOT NULL)');
        } else {
            $pdo->exec('CREATE TABLE IF NOT EXISTS schema_meta(id INTEGER PRIMARY KEY, hash TEXT NOT NULL)');
        }
        $pdo->exec('REPLACE INTO schema_meta(id, hash) VALUES(' . (int)$id . ', ' . $pdo->quote($hash) . ')');
    } catch (Throwable $e) { /* маркер не записался — миграция повторится */ }
}
function db_meta_has(PDO $pdo, int $id, string $hash): bool
{
    try {
        $row = $pdo->query('SELECT hash FROM schema_meta WHERE id = ' . (int)$id)->fetch();
        return is_array($row) && ($row['hash'] ?? '') === $hash;
    } catch (Throwable $e) {
        return false;
    }
}
function db_share_token_index_exists(PDO $pdo, string $driver): bool
{
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
        return $n > 0;
    } catch (Throwable $e) {
        return false;
    }
}

function db_migrate_share_token(PDO $pdo, string $driver): void
{
    /* маркер: миграция уже сделана. Раньше индекс проверялся на КАЖДОМ
       запросе (SELECT по information_schema / PRAGMA index_list) даже на
       «быстром пути» кеша схемы. */
    if (db_meta_has($pdo, 2, 'uq_books_token')) return;

    /* индекс уже есть — дублей не появится, фиксируем и выходим */
    if (db_share_token_index_exists($pdo, $driver)) {
        db_meta_mark($pdo, $driver, 2, 'uq_books_token');
        return;
    }

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
        db_meta_mark($pdo, $driver, 2, 'uq_books_token');
    } catch (Throwable $e) {
        /* Duplicate key name при повторном запуске — норма; настоящую
           ошибку логируем (раньше глушилась молча) и маркер не ставим */
        if (db_share_token_index_exists($pdo, $driver)) {
            db_meta_mark($pdo, $driver, 2, 'uq_books_token');
        } else {
            error_log('uq_books_token: ' . $e->getMessage());
        }
    }
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

/**
 * Прогон схемы — самая дорогая часть подключения (около 15 CREATE TABLE/INDEX
 * на КАЖДЫЙ запрос, ~20 мс на sqlite; сами выборки — доли миллисекунды).
 * Ставим хеш файла схемы в таблицу schema_meta и повторяем миграцию, только
 * когда схема реально изменилась. Новая/очищенная база (таблицы метки нет)
 * обрабатывается как раньше — полным прогоном.
 */
function db_migrate_cached(PDO $pdo, string $schemaFile, string $driver): void
{
    $hash = @sha1_file($schemaFile);
    $hash = is_string($hash) ? $hash : '';
    if ($hash !== '') {
        $have = null;
        try {
            $row = $pdo->query('SELECT hash FROM schema_meta WHERE id = 1')->fetch();
            if (is_array($row) && isset($row['hash'])) $have = (string)$row['hash'];
        } catch (Throwable $e) {
            $have = null;                       /* таблицы метки ещё нет */
        }
        if ($have === $hash) {                  /* схема не менялась — быстрый путь */
            db_migrate_share_token($pdo, $driver);
            return;
        }
    }

    db_migrate($pdo, $schemaFile);
    db_migrate_share_token($pdo, $driver);

    if ($hash === '') return;
    try {
        if ($driver === 'mysql') {
            $pdo->exec('CREATE TABLE IF NOT EXISTS schema_meta(id INT NOT NULL PRIMARY KEY, hash VARCHAR(40) NOT NULL)');
        } else {
            $pdo->exec('CREATE TABLE IF NOT EXISTS schema_meta(id INTEGER PRIMARY KEY, hash TEXT NOT NULL)');
        }
        /* REPLACE работает и в MySQL, и в SQLite */
        $pdo->exec('REPLACE INTO schema_meta(id, hash) VALUES(1, ' . $pdo->quote($hash) . ')');
    } catch (Throwable $e) {
        /* метку записать не удалось — на следующем запросе миграция повторится */
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
