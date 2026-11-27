#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
docker_bin=${DREWO_DOCKER_BIN:-docker}
pg_image=${DREWO_PG_TEST_IMAGE:-postgres:16-alpine}
container="drewo-pg16-migration-test-$$-${RANDOM}"

cleanup() {
  "$docker_bin" rm -f "$container" >/dev/null 2>&1 || true
}
trap cleanup EXIT

"$docker_bin" run --rm --detach --name "$container" \
  -e POSTGRES_PASSWORD=drewo-local-test-only \
  -e POSTGRES_DB=postgres \
  "$pg_image" >/dev/null

ready=false
for _ in $(seq 1 60); do
  if "$docker_bin" exec "$container" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  echo "PostgreSQL test container did not become ready within 60 seconds" >&2
  exit 1
fi

"$docker_bin" exec -i "$container" psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text unique);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to authenticated, service_role;
grant execute on function auth.uid() to authenticated, service_role;
create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (bucket_id text not null, name text not null);
alter table storage.objects enable row level security;
SQL

migrations=(
  supabase/migrations/20261124113244_drewo_free_plus_core.sql
  supabase/migrations/20261124113604_drewo_plus_privilege_hardening.sql
  supabase/migrations/20261124113705_drewo_plus_fk_indexes_and_admin_policy.sql
  supabase/migrations/20261126_drewo_password_budget.sql
  supabase/migrations/20261127_drewo_session_revocations.sql
  supabase/migrations/20261127120000_drewo_plus_one_tree_once.sql
  supabase/migrations/20261127183522_drewo_plus_person_places.sql
  supabase/migrations/20261128_drewo_family_places.sql
)
for migration in "${migrations[@]}"; do
  "$docker_bin" exec -i "$container" psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 \
    < "$repo_root/$migration"
done

"$docker_bin" exec -i "$container" psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'owner@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'other@example.test');

create function public.test_drewo_cross_place_insert()
returns boolean language plpgsql as $$
begin
  begin
    insert into public.drewo_plus_person_places (tree_id, person_id, place_id, kind)
    values (
      current_setting('test.drewo_tree_id')::uuid,
      current_setting('test.drewo_person_id')::uuid,
      'foreign-place', 'Переселение'
    );
  exception when insufficient_privilege then
    return true;
  end;
  return false;
end $$;
grant execute on function public.test_drewo_cross_place_insert() to authenticated;
SQL

"$docker_bin" exec -i "$container" psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 <<'SQL'
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false) \gset
select public.drewo_plus_ensure_account('Synthetic Owner') \gset
select public.drewo_plus_create_tree(
  'Synthetic Tree', 'Synthetic Root', '33333333-3333-4333-8333-333333333333', null, null
) as tree_id \gset
select id as person_id from public.drewo_plus_people where tree_id = :'tree_id' \gset
insert into public.drewo_plus_person_places (tree_id, person_id, place_id, kind)
values (:'tree_id', :'person_id', 'sample-place', 'Родное место');
select set_config('test.drewo_tree_id', :'tree_id', false) \gset
select set_config('test.drewo_person_id', :'person_id', false) \gset
do $$
begin
  begin
    perform public.drewo_plus_create_tree(
      'Second Tree', 'Second Root', '44444444-4444-4444-8444-444444444444', null, null
    );
    raise exception 'second tree unexpectedly succeeded';
  exception when unique_violation then null;
  end;
  if has_table_privilege(current_user, 'public.drewo_plus_trees', 'DELETE') then
    raise exception 'authenticated can delete a personal tree';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false) \gset
do $$
begin
  if (select count(*) from public.drewo_plus_person_places) <> 0 then
    raise exception 'another account can read personal places';
  end if;
  if not public.test_drewo_cross_place_insert() then
    raise exception 'cross-owner personal place insert unexpectedly succeeded';
  end if;
end $$;
reset role;

do $$
begin
  if has_function_privilege('anon', 'public.drewo_password_budget(text,text,text,bigint)', 'execute') then raise exception 'anon can call password budget'; end if;
  if has_function_privilege('authenticated', 'public.drewo_password_budget(text,text,text,bigint)', 'execute') then raise exception 'authenticated can call password budget'; end if;
  if not has_function_privilege('service_role', 'public.drewo_password_budget(text,text,text,bigint)', 'execute') then raise exception 'service role cannot call password budget'; end if;
  if has_function_privilege('authenticated', 'public.drewo_family_session(text,bigint)', 'execute') then raise exception 'authenticated can call family session store'; end if;
  if has_function_privilege('authenticated', 'public.drewo_family_places(text,text,text,boolean)', 'execute') then raise exception 'authenticated can call family places'; end if;
end $$;

set role service_role;
do $$
declare
  result jsonb;
  session_key constant text := repeat('d', 64);
begin
  result := public.drewo_family_places('drewo-synthetic', 'sample-place', 'Родное место', true);
  if not result @> '[{"id":"sample-place","kind":"Родное место"}]'::jsonb then
    raise exception 'family place did not round-trip through the server-only RPC';
  end if;
  if not public.drewo_family_session(session_key, floor(extract(epoch from clock_timestamp()) * 1000)::bigint + 3600000) then
    raise exception 'family session revocation failed';
  end if;
  if not public.drewo_family_session(session_key) then
    raise exception 'revoked family session was not found';
  end if;
  for i in 1..5 loop
    result := public.drewo_password_budget(repeat('a',64), repeat('b',64), repeat('c',64));
    if (result->>'retry_after_sec')::integer > 0 then raise exception 'password budget blocked below the configured threshold'; end if;
  end loop;
  result := public.drewo_password_budget(repeat('a',64), repeat('b',64), repeat('c',64));
  if (result->>'retry_after_sec')::integer = 0 then raise exception 'password budget did not block after the configured attempts'; end if;
end $$;
reset role;
SQL

echo "Drewo migrations applied and PostgreSQL 16 security smoke checks passed (Supabase auth/storage are test stubs)."
