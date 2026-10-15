<?php
/* ==========================================================================
 * state.php — настройки + статистика + полный дамп книг
 *   GET  → {prefs:{data,updated}, stats:{day:…}, books:[…]}
 *   POST → {prefs:{data,updated}, stats:{day:…}}  (сохранение, LWW + max-merge)
 * ========================================================================== */
require __DIR__ . '/bootstrap.php';

/** Слияние статистики: по каждому дню и ключу берём максимум — конфликтов нет. */
function stats_merge($a, $b): array
{
    $out = [];
    foreach ([$a, $b] as $map) {
        if (!is_array($map)) continue;
        foreach ($map as $day => $entry) {
            $day = (string)$day;
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $day)) continue;
            if (is_numeric($entry)) $entry = ['__all' => (float)$entry];
            if (!is_array($entry)) continue;
            if (!isset($out[$day]) || !is_array($out[$day])) $out[$day] = [];
            foreach ($entry as $k => $v) {
                if (!is_numeric($v)) continue;
                $k = (string)$k;
                $out[$day][$k] = max($out[$day][$k] ?? 0, (float)$v);
            }
        }
    }
    return $out;
}

function stats_get(string $userId): array
{
    $rows = db_all('SELECT day, data FROM stats WHERE user_id = ?', [$userId]);
    $out = [];
    foreach ($rows as $r) {
        $d = json_decode((string)$r['data'], true);
        if (is_array($d)) $out[(string)$r['day']] = $d;
    }
    return $out;
}

$u = require_user();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET' || $method === 'HEAD') {
    $pref = db_one('SELECT data, updated FROM prefs WHERE user_id = ?', [$u['id']]);
    $books = db_all('SELECT id, title, author, visibility, share_token, content FROM books WHERE user_id = ?', [$u['id']]);
    $list = [];
    foreach ($books as $r) {
        $b = json_decode((string)$r['content'], true);
        if (!is_array($b)) continue;
        /* колонки авторитетны: доступ и токен ссылки клиент держит в книге */
        $b['id'] = (string)$r['id'];
        $b['title'] = (string)$r['title'];
        $b['author'] = (string)$r['author'];
        $b['visibility'] = (string)$r['visibility'];
        $tok = (string)$r['share_token'];
        $b['share_token'] = $tok !== '' ? $tok : null;
        $list[] = $b;
    }
    usort($list, function ($a, $b) {
        return ((int)($b['updated'] ?? 0)) <=> ((int)($a['updated'] ?? 0));
    });
    json_out([
        'prefs' => $pref
            ? ['data' => json_decode((string)$pref['data'], true), 'updated' => (int)$pref['updated']]
            : ['data' => null, 'updated' => 0],
        'stats' => stats_get((string)$u['id']),
        'books' => $list,
        'meta'  => ['db' => db_engine()],
    ]);
}

guard();
need_method('POST');
$j = read_json();
$savedPrefs = false;

if (isset($j['prefs']) && is_array($j['prefs']) && array_key_exists('data', $j['prefs']) && is_array($j['prefs']['data'])) {
    $data = $j['prefs']['data'];
    $upd  = (int)($j['prefs']['updated'] ?? 0);
    /* F10: часы клиента далеко впереди — не даём «будущему» выигрывать LWW
       навсегда (то же правило, что в book.php) */
    if ($upd > ts() + 600000) $upd = ts();
    if ($upd < 0) $upd = 0;
    /* json_encode обязан вернуть строку: INF/NaN/слишком глубокая вложенность
       дали false, который молча превращался в пустые настройки */
    $enc = json_encode($data, JSON_UNESCAPED_UNICODE);
    if ($enc === false) json_err(422, 'bad prefs');
    if (strlen($enc) > 512 * 1024) json_err(413, 'prefs too big');
    $row  = db_one('SELECT updated FROM prefs WHERE user_id = ?', [$u['id']]);
    if (!$row) {
        try {
            db_run('INSERT INTO prefs(user_id,data,updated) VALUES(?,?,?)', [$u['id'], $enc, $upd]);
        } catch (PDOException $e) {
            /* гонка: второе устройство успело вставить prefs первой */
            db_run('UPDATE prefs SET data = ?, updated = ? WHERE user_id = ?', [$enc, $upd, $u['id']]);
        }
        $savedPrefs = true;
    } elseif ($upd >= (int)$row['updated']) {
        db_run('UPDATE prefs SET data = ?, updated = ? WHERE user_id = ?', [$enc, $upd, $u['id']]);
        $savedPrefs = true;
    }
}

if (isset($j['stats']) && is_array($j['stats'])) {
    $incoming = stats_merge(null, $j['stats']);
    if (count($incoming) > 1000) json_err(413, 'too many days');   /* защита от накрутки строк */
    /* Сначала готовим ВСЕ дни (включая байтовый лимит), потом пишем:
       ошибка в середине цикла не должна оставлять часть дней недописанной.
       Лимит байт нужен: колонка MEDIUMTEXT = 16М, при жёстком SQL-режиме
       MySQL необработанный переполнение — это 500 посреди цикла, а при
       мягком — молчаливая обрезка и битый JSON дня. */
    $plan = [];
    foreach ($incoming as $day => $entry) {
        $cur = db_one('SELECT data, updated FROM stats WHERE user_id = ? AND day = ?', [$u['id'], $day]);
        $curData = $cur ? json_decode((string)$cur['data'], true) : null;
        $merged = stats_merge(is_array($curData) ? [$day => $curData] : null, [$day => $entry]);
        $payload = json_encode($merged[$day] ?? [], JSON_UNESCAPED_UNICODE);
        if ($payload === false) continue;   /* INF/NaN: старое значение дня остаётся, не затираем пустым */
        if (strlen($payload) > 4 * 1024 * 1024) json_err(413, 'stats too big');
        $plan[] = [$day, $payload, $cur !== null];
    }
    foreach ($plan as $p) {
        if ($p[2]) {
            db_run('UPDATE stats SET data = ?, updated = ? WHERE user_id = ? AND day = ?', [$p[1], ts(), $u['id'], $p[0]]);
        } else {
            try {
                db_run('INSERT INTO stats(user_id,day,data,updated) VALUES(?,?,?,?)', [$u['id'], $p[0], $p[1], ts()]);
            } catch (PDOException $e) {
                /* гонка: второе устройство успело вставить этот день */
                db_run('UPDATE stats SET data = ?, updated = ? WHERE user_id = ? AND day = ?', [$p[1], ts(), $u['id'], $p[0]]);
            }
        }
    }
}

json_out(['ok' => true, 'prefsSaved' => $savedPrefs]);
