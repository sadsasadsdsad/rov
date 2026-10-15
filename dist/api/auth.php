<?php
/* ==========================================================================
 * auth.php — вход/выход/состояние сессии
 *   GET  ?action=me     → {user}|{user:null}
 *   POST ?action=join   {login,name,pass} → вход или регистрация, cookie
 *   POST ?action=login  {login,pass} → только вход (404, если аккаунта нет), cookie
 *   POST ?action=pass   {old,new} → смена пароля текущего аккаунта (429 при переборе)
 *   POST ?action=erase  {pass}    → удалить аккаунт со всеми книгами и настройками
 *   POST ?action=logout → выход
 * ========================================================================== */
require __DIR__ . '/bootstrap.php';

$action = $_GET['action'] ?? '';

/**
 * Защита от перебора пароля. Два счётчика на 15 минут:
 *   — жёсткий (логин+IP, 15): 15 неудач с ОДНОГО IP блокируют этот IP, но
 *     не дают атакующему заблокировать вход самой жертве (раньше любой мог
 *     DoS-нуть логин 15 запросами);
 *   — мягкий (логин, 60): крышка от распределённого перебора.
 */
function attempts_ip(): string
{
    return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
}
function attempts_ok(string $login): bool
{
    $hard = db_one('SELECT COUNT(*) AS c FROM login_attempts WHERE login = ? AND ip = ? AND ts > ?',
        [$login, attempts_ip(), time() - 900]);
    if (($hard ? (int)$hard['c'] : 0) >= 15) return false;
    $soft = db_one('SELECT COUNT(*) AS c FROM login_attempts WHERE login = ? AND ts > ?',
        [$login, time() - 900]);
    return ($soft ? (int)$soft['c'] : 0) < 60;
}
function attempts_fail(string $login): void
{
    db_run('INSERT INTO login_attempts(login,ip,ts) VALUES(?,?,?)', [$login, attempts_ip(), time()]);
    db_run('DELETE FROM login_attempts WHERE ts < ?', [time() - 86400]);   /* чистим хвост */
}
function attempts_reset(string $login): void
{
    db_run('DELETE FROM login_attempts WHERE login = ?', [$login]);
}

