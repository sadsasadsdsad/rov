<?php
/* ==========================================================================
 * session.php — cookie-сессии: токен в БД, cookie httpOnly + SameSite=Lax
 * ========================================================================== */

function cfg(): array
{
    static $cfg = null;
    if ($cfg === null) $cfg = require __DIR__ . '/config.php';
    return $cfg;
}

function session_cookie_name(): string
{
    return cfg()['session_cookie'];
}

function session_cookie_secure(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

function current_user(): ?array
{
    static $cached = false;
    if ($cached !== false) return $cached;
    $cached = null;

    $token = $_COOKIE[session_cookie_name()] ?? '';
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) return null;

    $row = db_one('SELECT s.token, s.user_id, s.expires, u.login, u.name, u.created
                    FROM sessions s JOIN users u ON u.id = s.user_id
                   WHERE s.token = ?', [$token]);
    if (!$row) return null;
    if ((int)$row['expires'] < time()) {
        db_run('DELETE FROM sessions WHERE token = ?', [$token]);
        return null;
    }
    $cached = [
        'id'      => (string)$row['user_id'],
        'login'   => (string)$row['login'],
        'name'    => (string)$row['name'],
        'created' => (int)$row['created'],
    ];
    return $cached;
}

function public_user(array $u): array
{
    return ['id' => $u['id'], 'login' => $u['login'], 'name' => $u['name'], 'created' => (int)($u['created'] ?? 0)];
}

function session_create(string $userId): string
{
    $token = bin2hex(random_bytes(32));
    $now = time();
    $expires = $now + (int)cfg()['session_days'] * 86400;
    db_run('INSERT INTO sessions(token,user_id,created,expires) VALUES(?,?,?,?)', [$token, $userId, $now, $expires]);
    setcookie(session_cookie_name(), $token, [
        'expires'  => $expires,
        'path'     => '/',
        'secure'   => session_cookie_secure(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    $_COOKIE[session_cookie_name()] = $token;
    return $token;
}

function session_end(): void
{
    $token = $_COOKIE[session_cookie_name()] ?? '';
    if ($token) db_run('DELETE FROM sessions WHERE token = ?', [$token]);
    setcookie(session_cookie_name(), '', [
        'expires'  => time() - 3600,
        'path'     => '/',
        'secure'   => session_cookie_secure(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    unset($_COOKIE[session_cookie_name()]);
}
