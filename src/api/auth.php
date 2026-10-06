<?php
/* ==========================================================================
 * auth.php — вход/выход/состояние сессии
 *   GET  ?action=me     → {user}|{user:null}
 *   POST ?action=join   {login,name,pass} → вход или регистрация, cookie
 *   POST ?action=login  {login,pass} → только вход (404, если аккаунта нет), cookie
 *   POST ?action=logout → выход
 * ========================================================================== */
require __DIR__ . '/bootstrap.php';

$action = $_GET['action'] ?? '';

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

        $u = db_one('SELECT * FROM users WHERE login = ?', [$login]);
        if ($u) {
            if (!password_verify($pass, (string)$u['pass_hash'])) json_err(401, 'wrong password');
            db_run('UPDATE users SET name = ?, last_login = ? WHERE id = ?', [$name, ts(), $u['id']]);
            $user = ['id' => $u['id'], 'login' => $u['login'], 'name' => $name, 'created' => (int)$u['created']];
        } else {
            $id = new_id();
            $now = ts();
            db_run(
                'INSERT INTO users(id,login,name,pass_hash,created,last_login) VALUES(?,?,?,?,?,?)',
                [$id, $login, $name, password_hash($pass, PASSWORD_DEFAULT), $now, $now]
            );
            $user = ['id' => $id, 'login' => $login, 'name' => $name, 'created' => $now];
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
        $u = db_one('SELECT * FROM users WHERE login = ?', [$login]);
        if (!$u) json_err(404, 'no account');
        if (!password_verify($pass, (string)$u['pass_hash'])) json_err(401, 'wrong password');
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

    default:
        json_err(404, 'unknown action');
}
