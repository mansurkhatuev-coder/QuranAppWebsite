#!/usr/bin/env bash
# Export all public.* tables (+ auth.users metadata) via Supabase Management API.
# Free alternative to Pro daily backups. Requires SUPABASE_ACCESS_TOKEN.
#
# Writes JSON files under BACKUP_DIR (default ./backup-out).
# Uses curl (not Python urllib) — api.supabase.com blocks urllib via Cloudflare.
set -euo pipefail

REF="${SUPABASE_PROJECT_REF:-rivjkiksknnesahrvamf}"
BACKUP_DIR="${BACKUP_DIR:-backup-out}"
PAGE_SIZE="${BACKUP_PAGE_SIZE:-1000}"
UA="Mozilla/5.0 (compatible; WaydeanBackup/1.0; +https://waydean.ru)"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "Missing SUPABASE_ACCESS_TOKEN" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
BODY="$(mktemp)"
RESP="$(mktemp)"
HDRS="$(mktemp)"
trap 'rm -f "$BODY" "$RESP" "$HDRS"' EXIT

mgmt_query() {
  local sql="$1"
  python3 -c 'import json,sys; json.dump({"query": sys.stdin.read()}, sys.stdout, ensure_ascii=False)' <<<"$sql" >"$BODY"
  local code
  code="$(
    curl -sS -o "$RESP" -w "%{http_code}" \
      -X POST "https://api.supabase.com/v1/projects/${REF}/database/query" \
      -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json" \
      -H "User-Agent: ${UA}" \
      --data-binary @"$BODY"
  )"
  if [[ "$code" != "200" && "$code" != "201" ]]; then
    echo "Management API HTTP $code for query:" >&2
    head -c 2000 "$RESP" >&2 || true
    echo >&2
    return 1
  fi
}

# Fallback if discovery fails (known Waydean tables).
FALLBACK_TABLES=(
  academy_answers
  academy_course_feedback
  academy_final_exam_entries
  academy_giveaway_settings
  academy_lesson_teachers
  academy_lessons
  academy_org_members
  academy_orgs
  academy_participants
  academy_public_hub_lessons
  academy_public_hubs
  academy_questions
  academy_session_hosts
  academy_sessions
  academy_students
  academy_teachers
  analytics_daily
  analytics_events
  analytics_installations
  analytics_social_daily
  app_release
  ce_locale_draft
  content_manifest
  drewo_presence
  drewo_tree_stats
  dua_items
  home_announcements
  home_daily_pools
  store_download_days
  store_download_meta
)

echo "Discovering public tables…"
TABLES=()
if mgmt_query "select tablename from pg_tables where schemaname = 'public' order by 1;"; then
  mapfile -t TABLES < <(python3 - "$RESP" <<'PY'
import json, sys
raw = open(sys.argv[1], encoding="utf-8").read()
data = json.loads(raw)
# API may return a bare list or {"result":[...]} / nested shapes.
if isinstance(data, dict):
    for key in ("result", "data", "rows"):
        if isinstance(data.get(key), list):
            data = data[key]
            break
if not isinstance(data, list):
    raise SystemExit("unexpected table-list response shape")
for row in data:
    if isinstance(row, dict):
        name = row.get("tablename") or row.get("table_name")
        if name:
            print(name)
PY
) || TABLES=()
fi

