#!/usr/bin/env bash
# Deploy focus-desk-sync to the production host.
# Uses local SSH key (BatchMode). Override host with SYNC_HOST.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${SYNC_HOST:-root@47.93.153.219}"
REMOTE_DIR="${SYNC_REMOTE_DIR:-/opt/focus-desk-sync}"
PUBLIC_BASE="${SYNC_PUBLIC_BASE:-http://47.93.153.219:8081}"
BUNDLE="$(mktemp -t focus-desk-sync.XXXXXX.tar.gz)"

cleanup() { rm -f "$BUNDLE"; }
trap cleanup EXIT

echo "== pack sources =="
tar -C "$ROOT" -czf "$BUNDLE" \
  --exclude 'target' \
  --exclude '.tools' \
  --exclude '.git' \
  src pom.xml README.md schema.sql scripts

echo "== upload to $HOST:$REMOTE_DIR =="
scp -o BatchMode=yes "$BUNDLE" "$HOST:/tmp/focus-desk-sync-src.tar.gz"

echo "== extract, build, restart =="
ssh -o BatchMode=yes "$HOST" bash -s <<EOF
set -euo pipefail
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk
export PATH="\$JAVA_HOME/bin:\$PATH"
cd "$REMOTE_DIR"
tar -xzf /tmp/focus-desk-sync-src.tar.gz
rm -f /tmp/focus-desk-sync-src.tar.gz
mvn -q -DskipTests package
systemctl restart focus-desk-sync
sleep 4
systemctl --no-pager --full status focus-desk-sync | sed -n '1,18p'
curl -sf http://127.0.0.1:8081/api/v1/health
echo
EOF

echo "== probe profile endpoint =="
code=$(curl -sS -o /tmp/focus-desk-me.txt -w '%{http_code}' -X PATCH "$PUBLIC_BASE/api/v1/auth/me" \
  -H 'Content-Type: application/json' -d '{"displayName":"probe"}' || true)
echo "PATCH /api/v1/auth/me -> HTTP $code (401/403 expected without token; static-resource means old build)"
head -c 240 /tmp/focus-desk-me.txt; echo
echo "done"
