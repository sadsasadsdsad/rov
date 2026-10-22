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

-- неудачные попытки входа: защита от перебора одного логина (в т.ч. с разных IP)
CREATE TABLE IF NOT EXISTS login_attempts(
  login VARCHAR(32) NOT NULL,
  ip VARCHAR(45) NOT NULL DEFAULT '',
  ts BIGINT NOT NULL,
  KEY idx_att_login(login, ts),
  KEY idx_att_ts(ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- журнал: статьи разработчиков, пишет только админ (см. news.php)
CREATE TABLE IF NOT EXISTS news_articles(
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  title VARCHAR(140) NOT NULL DEFAULT '',
  tag VARCHAR(30) NOT NULL DEFAULT '',
  body MEDIUMTEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'published',
  author VARCHAR(32) NOT NULL DEFAULT '',
  created BIGINT NOT NULL,
  updated BIGINT NOT NULL,
  KEY idx_news_updated(updated)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
