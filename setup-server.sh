#!/usr/bin/env bash
# =============================================================================
# setup-server.sh — однокомандная установка «Черновика» на Ubuntu-сервер
# Использование (после git pull):
#     sudo bash setup-server.sh
# Что делает (идемпотентно, можно запускать повторно):
#   1. ставит nginx, PHP-FPM, MySQL, если их нет
#   2. создаёт базу chernovik и пользователя (пароль — в .dbpass)
#   3. пишет nginx-конфиг с fastcgi и переменными для api/config.php
#   4. включает сервисы, перезагружает nginx
#   5. проверяет https://домен/api/auth.php?action=me → {"user":null}
# =============================================================================
set -euo pipefail

DOMAIN="${1:-rov.smartliba.ru}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SITE_ROOT="$SCRIPT_DIR/src"
DB_NAME="chernovik"
DB_USER="chernovik"
DB_PASS_FILE="$SCRIPT_DIR/.dbpass"
CONF_DIR="/etc/nginx/sites-available"
ENABLED_DIR="/etc/nginx/sites-enabled"
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"

if [[ $EUID -ne 0 ]]; then
  echo "Запускай от root: sudo bash setup-server.sh"
  exit 1
fi
if [[ ! -f "$SITE_ROOT/index.html" ]]; then
  echo "Не найден $SITE_ROOT/index.html — запускай из корня репозитория (после git pull)."
  exit 1
fi

echo "==> 1/5 Пакеты (nginx, php-fpm, mysql)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx curl mysql-server \
  php-fpm php-mysql php-mbstring php-xml >/dev/null

echo "==> 2/5 Сервисы"
systemctl enable --now nginx >/dev/null 2>&1 || true
systemctl enable --now mysql >/dev/null 2>&1 || true
for unit in $(systemctl list-unit-files 'php*-fpm.service' --no-legend 2>/dev/null | awk '{print $1}'); do
  systemctl enable --now "$unit" >/dev/null 2>&1 || true
done
FPM_SOCK="$(ls -1t /run/php/php*-fpm.sock 2>/dev/null | head -n1 || true)"
if [[ -z "$FPM_SOCK" ]]; then
  echo "Не найден сокет PHP-FPM (/run/php/php*-fpm.sock)"; exit 1
fi
echo "    PHP-FPM сокет: $FPM_SOCK"

echo "==> 3/5 База данных $DB_NAME"
if [[ -f "$DB_PASS_FILE" ]]; then
  DB_PASS="$(cat "$DB_PASS_FILE")"
  echo "    пароль уже есть: $DB_PASS_FILE"
else
  DB_PASS="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  printf '%s' "$DB_PASS" > "$DB_PASS_FILE"
  chmod 600 "$DB_PASS_FILE"
  echo "    новый пароль сохранён: $DB_PASS_FILE"
fi
mysql --batch <<SQL
CREATE DATABASE IF NOT EXISTS $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
ALTER USER '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
SQL

echo "==> 4/5 Nginx-конфиг $DOMAIN"
HAVE_SSL=no
if [[ -f "$CERT_DIR/fullchain.pem" && -f "$CERT_DIR/privkey.pem" ]]; then
  HAVE_SSL=yes
  echo "    SSL-сертификат найден"
else
  echo "    ВНИМАНИЕ: сертификата нет — конфиг будет на порту 80 (нужен certbot)"
fi

MAIN_CONF="limit_req_zone \$binary_remote_addr zone=ch_auth:10m rate=10r/m;

