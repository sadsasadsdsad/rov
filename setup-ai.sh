#!/usr/bin/env bash
# =============================================================================
# setup-ai.sh — ставит прокси deepseek-web2api на этот же сервер (только
#   127.0.0.1:8080), чтобы сайт отвечал на вопросы ИИ с любого устройства.
#   Ключ релея берётся из .aikey (его создаёт setup-server.sh) и прописывается
#   в API_KEYS прокси — в браузер он не попадает.
#
# Использование (после git pull и загрузки архива кода прокси):
#     scp web2api.tar.gz root@сервер:/root/
#     sudo bash setup-ai.sh                 # или sudo bash setup-ai.sh /путь/к.tar.gz
#
# Что делает (идемпотентно, можно запускать повторно):
#   1. при необходимости ставит python3-venv
#   2. создаёт .aikey, если его ещё нет, и сверяет им API_KEYS прокси
#   3. раскладывает код в /opt/web2api (код, .env и data/accounts.json из архива)
#   4. собирает venv и ставит зависимости из requirements.txt
#   5. пишет systemd-юнит web2api.service, включает сервис
#   6. проверяет /health, /v1/models с ключом и релей сайта /api/ai.php
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AIKEY_FILE="$SCRIPT_DIR/.aikey"
SRC_ARCHIVE="${1:-/root/web2api.tar.gz}"
DEST="/opt/web2api"
UNIT="/etc/systemd/system/web2api.service"
UPSTREAM="http://127.0.0.1:8080"

if [[ $EUID -ne 0 ]]; then
  echo "Запускай от root: sudo bash setup-ai.sh"
  exit 1
fi
if [[ ! -f "$SRC_ARCHIVE" ]]; then
  echo "Не найден архив прокси: $SRC_ARCHIVE"
  echo "Загрузи его:  scp web2api.tar.gz root@<сервер>:/root/"
  exit 1
fi

echo "==> 1/5 Python"
export DEBIAN_FRONTEND=noninteractive
# именно ensurepip, а не venv: модуль venv в stdlib есть всегда, а без
# пакета python3-venv сборка окружения падает на шаге с pip
if ! python3 -c 'import ensurepip' >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq python3-venv >/dev/null
fi
python3 --version

echo "==> 2/5 Ключ релея (.aikey)"
if [[ -f "$AIKEY_FILE" ]]; then
  echo "    уже есть: $AIKEY_FILE"
else
  head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$AIKEY_FILE"
  chmod 600 "$AIKEY_FILE"
  echo "    создан: $AIKEY_FILE"
fi
AIKEY="$(cat "$AIKEY_FILE")"
[[ -n "$AIKEY" ]] || { echo "пустой ключ в $AIKEY_FILE"; exit 1; }

echo "==> 3/5 Раскладка кода в $DEST"
rm -rf "$DEST"
mkdir -p "$DEST"
tar -xzf "$SRC_ARCHIVE" -C "$DEST"
if [[ ! -f "$DEST/server.py" ]]; then
  # архив мог собраться с верхнеуровневой папкой — заходим внутрь
  sub="$(find "$DEST" -mindepth 1 -maxdepth 1 -type d | head -n1 || true)"
  [[ -n "$sub" && -f "$sub/server.py" ]] || { echo "server.py не найден в архиве"; exit 1; }
  shopt -s dotglob
  mv "$sub"/* "$DEST"/
  shopt -u dotglob
fi
chmod 600 "$DEST/.env" 2>/dev/null || true
chmod 600 "$DEST/data/accounts.json" 2>/dev/null || true
# ключ прокси = ключ релея (.aikey) — единственный источник правды
if grep -q '^API_KEYS=' "$DEST/.env"; then
  sed -i "s|^API_KEYS=.*|API_KEYS= $AIKEY|" "$DEST/.env"
else
  printf '\nAPI_KEYS= %s\n' "$AIKEY" >> "$DEST/.env"
fi
# прокси живёт в фоне на 127.0.0.1 — этих настроек достаточно
sed -i 's|^HOST=.*|HOST= 127.0.0.1|' "$DEST/.env" || true
sed -i 's|^PORT=.*|PORT= 8080|' "$DEST/.env" || true
echo "    код и .env готовы"

echo "==> 4/5 Зависимости (venv)"
python3 -m venv "$DEST/.venv"
"$DEST/.venv/bin/pip" install --quiet --upgrade pip
"$DEST/.venv/bin/pip" install --quiet -r "$DEST/requirements.txt"
echo "    pip ok"

echo "==> 5/5 Сервис web2api"
cat > "$UNIT" <<'UNIT'
[Unit]
Description=DeepSeek web2api proxy (127.0.0.1:8080) для rov.smartliba.ru
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/web2api
ExecStart=/opt/web2api/.venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8080
Restart=always
RestartSec=5
# наружу не светим: слушаем только 127.0.0.1, статику webui не раздаём
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now web2api >/dev/null 2>&1
systemctl restart web2api

echo "==> 6/6 Проверка"
ok=0
for _ in $(seq 1 20); do
  sleep 1
  if curl -sf "$UPSTREAM/health" >/dev/null 2>&1; then ok=1; break; fi
done
if [[ $ok -ne 1 ]]; then
  echo "    прокси не поднялся — смотри:  journalctl -u web2api -n 40 --no-pager"
  exit 1
fi
echo "    health:      $(curl -s "$UPSTREAM/health")"
echo "    models(ключ): HTTP $(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $AIKEY" "$UPSTREAM/v1/models")"
RELAY_CODE="$(curl -s -o /dev/null -w '%{http_code}' --resolve rov.smartliba.ru:443:127.0.0.1 https://rov.smartliba.ru/api/ai.php?action=models || true)"
echo "    релей сайта:  HTTP $RELAY_CODE  (200 — всё работает; 503 — DeepSeek лёг, сайт покажет «повторить»)"
echo
echo "ГОТОВО. Проверь сам: открой сайт, кнопка ИИ внизу справа — «DeepSeek на связи»."
