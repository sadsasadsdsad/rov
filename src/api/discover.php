<?php
/* ==========================================================================
 * discover.php — каталог публичных книг (без входа)
 *   GET ?q=… → {books:[{id,title,author,updated}]} — только visibility='public'
 * Поиск — по названию и автору (без учёта регистра, кириллица).
 * ========================================================================== */
require __DIR__ . '/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($method, ['GET', 'HEAD'], true)) json_err(405, 'method not allowed');

$q = trim((string)($_GET['q'] ?? ''));
/* длина запроса ограничена: длинная строка × 3000 строк каталога ×
   mb_stripos — лишняя нагрузка CPU одним запросом */
if (mb_strlen($q) > 100) json_err(422, 'bad q');
/* с фильтром берём заметно больше строк: 300 самых свежих книг каталога
   не обязаны содержать искомое — результат был бы пустым зря */
$limit = (int)($q !== '' ? 3000 : 300);
$rows = db_all("SELECT id, title, author, updated FROM books WHERE visibility = 'public' ORDER BY updated DESC LIMIT " . $limit);
$out = [];
foreach ($rows as $r) {
    $title  = (string)$r['title'];
    $author = (string)$r['author'];
    if ($q !== '') {
        $hit = mb_stripos($title, $q) !== false || mb_stripos($author, $q) !== false;
        if (!$hit) continue;
    }
    $out[] = [
        'id'      => (string)$r['id'],
        'title'   => $title,
        'author'  => $author,
        'updated' => (int)$r['updated'],
    ];
}
json_out(['books' => $out]);
