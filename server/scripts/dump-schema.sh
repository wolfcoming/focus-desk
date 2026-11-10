#!/bin/bash
set -euo pipefail
set -a
source /etc/focus-desk-sync/app.env
set +a
mysqldump --no-data --skip-comments --no-tablespaces --databases focus_desk -u"$DB_USER" -p"$DB_PASSWORD"
