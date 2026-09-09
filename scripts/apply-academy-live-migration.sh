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
if python3 - "$SQL_FILE" <<'PY'
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

python3 - "$SQL_FILE" "$REF" <<'PY'
import json, os, sys, urllib.request

sql_path, ref = sys.argv[1], sys.argv[2]
token = os.environ["SUPABASE_ACCESS_TOKEN"]
query = open(sql_path, encoding="utf-8").read()

# Management API accepts one query string; keep full migration as a single script.
body = json.dumps({"query": query}).encode("utf-8")
req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{ref}/database/query",
    data=body,
    method="POST",
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    },
)
try:
    with urllib.request.urlopen(req, timeout=180) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
        print("HTTP", resp.status)
        print(raw[:4000] if raw else "(empty body)")
except urllib.error.HTTPError as e:
    err = e.read().decode("utf-8", errors="replace")
    print("HTTP", e.code, file=sys.stderr)
    print(err[:8000], file=sys.stderr)
    sys.exit(1)
PY

echo "Done."
