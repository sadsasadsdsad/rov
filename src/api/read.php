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
if (($id === '' && $tok === '') || strlen($id) > 40 || strlen($tok) > 64) json_err(400, 'bad id');

/**
 * Убирает врезки автора (div.nb) — читателю они не показываются.
 * Разбираем теги, а не подстроку: кавычки любого типа (в т.ч. `>` внутри
 * значения атрибута), `class` не первым (не захватываем `data-class`),
 * вложенные div (считаем глубину) — иначе остаётся лишний </div>
 * и текст читателя ломается. Потолка «64 врезки на главу» больше нет:
 * цикл безопасно ограничивается только проверкой прогресса (строка после
 * каждого удаления строго короче).
 */
function strip_nb(string $html): string
{
    $openRe = '/<div\b(?:[^>"\']|"[^"]*"|\'[^\']*\')*>/i';   /* учитывает кавычки в атрибутах */
    $anyRe  = '/<(\/?)div\b(?:[^>"\']|"[^"]*"|\'[^\']*\')*>/i';
    $clsQ   = '/(?<![\w-])class\s*=\s*(["\'])(.*?)\1/is';    /* не матчит data-class */
    $clsB   = '/(?<![\w-])class\s*=\s*([^\s"\'>]+)/i';
    $pos = 0;   /* курсор поиска: после удаления блока продолжаем с места выреза —
                   текст до него не менялся, полный перескан документа не нужен
                   (иначе K nb-блоков × D div-ов = квадратичная сложность) */
    while (true) {
        $victim = null;
        $victimLen = 0;
        while (preg_match($openRe, $html, $m, PREG_OFFSET_CAPTURE, $pos)) {
            $tag = $m[0][0];
            $off = (int)$m[0][1];
            $cls = '';
            if (preg_match($clsQ, $tag, $c)) $cls = $c[2];
            elseif (preg_match($clsB, $tag, $c)) $cls = $c[1];
            if (preg_match('/(^|\s)nb(\s|$)/', $cls)) {   /* ровно токен класса */
                $victim = $off;
                $victimLen = strlen($tag);
                break;
            }
            $pos = $off + strlen($tag);
        }
        if ($victim === null) break;

        $p = $victim + $victimLen;
        $d = 1;
        while ($d > 0 && preg_match($anyRe, $html, $mm, PREG_OFFSET_CAPTURE, $p)) {
            $d += ($mm[1][0] === '/' ? -1 : 1);
            $p = (int)$mm[0][1] + strlen($mm[0][0]);
        }
        if ($d > 0) break;   /* незакрытый тег — не режем, чтобы не потерять текст */
        $next = substr($html, 0, $victim) . substr($html, $p);
        if (strlen($next) >= strlen($html)) break;   /* страховка от зацикливания */
        $html = $next;
        $pos = $victim;   /* вырезали начиная с $victim — курсор на это место */
    }
    return $html;
}

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

/* белый список: читателю отдаём только нужное. Раньше стоял unset() по
   7 полям — любое НОВОЕ приватное поле книги автоматически утекало бы. */
$chs = [];
foreach (($b['chapters'] ?? []) as $ch) {
    if (!is_array($ch)) continue;
    if (($ch['kind'] ?? '') === 'notes') continue;          /* глава «Заметки» — не показывается */
    $chs[] = [
        'id'    => (string)($ch['id'] ?? ''),
        'kind'  => (string)($ch['kind'] ?? ''),
        'html'  => isset($ch['html']) && is_string($ch['html']) ? strip_nb($ch['html']) : '',
        'marks' => [],
        'pos'   => 0,
    ];
}
$out = [
    'v'        => (int)($b['v'] ?? 0),
    'title'    => (string)($b['title'] ?? 'Без названия'),
    'color'    => (string)($b['color'] ?? ''),
    'current'  => (string)($b['current'] ?? ''),
    'updated'  => (int)($b['updated'] ?? 0),
    'chapters' => $chs,
];

json_out([
    'book' => $out,
    'meta' => [
        'id'      => (string)$row['id'],
        'title'   => (string)$row['title'],
        'author'  => (string)$row['author'],
        'updated' => (int)$row['updated'],
    ],
]);
