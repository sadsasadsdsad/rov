-- schema-mysql.sql — схема «Черновика» для MySQL (создаётся автоматически)
CREATE TABLE IF NOT EXISTS users(
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  login VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL DEFAULT '',
  pass_hash VARCHAR(255) NOT NULL DEFAULT '',
  created BIGINT NOT NULL,
  last_login BIGINT NOT NULL,
  KEY idx_users_login(login)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions(
  token CHAR(64) NOT NULL PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL,
  created BIGINT NOT NULL,
  expires BIGINT NOT NULL,
  KEY idx_sessions_user(user_id),
  KEY idx_sessions_exp(expires)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prefs(
  user_id VARCHAR(40) NOT NULL PRIMARY KEY,
  data MEDIUMTEXT NOT NULL,
  updated BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stats(
  user_id VARCHAR(40) NOT NULL,
  day VARCHAR(10) NOT NULL,
  data MEDIUMTEXT NOT NULL,
  updated BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, day),
  KEY idx_stats_user(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS books(
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL,
  title VARCHAR(255) NOT NULL DEFAULT '',
  author VARCHAR(255) NOT NULL DEFAULT '',
  updated BIGINT NOT NULL DEFAULT 0,
  visibility VARCHAR(16) NOT NULL DEFAULT 'private',
  share_token VARCHAR(32) NULL,
  content MEDIUMTEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  KEY idx_books_user(user_id),
  KEY idx_books_vis(visibility),
  UNIQUE KEY uq_books_token(share_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
