-- schema-sqlite.sql — схема «Черновика» для SQLite (создаётся автоматически)
CREATE TABLE IF NOT EXISTS users(
  id TEXT PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  pass_hash TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL,
  last_login INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS prefs(
  user_id TEXT PRIMARY KEY,
  data TEXT NOT NULL DEFAULT '{}',
  updated INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS stats(
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  updated INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, day)
);
CREATE TABLE IF NOT EXISTS books(
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  updated INTEGER NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'private',
  share_token TEXT,
  content TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_books_user ON books(user_id);
CREATE INDEX IF NOT EXISTS idx_books_vis ON books(visibility);
CREATE UNIQUE INDEX IF NOT EXISTS uq_books_token ON books(share_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions(expires);
CREATE INDEX IF NOT EXISTS idx_stats_user ON stats(user_id);
