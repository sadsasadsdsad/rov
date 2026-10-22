<?php
/* ==========================================================================
 * news.php — журнал «Черновика»: обновления сайта и статьи разработчиков
 *   GET            → список статей (+ admin: может ли текущий пользователь
 *                     писать — флаг из is_admin, профиль «123» уже админ)
 *   GET ?id=...    → одна статья (черновик видит только админ)
 *   POST           → создать статью  (только админ)
 *   PUT            → изменить статью (только админ)
 *   DELETE         → удалить статью  (только админ)
 * Чтение публично (как discover/read), запись — сессия + is_admin + origin.
 * Текст статьи — обычный: пустая строка между абзацами, HTML экранируется
 *   на клиенте при выводе (27-news.js), сервер хранит как есть.
 * ========================================================================== */
require __DIR__ . '/bootstrap.php';

function news_input(array $j): array
{
    $title = trim((string)($j['title'] ?? ''));
    $tag = trim((string)($j['tag'] ?? ''));
    $body = str_replace("\r\n", "\n", (string)($j['body'] ?? ''));
    $status = (($j['status'] ?? '') === 'draft') ? 'draft' : 'published';
    if ($title === '') json_err(422, 'нет заголовка');
    if (mb_strlen($title) > 140) json_err(422, 'заголовок длинный');
    if (mb_strlen($tag) > 30) json_err(422, 'рубрика длинная');
    if (trim($body) === '') json_err(422, 'пустой текст');
    if (mb_strlen($body) > 60000) json_err(422, 'текст длинный');
    return ['title' => $title, 'tag' => $tag, 'body' => $body, 'status' => $status];
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

/* ── чтение: публично, черновики только админу ──────────────────────────── */
if ($method === 'GET') {
    $u = current_user();
    $admin = is_admin($u);
    $id = trim((string)($_GET['id'] ?? ''));
    if ($id !== '') {
        $a = db_one('SELECT * FROM news_articles WHERE id = ?', [$id]);
        if (!$a || ($a['status'] !== 'published' && !$admin)) json_err(404, 'not found');
        json_out(['ok' => true, 'article' => $a, 'admin' => $admin]);
    }
    $sql = 'SELECT * FROM news_articles';
    if (!$admin) $sql .= " WHERE status = 'published'";
    $sql .= ' ORDER BY updated DESC, created DESC';
    $rows = db_all($sql);
    /* для списка хватает лида (первые ~170 знаков одной строкой) —
       полный body тянем только по id в читалку/редактор */
    foreach ($rows as &$a) {
        $a['lead'] = mb_substr(preg_replace('/\s+/u', ' ', (string)$a['body']), 0, 170);
        unset($a['body']);
    }
    unset($a);
    json_out(['ok' => true, 'articles' => $rows, 'admin' => $admin]);
}

/* ── запись: только админ из списка cfg('admins') ────────────────────────── */
guard();
$u = require_user();
if (!is_admin($u)) json_err(403, 'forbidden');
$who = trim((string)($u['login'] !== '' ? $u['login'] : $u['name']));

if ($method === 'POST') {
    $in = news_input(read_json());
    $id = new_id();
    $now = ts();
    db_run(
        'INSERT INTO news_articles(id, title, tag, body, status, author, created, updated)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?)',
        [$id, $in['title'], $in['tag'], $in['body'], $in['status'], $who, $now, $now]
    );
    json_out(['ok' => true, 'id' => $id]);
}

if ($method === 'PUT') {
    $j = read_json();
    $in = news_input($j);
    $id = substr(trim((string)($j['id'] ?? '')), 0, 40);
    if (!preg_match('/^[a-zA-Z0-9_\-]+$/', $id)) json_err(422, 'bad id');
    if (!db_one('SELECT id FROM news_articles WHERE id = ?', [$id])) json_err(404, 'not found');
    db_run(
        'UPDATE news_articles SET title = ?, tag = ?, body = ?, status = ?, author = ?, updated = ? WHERE id = ?',
        [$in['title'], $in['tag'], $in['body'], $in['status'], $who, ts(), $id]
    );
    json_out(['ok' => true, 'id' => $id]);
}

if ($method === 'DELETE') {
    $id = substr(trim((string)($_GET['id'] ?? '')), 0, 40);
    if (!preg_match('/^[a-zA-Z0-9_\-]+$/', $id)) json_err(422, 'bad id');
    if (db_run('DELETE FROM news_articles WHERE id = ?', [$id]) < 1) json_err(404, 'not found');
    json_out(['ok' => true, 'id' => $id]);
}

json_err(405, 'method not allowed');
