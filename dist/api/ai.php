<?php
/* ==========================================================================
 * ai.php — релей «Черновик ↔ ИИ». Браузер (с любого устройства) шлёт запрос
 *   сюда, а PHP уходит в локальный прокси deepseek-web2api на этом же
 *   сервере (127.0.0.1:8080) и возвращает ответ. API-ключ живёт на сервере
 *   (../.aikey — корень репозитория, как .dbpass; в git не попадает) и в
 *   браузер никогда не попадает — никаких ключей и настроек у читателя.
 *
 *   GET  ?action=models  → ответ /v1/models (индикатор связи в панели)
 *   POST ?action=chat    → OpenAI-совместимое тело; при stream:true SSE
 *                           отдаётся построчно (буферизация отключена).
 *
 *   Ошибки: HTTP-статус + {"ai":{"code":...,"detail":...}} — фронтенд по
 *   code/detail показывает «DeepSeek временно недоступен» и кнопку
 *   «Повторить» (см. 22-assistant.js, aiRetryable/aiMaybeRetry).
 *
 *   Файл самодостаточен намеренно: bootstrap.php включает сессию и базу, а
 *   потоковому релею нужны свои заголовки, свои таймауты и запрет буферизации.
 * ========================================================================== */
declare(strict_types=1);

const AI_UPSTREAM_DEFAULT = 'http://127.0.0.1:8080';
const AI_MAX_BODY        = 256 * 1024; /* предел тела запроса от браузера */
const AI_CONNECT_TIMEOUT = 8;          /* сек: соединение с прокси */
const AI_STREAM_WAIT     = 180;        /* сек: ожидание ответа/следующего фрагмента */

/* ── Мелкие помощники ─────────────────────────────────────────────────── */
function ai_json(int $code, array $payload): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

/** Ошибка релея: фронтенд отличает её по полю ai.code. */
function ai_fail(int $code, string $kind, string $detail): void
{
    ai_json($code, [
        'ai'    => ['code' => $kind, 'detail' => $detail],
        'error' => ['message' => $detail],
    ]);
}

/** Только свои запросы: POST принимаем лишь с этого же origin. */
function ai_same_origin_ok(): bool
{
    $sfs = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? '';
    if ($sfs !== '' && !in_array($sfs, ['same-origin', 'none'], true)) {
        return false;
    }
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin === '') {
        return true; // curl/скрипты без Origin — но у них и тела нет ключей
    }
    $host = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
    $p    = parse_url($origin);
    return is_array($p) && isset($p['host']) && strtolower((string)$p['host']) === $host;
}

function ai_key(): string
{
    $k = getenv('CHEROVIK_AI_KEY');
    if (is_string($k) && $k !== '') {
        return trim($k);
    }
    $f = dirname(__DIR__, 2) . '/.aikey'; // корень репозитория (вне web-root)
    if (is_file($f)) {
        $c = @file_get_contents($f);
        if ($c === false) {
            // ключ есть, но PHP его не читает — лучше увидеть это сразу,
            // а не «401 от прокси»: chown root:www-data && chmod 640 .aikey
            ai_fail(500, 'config', 'ключ .aikey недоступен для PHP — проверь владельца/права файла');
        }
        return trim($c);
    }
    return '';
}

function ai_upstream(): string
{
    $u = getenv('CHEROVIK_AI_UPSTREAM');
    $u = is_string($u) && $u !== '' ? $u : AI_UPSTREAM_DEFAULT;
    return rtrim($u, '/');
}

/** Достаём внятный текст из ответа прокси (FastAPI {detail} или OpenAI {error}). */
function ai_upstream_detail(string $raw): string
{
    $j = json_decode($raw, true);
    if (is_array($j)) {
        if (isset($j['detail'])) {
            $d = $j['detail'];
            if (is_string($d)) {
                return $d;
            }
            if (is_array($d)) {
                return json_encode($d, JSON_UNESCAPED_UNICODE);
            }
        }
        if (isset($j['error']['message']) && is_string($j['error']['message'])) {
            return $j['error']['message'];
        }
        if (isset($j['ai']['detail']) && is_string($j['ai']['detail'])) {
            return $j['ai']['detail'];
        }
    }
    return trim($raw) !== '' ? trim($raw) : 'пустой ответ прокси';
}

