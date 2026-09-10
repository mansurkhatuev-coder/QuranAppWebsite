#!/usr/bin/env bash
# Upload a local backup archive to a private Supabase Storage bucket.
# Requires: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, SUPABASE_URL
# Optional: BACKUP_BUCKET (default db-backups), KEEP_BACKUPS (default 60)
set -euo pipefail

ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "Usage: $0 <archive.tar.gz>" >&2
  exit 1
fi

REF="${SUPABASE_PROJECT_REF:-rivjkiksknnesahrvamf}"
URL="${SUPABASE_URL:-https://${REF}.supabase.co}"
BUCKET="${BACKUP_BUCKET:-db-backups}"
KEEP="${KEEP_BACKUPS:-60}"
UA="Mozilla/5.0 (compatible; WaydeanBackup/1.0; +https://waydean.ru)"
NAME="$(basename "$ARCHIVE")"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "Missing SUPABASE_ACCESS_TOKEN" >&2
  exit 1
fi

KEYS_FILE="$(mktemp)"
RESP="$(mktemp)"
trap 'rm -f "$KEYS_FILE" "$RESP"' EXIT

echo "Fetching project API keys…"
CODE="$(
  curl -sS -o "$KEYS_FILE" -w "%{http_code}" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Accept: application/json" \
    -H "User-Agent: ${UA}" \
    "https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true"
)"
if [[ "$CODE" != "200" ]]; then
  echo "api-keys HTTP $CODE" >&2
  head -c 500 "$KEYS_FILE" >&2 || true
  echo >&2
  exit 1
fi

SERVICE_ROLE="$(
  python3 - "$KEYS_FILE" <<'PY'
import json, sys
data = json.loads(open(sys.argv[1], encoding="utf-8").read())
if not isinstance(data, list):
    raise SystemExit("unexpected api-keys response")
picked = None
for row in data:
    if not isinstance(row, dict):
        continue
    name = (row.get("name") or row.get("id") or "").lower()
    typ = (row.get("type") or "").lower()
    # Prefer classic service_role / secret key.
    if name in ("service_role", "secret") or typ in ("service_role", "secret"):
        picked = row.get("api_key") or row.get("value") or row.get("key")
        if picked:
            break
    if "service" in name and row.get("api_key"):
        picked = row["api_key"]
if not picked:
    # Last resort: any key that looks like a JWT service role (role=service_role).
    import base64
    for row in data:
        key = (row or {}).get("api_key") or (row or {}).get("value")
        if not key or key.count(".") != 2:
            continue
        try:
            payload = key.split(".")[1]
            payload += "=" * (-len(payload) % 4)
            claims = json.loads(base64.urlsafe_b64decode(payload.encode()).decode())
            if claims.get("role") == "service_role":
                picked = key
                break
        except Exception:
            pass
if not picked:
    names = [((r or {}).get("name"), (r or {}).get("type")) for r in data]
    raise SystemExit(f"service_role key not found in api-keys; saw {names!r}")
print(picked)
PY
)"

if [[ -z "$SERVICE_ROLE" ]]; then
  echo "Empty service role key" >&2
  exit 1
fi

echo "Ensuring private bucket '${BUCKET}'…"
CODE="$(
  curl -sS -o "$RESP" -w "%{http_code}" \
    -X POST "${URL}/storage/v1/bucket" \
    -H "apikey: ${SERVICE_ROLE}" \
    -H "Authorization: Bearer ${SERVICE_ROLE}" \
    -H "Content-Type: application/json" \
    -d "{\"id\":\"${BUCKET}\",\"name\":\"${BUCKET}\",\"public\":false,\"fileSizeLimit\":524288000}"
)"
# 200/201 created, 409 already exists
if [[ "$CODE" != "200" && "$CODE" != "201" && "$CODE" != "409" ]]; then
  echo "create bucket HTTP $CODE" >&2
  head -c 800 "$RESP" >&2 || true
  echo >&2
  exit 1
fi
echo "bucket ok (HTTP $CODE)"

echo "Uploading ${NAME} → ${BUCKET}/${NAME}"
CODE="$(
  curl -sS -o "$RESP" -w "%{http_code}" \
    -X POST "${URL}/storage/v1/object/${BUCKET}/${NAME}" \
    -H "apikey: ${SERVICE_ROLE}" \
    -H "Authorization: Bearer ${SERVICE_ROLE}" \
    -H "Content-Type: application/gzip" \
    -H "x-upsert: true" \
    --data-binary @"${ARCHIVE}"
)"
if [[ "$CODE" != "200" && "$CODE" != "201" ]]; then
  echo "upload HTTP $CODE" >&2
  head -c 800 "$RESP" >&2 || true
  echo >&2
  exit 1
fi
echo "Uploaded OK"

echo "Pruning old backups (keep ${KEEP})…"
CODE="$(
  curl -sS -o "$RESP" -w "%{http_code}" \
    -X POST "${URL}/storage/v1/object/list/${BUCKET}" \
    -H "apikey: ${SERVICE_ROLE}" \
    -H "Authorization: Bearer ${SERVICE_ROLE}" \
    -H "Content-Type: application/json" \
    -d '{"prefix":"","limit":1000,"offset":0}'
)"
if [[ "$CODE" != "200" ]]; then
  echo "list HTTP $CODE (skip prune)" >&2
  head -c 400 "$RESP" >&2 || true
  echo >&2
  exit 0
fi

mapfile -t TO_DELETE < <(
  python3 - "$RESP" "$KEEP" <<'PY'
import json, sys
keep = int(sys.argv[2])
rows = json.loads(open(sys.argv[1], encoding="utf-8").read())
files = []
for row in rows if isinstance(rows, list) else []:
    name = row.get("name")
    if not name or not str(name).startswith("supabase-backup-"):
        continue
    files.append((row.get("created_at") or row.get("updated_at") or "", name))
files.sort(reverse=True)  # newest first
for _, name in files[keep:]:
    print(name)
PY
)

if [[ ${#TO_DELETE[@]} -eq 0 ]]; then
  echo "Nothing to prune"
  exit 0
fi

echo "Deleting ${#TO_DELETE[@]} old object(s)"
NAMES="$(printf '%s\n' "${TO_DELETE[@]}")"
export NAMES
DEL_JSON="$(python3 - <<'PY'
import json, os
names = [n for n in os.environ.get("NAMES", "").split("\n") if n]
print(json.dumps(names))
PY
)"

CODE="$(
  curl -sS -o "$RESP" -w "%{http_code}" \
    -X DELETE "${URL}/storage/v1/object/${BUCKET}" \
    -H "apikey: ${SERVICE_ROLE}" \
    -H "Authorization: Bearer ${SERVICE_ROLE}" \
    -H "Content-Type: application/json" \
    -d "$DEL_JSON"
)"
echo "prune HTTP $CODE"
head -c 400 "$RESP" || true
echo
