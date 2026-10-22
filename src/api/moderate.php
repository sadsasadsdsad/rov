<?php
/* ==========================================================================
 * moderate.php — модерация каталога «Общие книги» (только админы)
 *   POST {id} → снимает чужую книгу с публикации: visibility public → private.
 *   Книга остаётся у владельца (он может опубликовать её снова) — из каталога
 *   исчезает. Список админов — cfg('admins') в config.php / env CHEROVIK_ADMINS.
 * ========================================================================== */
require __DIR__ . '/bootstrap.php';

need_method('POST');
guard();
$u = require_user();
if (!is_admin($u)) json_err(403, 'forbidden');

$j = read_json();
$id = substr(trim((string)($j['id'] ?? '')), 0, 40);
if ($id === '' || !preg_match('/^[a-zA-Z0-9_\-]+$/', $id)) json_err(422, 'bad id');

/* снимаем только публичные книги; свежий updated — LWW, книга владельца
   перечитывается у него при следующей синхронизации */
$n = db_run("UPDATE books SET visibility = 'private', updated = " . ts() . " WHERE id = ? AND visibility = 'public'", [$id]);
if ($n < 1) json_err(404, 'not found');
json_out(['ok' => true, 'id' => $id]);
