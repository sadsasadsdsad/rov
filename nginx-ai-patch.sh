#!/usr/bin/env bash
# =============================================================================
# nginx-ai-patch.sh — точечно добавляет в conf сайта location = /api/ai.php
#   (ИИ-релей): своя очередь rate-limit, fastcgi_read_timeout 300s для
#   длинной генерации и запрет буферизации для SSE-стрима.
#   Идемпотентно: бэкап выносится за sites-enabled, повторный запуск — no-op.
#   Живой conf сайта не пересобирается целиком (на нём работает ещё uworld).
#
#   sudo bash nginx-ai-patch.sh
# =============================================================================
set -euo pipefail

CONF=/etc/nginx/sites-enabled/rov.smartliba.ru.conf
BACKUP_DIR=/root/nginx-backup
PHP_SOCK=/run/php/php8.3-fpm.sock
ANCHOR='  location ~ \.php$ {'

[[ -f "$CONF" ]] || { echo "нет $CONF"; exit 1; }
if grep -q 'location = /api/ai.php' "$CONF"; then
  echo 'уже пропатчен — выходим'
  exit 0
fi

mkdir -p "$BACKUP_DIR"
cp -a "$CONF" "$BACKUP_DIR/rov.smartliba.ru.conf.$(date +%Y%m%d%H%M%S)"
echo "бэкап: $BACKUP_DIR"

# 1) зона rate-limit — вне серверных блоков (файл подключается в http {})
if ! grep -q 'zone=ch_ai' "$CONF"; then
  sed -i '1i limit_req_zone $binary_remote_addr zone=ch_ai:10m rate=20r/m;' "$CONF"
fi

# 2) блок location — строго перед обычным обработчиком .php
CONF="$CONF" PHP_SOCK="$PHP_SOCK" ANCHOR="$ANCHOR" python3 - <<'PY'
import os
from pathlib import Path

p = Path(os.environ['CONF'])
anchor = os.environ['ANCHOR']
sock = os.environ['PHP_SOCK']
s = p.read_text(encoding='utf-8')
if 'location = /api/ai.php' in s:
    raise SystemExit(0)
if anchor not in s:
    raise SystemExit(f'якорь не найден: {anchor!r}')
block = f'''  # ИИ-релей (api/ai.php): генерация может идти до 5 минут, поэтому свой
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

'''
i = s.index(anchor)
s = s[:i] + block + s[i:]
p.write_text(s, encoding='utf-8')
print('блок location вставлен')
PY

nginx -t
systemctl reload nginx
echo 'nginx пропатчен и перезагружен'
