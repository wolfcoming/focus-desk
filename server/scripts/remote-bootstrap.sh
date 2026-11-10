#!/bin/bash
set -euo pipefail

ROOT_PASS="${1:?mysql root password required}"
DBPASS="$(grep '^DB_PASSWORD=' /etc/focus-desk-sync/app.env | cut -d= -f2-)"

mysql -uroot -p"$ROOT_PASS" <<SQL
CREATE DATABASE IF NOT EXISTS focus_desk DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'focus_desk'@'localhost' IDENTIFIED BY '${DBPASS}';
ALTER USER 'focus_desk'@'localhost' IDENTIFIED BY '${DBPASS}';
GRANT ALL PRIVILEGES ON focus_desk.* TO 'focus_desk'@'localhost';
FLUSH PRIVILEGES;
SQL

mysql -ufocus_desk -p"$DBPASS" -e 'SELECT 1 AS ok;' focus_desk

systemctl enable focus-desk-sync
systemctl restart focus-desk-sync
sleep 5
systemctl --no-pager --full status focus-desk-sync | sed -n '1,20p'
ss -lntp | grep 8081 || true
echo '--- health ---'
curl -sS http://127.0.0.1:8081/api/v1/health || true
echo
echo '--- register ---'
curl -sS -X POST http://127.0.0.1:8081/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@focusdesk.local","password":"DemoPass123"}' || true
echo
