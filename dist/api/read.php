<?php
/* ==========================================================================
 * read.php — чтение чужой книги БЕЗ входа (для ссылки и каталога)
 *   GET ?id=…        → публичная книга (visibility='public') или своя (с cookie)
 *   GET ?id=…&t=…    → по токену: public/unlisted («по ссылке»)
 *   GET ?t=…         → то же, id не обязателен
 * Ответ: {book, meta:{id,title,author,updated}} — книга вычищена:
 *   без wiki, customTypes, меток, главы «Заметки», врезок div.nb, share_token.
 * ========================================================================== */
require __DIR__ . '/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($method, ['GET', 'HEAD'], true)) json_err(405, 'method not allowed');

$id = preg_replace('/[^a-zA-Z0-9_\-]/', '', (string)($_GET['id'] ?? ''));
$tok = preg_replace('/[^a-f0-9]/', '', strtolower((string)($_GET['t'] ?? '')));
if ($id === '' && $tok === '') json_err(400, 'bad id');

$row = null;
if ($tok !== '') {
    $r = db_one('SELECT * FROM books WHERE share_token = ?', [$tok]);
    if ($r && in_array((string)$r['visibility'], ['unlisted', 'public'], true)) {
        if ($id !== '' && (string)$r['id'] !== $id) json_err(404, 'book not found');
        $row = $r;
    }
}
if (!$row && $id !== '') {
    $r = db_one('SELECT * FROM books WHERE id = ?', [$id]);
    if ($r && (string)$r['visibility'] === 'public') $row = $r;
    if (!$row) {
        /* своя книга — можно и по id с cookie */
        $me = current_user();
        if ($r && $me && (string)$me['id'] === (string)$r['user_id']) $row = $r;
    }
}
if (!$row) json_err(404, 'book not found');

$b = json_decode((string)$row['content'], true);
if (!is_array($b)) json_err(500, 'corrupt book');

/* вычищаем всё, что не для читателя */
unset($b['wiki'], $b['customTypes'], $b['share_token'], $b['visibility'], $b['author'], $b['id']);
$chs = [];
foreach (($b['chapters'] ?? []) as $ch) {
    if (!is_array($ch)) continue;
    if (($ch['kind'] ?? '') === 'notes') continue;          /* глава «Заметки» — не показывается */
    $ch['marks'] = [];
    $ch['pos'] = 0;
    if (isset($ch['html']) && is_string($ch['html'])) {
        /* врезки автора (div.nb) не попадают читателю */
        $ch['html'] = preg_replace('/<div\b[^>]*class="[^"]*\bnb\b[^"]*"[^>]*>.*?<\/div>/su', '', $ch['html']);
    }
    $chs[] = $ch;
}
$b['chapters'] = $chs;

json_out([
    'book' => $b,
    'meta' => [
        'id'      => (string)$row['id'],
        'title'   => (string)$row['title'],
        'author'  => (string)$row['author'],
        'updated' => (int)$row['updated'],
    ],
]);
