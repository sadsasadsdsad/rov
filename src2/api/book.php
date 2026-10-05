<?php
/* ==========================================================================
 * book.php — одна книга целиком (метаданные + все главы в content)
 *   GET    ?id=… → {book}
 *   PUT    ?id=… ← книга JSON  → {ok} | {ok:false, stale:true} (LWW)
 *   DELETE ?id=… → {ok}
 * ========================================================================== */
require __DIR__ . '/bootstrap.php';

$u = require_user();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$id = preg_replace('/[^a-zA-Z0-9_\-]/', '', (string)($_GET['id'] ?? ''));
if ($id === '') json_err(400, 'bad id');

if ($method === 'GET' || $method === 'HEAD') {
    $row = db_one('SELECT content FROM books WHERE id = ? AND user_id = ?', [$id, $u['id']]);
    if (!$row) json_err(404, 'book not found');
    $b = json_decode((string)$row['content'], true);
    if (!is_array($b)) json_err(500, 'corrupt book');
    json_out(['book' => $b]);
}

guard();

if ($method === 'PUT' || $method === 'POST') {
    $b = read_json();
    if (!is_array($b)) json_err(400, 'bad book');
    $b['id'] = $id;
    $b['title'] = mb_substr((string)($b['title'] ?? 'Без названия'), 0, 255);
    $b['author'] = mb_substr((string)($b['author'] ?? ''), 0, 255);
    $b['updated'] = isset($b['updated']) ? (int)$b['updated'] : ts();
    /* F10: часы клиента впереди больше чем на 10 минут — не даём им
       вечным «будущим» выигрывать LWW у всех устройств */
    if ($b['updated'] > ts() + 600000) $b['updated'] = ts();
    if ($b['updated'] < 0) $b['updated'] = ts();

    $row = db_one('SELECT user_id, updated, visibility, share_token FROM books WHERE id = ?', [$id]);
    if ($row) {
        if ((string)$row['user_id'] !== (string)$u['id']) json_err(403, 'not your book');
        if ((int)$row['updated'] > $b['updated']) {
            json_out(['ok' => false, 'stale' => true, 'updated' => (int)$row['updated']]);
        }
    }

    /* доступ: тело запроса, иначе значение в колонке, иначе закрытая */
    $hasVis = array_key_exists('visibility', $b);
    $b['visibility'] = in_array($b['visibility'] ?? '', ['private', 'unlisted', 'public'], true)
        ? $b['visibility'] : 'private';
    if (!$hasVis && $row) $b['visibility'] = (string)$row['visibility'];

    /* токен ссылки: живёт в колонке share_token, в content не попадает */
    $token = $row ? (string)$row['share_token'] : '';
    $reqToken = preg_replace('/[^a-f0-9]/', '', strtolower((string)($b['share_token'] ?? '')));
    if (strlen($reqToken) !== 32) $reqToken = '';   /* F9: только 32-hex, иначе игнорируем */
    unset($b['share_token']);
    if ($b['visibility'] !== 'private') {
        if ($reqToken !== '') $token = $reqToken;
        elseif ($token === '') $token = bin2hex(random_bytes(16));
        /* F9: токен должен быть уникален (дубли делают ссылку неоднозначной) —
           коллизия чужого токена (например, бэкап-восстановление) → новый */
        for ($i = 0; $i < 8; $i++) {
            $c = db_one('SELECT id FROM books WHERE share_token = ?', [$token]);
            if ($c === null || (string)$c['id'] === $id) break;
            $token = bin2hex(random_bytes(16));
        }
    }

    if (!isset($b['chapters']) || !is_array($b['chapters'])) $b['chapters'] = [];

    $content = json_encode($b, JSON_UNESCAPED_UNICODE);
    if ($content === false) json_err(422, 'bad book json');
    if (strlen($content) > (int)cfg()['max_book_bytes']) json_err(413, 'book too big');

    $tokBind = $token !== '' ? $token : null;   /* без токена — NULL, а не '' */
    if ($row) {
        db_run(
            'UPDATE books SET title = ?, author = ?, updated = ?, visibility = ?, share_token = ?, content = ?, version = version + 1 WHERE id = ?',
            [$b['title'], $b['author'], $b['updated'], $b['visibility'], $tokBind, $content, $id]
        );
    } else {
        try {
            db_run(
                'INSERT INTO books(id,user_id,title,author,updated,visibility,share_token,content,version) VALUES(?,?,?,?,?,?,?,?,1)',
                [$id, $u['id'], $b['title'], $b['author'], $b['updated'], $b['visibility'], $tokBind, $content]
            );
        } catch (PDOException $e) {
            /* гонка: книга с этим id уже вставлена параллельным запросом —
               повторяем как UPDATE (LWW уже проверен выше) */
            $own = db_one('SELECT user_id FROM books WHERE id = ?', [$id]);
            if (!$own || (string)$own['user_id'] !== (string)$u['id']) json_err(409, 'id conflict');
            db_run(
                'UPDATE books SET title = ?, author = ?, updated = ?, visibility = ?, share_token = ?, content = ?, version = version + 1 WHERE id = ?',
                [$b['title'], $b['author'], $b['updated'], $b['visibility'], $tokBind, $content, $id]
            );
        }
    }
    json_out([
        'ok' => true,
        'updated' => $b['updated'],
        'visibility' => $b['visibility'],
        'share_token' => $token !== '' ? $token : null,
    ]);
}

if ($method === 'DELETE') {
    db_run('DELETE FROM books WHERE id = ? AND user_id = ?', [$id, $u['id']]);
    json_out(['ok' => true]);
}

json_err(405, 'method not allowed');