/* ── Параметры запроса ────────────────────────────────────────────────── */
$action = (string)($_GET['action'] ?? '');
$method = (string)($_SERVER['REQUEST_METHOD'] ?? 'GET');
if (!in_array($action, ['chat', 'models'], true)) {
    ai_fail(400, 'bad_request', 'неизвестное действие (нужно chat|models)');
}
if (!in_array($method, ['GET', 'HEAD', 'POST'], true)) {
    ai_fail(405, 'bad_request', 'метод не поддерживается');
}
if ($method === 'POST' && $action !== 'chat') {
    ai_fail(405, 'bad_request', 'POST доступен только для chat');
}
if ($method === 'POST' && !ai_same_origin_ok()) {
    ai_fail(403, 'bad_request', 'запрос с чужого origin');
}

$body   = '';
$stream = false;
if ($method === 'POST') {
    $body = file_get_contents('php://input');
    if ($body === false) {
        $body = '';
    }
    if ($body === '') {
        ai_fail(400, 'bad_request', 'пустое тело запроса');
    }
    if (strlen($body) > AI_MAX_BODY) {
        ai_fail(413, 'bad_request', 'запрос слишком большой');
    }
    $j = json_decode($body, true);
    if (!is_array($j)) {
        ai_fail(400, 'bad_request', 'некорректный JSON');
    }
    $stream = !empty($j['stream']);
}

/* ── Запрос к прокси на этом же хосте ─────────────────────────────────── */
$url     = ai_upstream() . ($action === 'chat' ? '/v1/chat/completions' : '/v1/models');
$headers = "Accept: " . ($stream ? 'text/event-stream' : 'application/json') . "\r\n";
if ($method === 'POST') {
    $headers .= "Content-Type: application/json\r\n";
}
$key = ai_key();
if ($key !== '') {
    $headers .= 'Authorization: Bearer ' . $key . "\r\n";
}

$ctx = stream_context_create([
    'http' => [
        'method'          => $method === 'GET' ? 'GET' : 'POST',
        'header'          => $headers,
        'content'         => $method === 'POST' ? $body : '',
        'timeout'         => AI_CONNECT_TIMEOUT,
        'ignore_errors'   => true,
        'follow_location' => 0,
    ],
]);

$fp = @fopen($url, 'rb', false, $ctx);
if ($fp === false) {
    // прокси не подняты вовсе — это и есть случай «DeepSeek недоступен»
    ai_fail(503, 'upstream', 'прокси ИИ не отвечает (' . ai_upstream() . ')');
}

$rawHeaders = isset($http_response_header) && is_array($http_response_header)
    ? $http_response_header : [];
$status = 0;
$ctype  = '';
foreach ($rawHeaders as $h) {
    if (preg_match('#^HTTP/\S+\s+(\d{3})#', (string)$h, $m)) {
        $status = (int)$m[1];
    }
    if (stripos((string)$h, 'Content-Type:') === 0) {
        $ctype = trim(substr((string)$h, 13));
    }
}

/* Прокси ответил ошибкой (503 «All accounts busy», 401, WAF-403…) —
   отдаём клиенту тот же статус и внятный текст, без тела прокси целиком. */
if ($status !== 200) {
    $err    = (string)stream_get_contents($fp);
    fclose($fp);
    $detail = ai_upstream_detail($err);
    ai_fail($status > 0 ? $status : 502, 'upstream', $detail);
}

/* Потоковый ответ: отдаём SSE как есть, поблочно, с отключённой буферизацией */
if ($stream && stripos($ctype, 'text/event-stream') !== false) {
    http_response_code(200);
    header('Content-Type: text/event-stream; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Accel-Buffering: no');   // nginx: не копить SSE в буфере
    header('X-Content-Type-Options: nosniff');
    @ini_set('zlib.output_compression', '0');
    @ini_set('output_buffering', '0');
    while (ob_get_level() > 0) {
        @ob_end_flush();
    }
    @set_time_limit(300);
    @ignore_user_abort(true);
    stream_set_timeout($fp, AI_STREAM_WAIT);
    while (!feof($fp)) {
        $chunk = fread($fp, 8192);
        if ($chunk === false) {
            break;
        }
        if ($chunk === '') {
            if (feof($fp)) {
                break;
            }
            continue;
        }
        echo $chunk;
        @flush();
    }
    fclose($fp);
    exit;
}

/* Обычный JSON (models или не-стрим chat) — проксируем как есть */
$resp = (string)stream_get_contents($fp);
fclose($fp);
http_response_code(200);
header('Content-Type: ' . ($ctype !== '' ? $ctype : 'application/json; charset=utf-8'));
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
echo $resp;
exit;
