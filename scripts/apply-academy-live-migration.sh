#!/usr/bin/env bash
# Apply academy live SQL via Supabase Management API (additive only).
# Requires: SUPABASE_ACCESS_TOKEN
# Optional: SUPABASE_PROJECT_REF (default rivjkiksknnesahrvamf)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQL_FILE="${1:-$ROOT/admin/supabase-migration-academy-live.sql}"
REF="${SUPABASE_PROJECT_REF:-rivjkiksknnesahrvamf}"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "Missing SUPABASE_ACCESS_TOKEN" >&2
  exit 1
fi

if [[ ! -f "$SQL_FILE" ]]; then
  echo "SQL file not found: $SQL_FILE" >&2
  exit 1
fi

# Safety: refuse destructive statements (ignore SQL comments).
# Python exits 0 when clean, 1 when destructive SQL found.
if ! python3 - "$SQL_FILE" <<'PY'
import re, sys
text = open(sys.argv[1], encoding="utf-8").read()
# strip /* */ and -- comments
text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
text = re.sub(r"--.*?$", " ", text, flags=re.M)
pat = re.compile(
    r"\bdrop\s+table\b|\btruncate\s+\w|\bdelete\s+from\b|\bdrop\s+schema\b",
    re.I,
)
sys.exit(1 if pat.search(text) else 0)
PY
then
  echo "Refusing to run SQL that contains DROP TABLE / TRUNCATE / DELETE FROM / DROP SCHEMA" >&2
  exit 2
fi

echo "Applying $(basename "$SQL_FILE") to project $REF (additive)…"

BODY_FILE="$(mktemp)"
RESP_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE" "$RESP_FILE"' EXIT

python3 - "$SQL_FILE" "$BODY_FILE" <<'PY'
import json, sys
query = open(sys.argv[1], encoding="utf-8").read()
with open(sys.argv[2], "w", encoding="utf-8") as f:
    json.dump({"query": query}, f, ensure_ascii=False)
PY

# Use curl + browser-like UA: Python urllib is banned by Cloudflare on api.supabase.com (1010).
HTTP_CODE="$(
  curl -sS -o "$RESP_FILE" -w "%{http_code}" \
    -X POST "https://api.supabase.com/v1/projects/${REF}/database/query" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -H "User-Agent: Mozilla/5.0 (compatible; WaydeanMigrate/1.0; +https://waydean.ru)" \
    --data-binary @"$BODY_FILE"
)"

echo "HTTP $HTTP_CODE"
head -c 8000 "$RESP_FILE" || true
echo

if [[ "$HTTP_CODE" != "201" && "$HTTP_CODE" != "200" ]]; then
  echo "Migration request failed" >&2
  exit 1
fi

echo "Done."