server {
  server_name $DOMAIN;
  root $SITE_ROOT;
  index index.html;
"
if [[ $HAVE_SSL == yes ]]; then
  MAIN_CONF+="  listen 443 ssl;
  ssl_certificate $CERT_DIR/fullchain.pem;
  ssl_certificate_key $CERT_DIR/privkey.pem;
  include /etc/letsencrypt/options-ssl-nginx.conf;
  ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
"
else
  MAIN_CONF+="  listen 80;
"
fi
MAIN_CONF+="  client_max_body_size 20m;

  # брутфорс пароля — rate-limit на auth-эндпоинт (вход/регистрация/выход)
  location = /api/auth.php {
    limit_req zone=ch_auth burst=20 nodelay;
    limit_req_status 429;
    include snippets/fastcgi-php.conf;
    fastcgi_pass unix:$FPM_SOCK;
    fastcgi_param CHEROVIK_DB mysql;
    fastcgi_param CHEROVIK_MYSQL_DSN \"mysql:host=localhost;dbname=$DB_NAME;charset=utf8mb4\";
    fastcgi_param CHEROVIK_MYSQL_USER $DB_USER;
    fastcgi_param CHEROVIK_MYSQL_PASS $DB_PASS;
  }

  location ~ \.php\$ {
    include snippets/fastcgi-php.conf;
    fastcgi_pass unix:$FPM_SOCK;
    fastcgi_param CHEROVIK_DB mysql;
    fastcgi_param CHEROVIK_MYSQL_DSN \"mysql:host=localhost;dbname=$DB_NAME;charset=utf8mb4\";
    fastcgi_param CHEROVIK_MYSQL_USER $DB_USER;
    fastcgi_param CHEROVIK_MYSQL_PASS $DB_PASS;
  }

  # закрываем статику в api/ (схемы sql, дампы sqlite, md, логи) — там только php
  location ~ ^/api/ {
    deny all;
  }

  # не раздаём файлы-документацию/бэкапы/схемы из любого места сайта
  location ~ \\.(md|sql|sqlite|log|bak|ini|conf)$ {
    deny all;
  }

  # закрываем dotfiles (.git, .gitignore, .dbpass и т.п.), кроме certbot-challenge
  location ~ /\\.(?!well-known/) {
    deny all;
  }
}
"
if [[ $HAVE_SSL == yes ]]; then
  MAIN_CONF+="
server {
  if (\$host = $DOMAIN) { return 301 https://\$host\$request_uri; }
  server_name $DOMAIN;
  listen 80;
  return 404;
}
"
fi

if [[ -L "$ENABLED_DIR/$DOMAIN.conf" || -f "$ENABLED_DIR/$DOMAIN.conf" ]]; then
  TARGET="$ENABLED_DIR/$DOMAIN.conf"
else
  TARGET="$CONF_DIR/$DOMAIN.conf"
  ln -sf "$TARGET" "$ENABLED_DIR/$DOMAIN.conf"
fi
printf '%s\n' "$MAIN_CONF" > "$TARGET"
chmod 600 "$TARGET"   # в конфиге пароль БД — не давать читать всем
rm -f "$ENABLED_DIR/default"   # стоковый сайт nginx не нужен
for f in "$ENABLED_DIR"/*; do
  [[ -f "$f" || -L "$f" ]] || continue
  [[ "$(basename "$f")" == "$(basename "$TARGET")" ]] && continue
  if grep -q "$DOMAIN" "$f" 2>/dev/null; then
    echo "    убираю дубликат конфига: $f"
    rm -f "$f"
  fi
done

echo "==> 5/5 Проверка"
nginx -t
systemctl reload nginx
if [[ -n "${SUDO_USER:-}" ]]; then
  sudo -u "$SUDO_USER" git config --global --add safe.directory "$SCRIPT_DIR" 2>/dev/null || true
fi
git config --global --add safe.directory "$SCRIPT_DIR" 2>/dev/null || true

if [[ $HAVE_SSL == yes ]]; then
  OUT="$(curl -s --max-time 10 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/auth.php?action=me" || true)"
else
  OUT="$(curl -s --max-time 10 -H "Host: $DOMAIN" "http://127.0.0.1/api/auth.php?action=me" || true)"
fi

if [[ "$OUT" == *'"user'* ]]; then
  echo
  echo "ГОТОВО: API отвечает → $OUT"
  echo "Дальше: открой https://$DOMAIN/, зарегистрируй профиль — в меню профиля будет «синхронизация: вкл»."
else
  echo
  echo "API пока не отвечает корректно. Проверь:"
  echo "  curl -s 'https://$DOMAIN/api/auth.php?action=me'"
  echo "  sudo journalctl -u 'php*-fpm' -n 20 --no-pager"
  echo "  sudo tail -n 20 /var/log/nginx/error.log"
  exit 1
fi
