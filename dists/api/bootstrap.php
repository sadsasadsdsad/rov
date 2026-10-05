<?php
/* ==========================================================================
 * bootstrap.php — общая обвязка API: JSON-ответы, методы, защита от CSRF,
 *   подключение БД и сессий. Каждый эндпоинт начинается с require этого файла.
 * ========================================================================== */
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/session.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function json_out(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function json_err(int $code, string $msg): void
{
    json_out(['error' => $msg], $code);
}

function read_json(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') json_err(400, 'empty body');
    if (strlen($raw) > (int)cfg()['max_book_bytes'] + 1024 * 1024) json_err(413, 'too big');
    $j = json_decode($raw, true);
    if (!is_array($j)) json_err(400, 'bad json');
    return $j;
}

function need_method(string ...$methods): void
{
    $m = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($m, $methods, true)) json_err(405, 'method not allowed');
}

/** Изменяющие запросы принимаем только с того же origin (защита от CSRF). */
function same_origin_ok(): bool
{
    $m = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (in_array($m, ['GET', 'HEAD'], true)) return true;

    $sfs = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? '';
    if ($sfs !== '' && !in_array($sfs, ['same-origin', 'none'], true)) return false;

    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin === '' || $origin === 'null') return true; // curl / серверные вызовы

    /* HTTP_HOST может быть без порта (стандартные 443/80) — подставляем схему,
       иначе origin_parts вернёт порт null и сравнение всегда провалится */
    $fwd = strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
    $https = $fwd === 'https' || (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    $scheme = $https ? 'https' : 'http';

    $a = origin_parts($origin);
    $b = origin_parts($scheme . '://' . ($_SERVER['HTTP_HOST'] ?? ''));
    return $a !== null && $b !== null && $a[0] === $b[0] && $a[1] === $b[1];
}

function origin_parts(string $url): ?array
{
    $host = parse_url($url, PHP_URL_HOST);
    if (!$host) return null;
    $port = parse_url($url, PHP_URL_PORT);
    if ($port === null) {
        $scheme = parse_url($url, PHP_URL_SCHEME);
        $port = $scheme === 'https' ? 443 : ($scheme === 'http' ? 80 : null);
    }
    if ($port === null) return null;
    return [strtolower($host), (int)$port];
}

function guard(): void
{
    if (!same_origin_ok()) json_err(403, 'origin mismatch');
}

function require_user(): array
{
    $u = current_user();
    if (!$u) json_err(401, 'not authorized');
    return $u;
}

function ts(): int
{
    return (int)floor(microtime(true) * 1000);
}

function new_id(): string
{
    return bin2hex(random_bytes(12));
}
