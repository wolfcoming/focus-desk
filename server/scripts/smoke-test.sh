#!/bin/bash
set -euo pipefail
BODY='{"email":"demo@focusdesk.local","password":"DemoPass123"}'
LOGIN=$(curl -sS -X POST http://127.0.0.1:8081/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d "$BODY")
echo "login=$LOGIN"
TOKEN=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["token"])' "$LOGIN")
PUSH=$(curl -sS -X POST http://127.0.0.1:8081/api/v1/sync/push \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"changes":[{"collection":"projects","clientId":"p-demo-1","updatedAt":"2026-11-07T11:00:00Z","deleted":false,"payload":{"name":"Demo"}}]}')
echo "push=$PUSH"
PULL=$(curl -sS "http://127.0.0.1:8081/api/v1/sync/changes?since=1970-01-01T00:00:00Z" \
  -H "Authorization: Bearer $TOKEN")
echo "pull=$PULL"
curl -sS http://127.0.0.1:8081/api/v1/health
echo
