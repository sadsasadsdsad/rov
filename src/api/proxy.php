<?php
/* ==========================================================================
 * proxy.php — белый прокси для нового поиска книг: браузер не может забрать
 *   текст с Гутенберга/Internet Archive напрямую (нет CORS), а сервер может.
 *   Только залогиненный пользователь, только https, только известные хосты
 *   (белый список), размер — не больше max_book_bytes: открытого прокси
 *   для чужих сайтов не получается. Забор — через curl (если расширение
 *   есть), откат на file_get_contents (allow_url_fopen может быть выключен);
 *   если основной сервер Гутенберга недоступен (блокировки по региону),
 *   повторяем на официальном зеркале gutenberg.pglaf.org — пути те же.
 * ========================================================================== */
require __DIR__ . '/bootstrap.php';

need_method('GET');
require_user();

/* забор чужой книги — не «работа скрипта»: PHP-лимит 30 с резал длинные
   загрузки посреди тела (браузер получал HTML фатал-эrror вместо текста) */
@set_time_limit(90);

$url = (string)($_GET['u'] ?? '');
if ($url === '') json_err(400, 'no url');

$scheme = (string)parse_url($url, PHP_URL_SCHEME);
$host = strtolower((string)parse_url($url, PHP_URL_HOST));
if ($scheme !== 'https') json_err(400, 'https only');

/* белый список источников: Гутенберг (тексты), его зеркало PGLAF и
   Internet Archive (сканы djvu.txt, на которые ведут Открытая библиотека) */
$allow = ['www.gutenberg.org', 'gutenberg.org', 'gutenberg.pglaf.org',
          'archive.org', 'www.archive.org'];
if (!in_array($host, $allow, true)) json_err(400, 'host not allowed');

/** Заброс одной страницы: [тело, HTTP-статус]; при сетевом сбое статус 0 */
function proxy_get(string $url): array
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 5,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_TIMEOUT        => 35,
            CURLOPT_USERAGENT      => 'ChernovikReader/1.0',
            CURLOPT_PROTOCOLS      => CURLPROTO_HTTPS,        /* и исходный запрос… */
            CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,       /* …и переходы — только https */
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $body = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        if ($body !== false) return [(string)$body, $code];
        /* curl не смог соединиться — вторая попытка ниже, file_get_contents */
    }

    $ctx = stream_context_create(['http' => [
        'timeout' => 30,
        'follow_location' => 1,
        'max_redirects' => 5,
        'user_agent' => 'ChernovikReader/1.0',
        'ignore_errors' => true,        /* статус читаем ниже, тело — целиком */
    ]]);
    $raw = @file_get_contents($url, false, $ctx);
    $status = 0;
    if (isset($http_response_header[0]) && preg_match('#HTTP/\S+\s+(\d{3})#', $http_response_header[0], $mm)) {
        $status = (int)$mm[1];
    }
    return [$raw === false ? '' : (string)$raw, $status];
}

$res = proxy_get($url);
$raw = $res[0];
$status = $res[1];

/* Гутенберг из некоторых сетей недоступен (403/обрыв) — повторяем на
   официальном зеркале PGLAF: хост другой, путь книги тот же */
if (($status === 0 || $status === 403 || $status >= 500)
    && ($host === 'www.gutenberg.org' || $host === 'gutenberg.org')) {
    $res = proxy_get('https://gutenberg.pglaf.org' . (string)parse_url($url, PHP_URL_PATH));
    $raw = $res[0];
    $status = $res[1];
}

if ($status < 200 || $status >= 300) {
    json_err(502, $status === 0 ? 'источник недоступен с сервера' : 'upstream http ' . $status);
}
if ($raw === '') json_err(502, 'fetch failed');

$limit = (int)(cfg()['max_book_bytes'] ?? 0);
if ($limit > 0 && strlen($raw) > $limit) json_err(413, 'too big');

/* bootstrap выставил JSON-заголовок — тексту нужен свой */
header('Content-Type: text/plain; charset=utf-8');
header('Content-Length: ' . strlen($raw));
echo $raw;
exit;
