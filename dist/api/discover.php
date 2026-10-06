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
$rows = db_all("SELECT id, title, author, updated FROM books WHERE visibility = 'public' ORDER BY updated DESC LIMIT 300");
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
