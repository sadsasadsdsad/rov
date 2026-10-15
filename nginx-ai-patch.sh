#!/usr/bin/env bash
# =============================================================================
# nginx-ai-patch.sh — точечно дописывает conf сайта (точки монтажа — скрипт,
#   живой conf не пересобирается целиком: на нём работает ещё uworld):
#   1) location = /api/ai.php (ИИ-релей): своя очередь rate-limit,
#      fastcgi_read_timeout 300s для длинной генерации, запрет буферизации
#      для SSE-стрима;
#   2) Cache-Control: html — no-cache (иначе браузер кэширует index.html
#      эвристически и держит старую вёрстку после обновления), статика — на
#      сутки (её адреса версионированы ?v=.. в index.html).
#   Идемпотентно: каждый шаг пропускается, если уже сделан; бэкап выносится
#   за sites-enabled.
#
#   sudo bash nginx-ai-patch.sh
# =============================================================================
set -euo pipefail

CONF=/etc/nginx/sites-enabled/rov.smartliba.ru.conf
BACKUP_DIR=/root/nginx-backup
# версию PHP не хардкодим: на сервере может быть 8.1/8.2/8.4 — хардкод
# проходил бы nginx -t, но ронял бы все php в 502
PHP_SOCK="$(ls -1t /run/php/php*-fpm.sock 2>/dev/null | head -n1)"
[[ -n "$PHP_SOCK" ]] || { echo "сокет php-fpm не найден в /run/php"; exit 1; }
ANCHOR='  location ~ \.php$ {'

[[ -f "$CONF" ]] || { echo "нет $CONF"; exit 1; }

NEED_AI=1; NEED_CACHE=1
if grep -q 'location = /api/ai.php' "$CONF"; then NEED_AI=0; fi
if grep -q 'no-cache, must-revalidate' "$CONF"; then NEED_CACHE=0; fi
if [[ $NEED_AI -eq 0 && $NEED_CACHE -eq 0 ]]; then
  echo 'уже пропатчен — выходим'
  exit 0
fi

mkdir -p "$BACKUP_DIR"
cp -a "$CONF" "$BACKUP_DIR/rov.smartliba.ru.conf.$(date +%Y%m%d%H%M%S)"
echo "бэкап: $BACKUP_DIR"

# 1) зона rate-limit — вне серверных блоков (файл подключается в http {})
if [[ $NEED_AI -eq 1 ]] && ! grep -q 'zone=ch_ai' "$CONF"; then
  sed -i '1i limit_req_zone $binary_remote_addr zone=ch_ai:10m rate=20r/m;' "$CONF"
fi

# 2) блоки location — строго перед обычным обработчиком .php
CONF="$CONF" PHP_SOCK="$PHP_SOCK" ANCHOR="$ANCHOR" NEED_AI="$NEED_AI" NEED_CACHE="$NEED_CACHE" python3 - <<'PY'
import os
from pathlib import Path

p = Path(os.environ['CONF'])
anchor = os.environ['ANCHOR']
sock = os.environ['PHP_SOCK']
need_ai = os.environ['NEED_AI'] == '1'
need_cache = os.environ['NEED_CACHE'] == '1'
s = p.read_text(encoding='utf-8')
if anchor not in s:
    raise SystemExit(f'якорь не найден: {anchor!r}')

blocks = []
if need_ai and 'location = /api/ai.php' not in s:
    blocks.append(f'''  # ИИ-релей (api/ai.php): генерация может идти до 5 минут, поэтому свой
  # fastcgi_read_timeout; запрет буферизации — чтобы SSE шёл в браузер сразу.
  # Ограничение частоты — своя зона ch_ai, чужие /api/* не задевает.
  location = /api/ai.php {{
    limit_req zone=ch_ai burst=30 nodelay;
    limit_req_status 429;
    fastcgi_read_timeout 300s;
    fastcgi_buffering off;
    include snippets/fastcgi-php.conf;
    fastcgi_pass unix:{sock};
  }}

''')
if need_cache and 'no-cache, must-revalidate' not in s:
    # add_header в location заменяет серверные «вместо» наследования —
    # безопасность продублирована внутри каждого вставляемого блока
    blocks.append('''  # Кэш: html перепроверяется каждый раз (иначе после обновления браузер
  # держит старый index.html по эвристике — вёрстка отстаёт от JS),
  # статика — на сутки: её адреса версионированы (?v=..) в index.html.
  location ~* \\.html$ {
    add_header Cache-Control "no-cache, must-revalidate";
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  }
  # js/css версионируются (?v=.. в index.html), но история помнит правки без
  # бампа версии — сутки кеша отдавали бы пользователям смесь старых и новых
  # модулей (порядок подключения строгий, расхождение версий = сломанный старт).
  # Перепроверка каждый раз — как в setup-server.sh; кэшируем только картинки
  # и шрифты, которые не версионируются.
  location ~* \\.(css|js|map)$ {
    add_header Cache-Control "no-cache, must-revalidate";
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  }
  location ~* \\.(jpg|jpeg|png|gif|svg|ico|woff|woff2|ttf)$ {
    add_header Cache-Control "public, max-age=86400";
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  }

''')

if blocks:
    i = s.index(anchor)
    s = s[:i] + ''.join(blocks) + s[i:]
    p.write_text(s, encoding='utf-8')
    print('блоки location вставлены')
PY

# сначала проверяем: сломанный conf на диске упадёт при СЛЕДУЮЩЕМ любом
# reload (certbot, setup-server) — откатываем к бэкапу сразу
if ! nginx -t; then
  cp -a "$(ls -t "$BACKUP_DIR"/* | head -n1)" "$CONF"
  echo "ОШИБКА конфига! Откат к бэкапу, nginx не перезагружен."
  nginx -t || true
  exit 1
fi
systemctl reload nginx
echo 'nginx пропатчен и перезагружен'