if [[ ${#TABLES[@]} -eq 0 ]]; then
  echo "Discovery empty/failed — using fallback table list"
  TABLES=("${FALLBACK_TABLES[@]}")
fi

echo "Tables (${#TABLES[@]}): ${TABLES[*]}"

python3 - "$BACKUP_DIR/meta.json" "$REF" <<'PY'
import json, sys, datetime
path, ref = sys.argv[1], sys.argv[2]
meta = {
    "exported_at": datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
    "project_ref": ref,
    "version": 1,
    "format": "json-tables",
    "note": "Free GitHub Actions backup (Management API). Storage objects not included.",
}
with open(path, "w", encoding="utf-8") as f:
    json.dump(meta, f, ensure_ascii=False, indent=2)
    f.write("\n")
PY

export_table() {
  local schema="$1"
  local table="$2"
  local out="$3"
  local fq="${schema}.${table}"
  echo "Export ${fq}"

  local count_sql="select count(*)::bigint as n from ${schema}.\"${table}\";"
  mgmt_query "$count_sql"
  local total
  total="$(python3 - "$RESP" <<'PY'
import json, sys
data = json.loads(open(sys.argv[1], encoding="utf-8").read())
if isinstance(data, dict):
    for key in ("result", "data", "rows"):
        if isinstance(data.get(key), list):
            data = data[key]
            break
if isinstance(data, list) and data:
    row = data[0]
    print(int(row.get("n") or row.get("count") or 0))
else:
    print(0)
PY
)"
  echo "  rows: ${total}"

  : >"$out.ndjson"
  local offset=0
  local page=0
  while (( offset < total || (total == 0 && page == 0) )); do
    local sql
    # ctid order is stable enough for chunked dumps without knowing PK.
    sql="select row_to_json(t) as row from (
      select * from ${schema}.\"${table}\" order by ctid
      limit ${PAGE_SIZE} offset ${offset}
    ) t;"
    mgmt_query "$sql"
    local got
    got="$(python3 - "$RESP" "$out.ndjson" <<'PY'
import json, sys
src, dest = sys.argv[1], sys.argv[2]
data = json.loads(open(src, encoding="utf-8").read())
if isinstance(data, dict):
    for key in ("result", "data", "rows"):
        if isinstance(data.get(key), list):
            data = data[key]
            break
if not isinstance(data, list):
    raise SystemExit("unexpected page response")
n = 0
with open(dest, "a", encoding="utf-8") as f:
    for item in data:
        if isinstance(item, dict) and "row" in item:
            json.dump(item["row"], f, ensure_ascii=False)
        else:
            json.dump(item, f, ensure_ascii=False)
        f.write("\n")
        n += 1
print(n)
PY
)"
    echo "  page ${page}: ${got} rows (offset ${offset})"
    if [[ "$got" -eq 0 ]]; then
      break
    fi
    offset=$((offset + got))
    page=$((page + 1))
    if (( got < PAGE_SIZE )); then
      break
    fi
  done

  python3 - "$out.ndjson" "$out" "$total" "$fq" <<'PY'
import json, sys
ndjson, out, total, fq = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
rows = []
with open(ndjson, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line:
            rows.append(json.loads(line))
payload = {"table": fq, "row_count": len(rows), "expected_count": total, "rows": rows}
with open(out, "w", encoding="utf-8") as f:
    json.dump(payload, f, ensure_ascii=False)
    f.write("\n")
if total and len(rows) != total:
    print(f"WARNING: {fq} exported {len(rows)} != expected {total}", file=sys.stderr)
PY
  rm -f "$out.ndjson"
}

for table in "${TABLES[@]}"; do
  export_table "public" "$table" "$BACKUP_DIR/${table}.json"
done

# Auth users without password hashes (enough to re-invite / map ids).
echo "Export auth.users (metadata, no password hashes)"
AUTH_OUT="$BACKUP_DIR/auth_users.json"
: >"$AUTH_OUT.ndjson"
offset=0
page=0
mgmt_query "select count(*)::bigint as n from auth.users;"
auth_total="$(python3 - "$RESP" <<'PY'
import json, sys
data = json.loads(open(sys.argv[1], encoding="utf-8").read())
if isinstance(data, dict):
    for key in ("result", "data", "rows"):
        if isinstance(data.get(key), list):
            data = data[key]
            break
print(int(data[0].get("n") or 0) if isinstance(data, list) and data else 0)
PY
)"
while (( offset < auth_total || (auth_total == 0 && page == 0) )); do
  mgmt_query "select row_to_json(t) as row from (
    select id, email, phone, role, created_at, updated_at, last_sign_in_at,
           email_confirmed_at, phone_confirmed_at, banned_until, raw_app_meta_data,
           raw_user_meta_data, is_anonymous
    from auth.users
    order by created_at nulls last, id
    limit ${PAGE_SIZE} offset ${offset}
  ) t;"
  got="$(python3 - "$RESP" "$AUTH_OUT.ndjson" <<'PY'
import json, sys
src, dest = sys.argv[1], sys.argv[2]
data = json.loads(open(src, encoding="utf-8").read())
if isinstance(data, dict):
    for key in ("result", "data", "rows"):
        if isinstance(data.get(key), list):
            data = data[key]
            break
n = 0
with open(dest, "a", encoding="utf-8") as f:
    for item in data if isinstance(data, list) else []:
        row = item.get("row", item) if isinstance(item, dict) else item
        json.dump(row, f, ensure_ascii=False)
        f.write("\n")
        n += 1
print(n)
PY
)"
  echo "  auth page ${page}: ${got}"
  [[ "$got" -eq 0 ]] && break
  offset=$((offset + got))
  page=$((page + 1))
  (( got < PAGE_SIZE )) && break
done
python3 - "$AUTH_OUT.ndjson" "$AUTH_OUT" "$auth_total" <<'PY'
import json, sys
ndjson, out, total = sys.argv[1], sys.argv[2], int(sys.argv[3])
rows = [json.loads(l) for l in open(ndjson, encoding="utf-8") if l.strip()]
with open(out, "w", encoding="utf-8") as f:
    json.dump({"table": "auth.users", "row_count": len(rows), "expected_count": total, "rows": rows}, f, ensure_ascii=False)
    f.write("\n")
PY
rm -f "$AUTH_OUT.ndjson"

python3 - "$BACKUP_DIR" <<'PY'
import json, os, sys
from pathlib import Path
root = Path(sys.argv[1])
summary = []
for path in sorted(root.glob("*.json")):
    if path.name == "meta.json":
        continue
    data = json.loads(path.read_text(encoding="utf-8"))
    summary.append({
        "file": path.name,
        "table": data.get("table"),
        "row_count": data.get("row_count"),
        "expected_count": data.get("expected_count"),
    })
meta_path = root / "meta.json"
meta = json.loads(meta_path.read_text(encoding="utf-8"))
meta["tables"] = summary
meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(summary, ensure_ascii=False, indent=2))
PY

echo "Export complete → ${BACKUP_DIR}"
