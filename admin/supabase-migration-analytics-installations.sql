-- Active installation registry (anonymous). Safe to re-run after analytics_events migration.

create table if not exists public.analytics_installations (
  installation_id text primary key check (char_length(installation_id) between 8 and 80),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  platform text,
  app_version text,
  locale text
);

alter table public.analytics_installations enable row level security;

drop policy if exists "public insert analytics installations" on public.analytics_installations;
drop policy if exists "public update analytics installations" on public.analytics_installations;
drop policy if exists "authenticated read analytics installations" on public.analytics_installations;

create policy "public insert analytics installations"
  on public.analytics_installations
  for insert
  to anon, authenticated
  with check (true);

-- Needed for PostgREST upsert (on_conflict merge).
create policy "public update analytics installations"
  on public.analytics_installations
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "authenticated read analytics installations"
  on public.analytics_installations
  for select
  to authenticated
  using (true);

create index if not exists analytics_installations_last_seen_idx
  on public.analytics_installations (last_seen_at desc);

-- Backfill from existing events (if any).
insert into public.analytics_installations (
  installation_id,
  first_seen_at,
  last_seen_at,
  platform,
  app_version,
  locale
)
select
  e.installation_id,
  min(e.created_at),
  max(e.created_at),
  (array_agg(e.platform order by e.created_at desc))[1],
  (array_agg(e.app_version order by e.created_at desc))[1],
  (array_agg(e.locale order by e.created_at desc))[1]
from public.analytics_events e
where char_length(e.installation_id) between 8 and 80
group by e.installation_id
on conflict (installation_id) do update
  set
    first_seen_at = least(public.analytics_installations.first_seen_at, excluded.first_seen_at),
    last_seen_at = greatest(public.analytics_installations.last_seen_at, excluded.last_seen_at),
    platform = coalesce(excluded.platform, public.analytics_installations.platform),
    app_version = coalesce(excluded.app_version, public.analytics_installations.app_version),
    locale = coalesce(excluded.locale, public.analytics_installations.locale);