switch ($action) {
    case 'me':
        need_method('GET', 'HEAD');
        $u = current_user();
        json_out(['user' => $u ? public_user($u) : null, 'db' => db_engine()]);

    case 'join':
        guard();
        need_method('POST');
        $j = read_json();
        $login = strtolower(trim((string)($j['login'] ?? '')));
        $name  = trim((string)($j['name'] ?? ''));
        $pass  = (string)($j['pass'] ?? '');

        if (!preg_match('/^[a-z0-9_.\-]{3,32}$/', $login)) json_err(422, 'bad login');
        if (strlen($pass) < 4) json_err(422, 'short password');
        if ($name === '') $name = $login;
        $name = mb_substr($name, 0, 128);   /* колонка name — VARCHAR(128) */

        $u = db_one('SELECT * FROM users WHERE login = ?', [$login]);
        if ($u) {
            if (!attempts_ok($login)) json_err(429, 'too many attempts');
            if (!password_verify($pass, (string)$u['pass_hash'])) {
                attempts_fail($login);
                json_err(401, 'wrong password');
            }
            attempts_reset($login);
            if (password_needs_rehash((string)$u['pass_hash'], PASSWORD_DEFAULT)) {
                db_run('UPDATE users SET pass_hash = ? WHERE id = ?', [password_hash($pass, PASSWORD_DEFAULT), $u['id']]);
            }
            db_run('UPDATE users SET name = ?, last_login = ? WHERE id = ?', [$name, ts(), $u['id']]);
            $user = ['id' => $u['id'], 'login' => $u['login'], 'name' => $name, 'created' => (int)$u['created']];
        } else {
            /* регистрация тоже под лимитом: без своего ключа ветки «нет
               аккаунта» вовсе не было, и аккаунты плодились неограниченно */
            $ipkey = 'signup:' . attempts_ip();
            if (!attempts_ok($ipkey)) json_err(429, 'too many attempts');
            $id = new_id();
            $now = ts();
            try {
                db_run(
                    'INSERT INTO users(id,login,name,pass_hash,created,last_login) VALUES(?,?,?,?,?,?)',
                    [$id, $login, $name, password_hash($pass, PASSWORD_DEFAULT), $now, $now]
                );
                attempts_fail($ipkey);            /* создание занимает слот лимита */
                $user = ['id' => $id, 'login' => $login, 'name' => $name, 'created' => $now];
            } catch (PDOException $e) {
                /* гонка: параллельный запрос успел создать такой логин */
                $own = db_one('SELECT * FROM users WHERE login = ?', [$login]);
                if (!$own || !password_verify($pass, (string)$own['pass_hash'])) json_err(409, 'login exists');
                attempts_fail($ipkey);
                $user = ['id' => $own['id'], 'login' => $own['login'], 'name' => $name, 'created' => (int)$own['created']];
            }
        }
        session_create((string)$user['id']);
        json_out(['user' => public_user($user)]);

    case 'login':
        guard();
        need_method('POST');
        $j = read_json();
        $login = strtolower(trim((string)($j['login'] ?? '')));
        $pass  = (string)($j['pass'] ?? '');

        if (!preg_match('/^[a-z0-9_.\-]{3,32}$/', $login)) json_err(422, 'bad login');
        if (!attempts_ok($login)) json_err(429, 'too many attempts');
        $u = db_one('SELECT * FROM users WHERE login = ?', [$login]);
        if (!$u) json_err(404, 'no account');
        if (!password_verify($pass, (string)$u['pass_hash'])) {
            attempts_fail($login);
            json_err(401, 'wrong password');
        }
        attempts_reset($login);
        if (password_needs_rehash((string)$u['pass_hash'], PASSWORD_DEFAULT)) {
            db_run('UPDATE users SET pass_hash = ? WHERE id = ?', [password_hash($pass, PASSWORD_DEFAULT), $u['id']]);
        }
        db_run('UPDATE users SET last_login = ? WHERE id = ?', [ts(), $u['id']]);
        session_create((string)$u['id']);
        json_out(['user' => public_user([
            'id' => $u['id'], 'login' => $u['login'], 'name' => $u['name'], 'created' => (int)$u['created'],
        ])]);

    case 'logout':
        guard();
        need_method('POST');
        session_end();
        json_out(['ok' => true]);

    /* смена пароля серверного аккаунта (нужен текущий пароль) */
    case 'pass':
        guard();
        need_method('POST');
        $u = require_user();
        $j = read_json();
        $old = (string)($j['old'] ?? '');
        $new = (string)($j['new'] ?? '');
        if (strlen($new) < 4) json_err(422, 'short password');
        if (!attempts_ok($u['login'])) json_err(429, 'too many attempts');
        $row = db_one('SELECT pass_hash FROM users WHERE id = ?', [$u['id']]);
        if (!$row) json_err(404, 'no account');
        if (!password_verify($old, (string)$row['pass_hash'])) {
            attempts_fail($u['login']);
            json_err(401, 'wrong password');
        }
        attempts_reset($u['login']);
        db_run('UPDATE users SET pass_hash = ? WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), $u['id']]);
        /* старые cookie после смены пароля не должны работать дальше —
           кроме той, с которой пароль сменили */
        $keep = (string)($_COOKIE[session_cookie_name()] ?? '');
        db_run('DELETE FROM sessions WHERE user_id = ? AND token <> ?', [$u['id'], $keep]);
        json_out(['ok' => true]);

    /* удаление аккаунта целиком: книги, настройки, статистика, сессии */
    case 'erase':
        guard();
        need_method('POST');
        $u = require_user();
        $j = read_json();
        $pass = (string)($j['pass'] ?? '');
        if (!attempts_ok($u['login'])) json_err(429, 'too many attempts');
        $row = db_one('SELECT pass_hash FROM users WHERE id = ?', [$u['id']]);
        if (!$row) json_err(404, 'no account');
        if (!password_verify($pass, (string)$row['pass_hash'])) {
            attempts_fail($u['login']);
            json_err(401, 'wrong password');
        }
        attempts_reset($u['login']);
        /* одной транзакцией: сбой между DELETE не должен оставить
           аккаунт без книг или книги без аккаунта */
        try {
            db()->beginTransaction();
            db_run('DELETE FROM books WHERE user_id = ?', [$u['id']]);
            db_run('DELETE FROM prefs WHERE user_id = ?', [$u['id']]);
            db_run('DELETE FROM stats WHERE user_id = ?', [$u['id']]);
            db_run('DELETE FROM sessions WHERE user_id = ?', [$u['id']]);
            db_run('DELETE FROM users WHERE id = ?', [$u['id']]);
            db_run('DELETE FROM login_attempts WHERE login = ?', [$u['login']]);
            db()->commit();
        } catch (Throwable $e) {
            try { db()->rollBack(); } catch (Throwable $e2) { /* транзакция уже закрыта */ }
            json_err(500, 'erase failed');
        }
        session_end();
        json_out(['ok' => true]);

    default:
        json_err(404, 'unknown action');
}
