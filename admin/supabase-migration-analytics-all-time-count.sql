-- Restore truthful «за всё время» installs.
-- 1) Backfill registry from ALL analytics_events (safe to re-run).
-- 2) RPC for exact all-time unique installation count (not the admin's last-5000 window).

create table if not exists public.analytics_installations (
  installation_id text primary key check (char_length(installation_id) between 8 and 80),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  platform text,
  app_version text,
  locale text
);

create index if not exists analytics_events_installation_idx
  on public.analytics_events (installation_id);

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

create or replace function public.analytics_all_time_install_count()
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select greatest(
    (select count(*)::bigint from public.analytics_installations),
    (
      select count(distinct installation_id)::bigint
      from public.analytics_events
      where char_length(installation_id) between 8 and 80
    )
  );
$$;

revoke all on function public.analytics_all_time_install_count() from public;
grant execute on function public.analytics_all_time_install_count() to authenticated;

notify pgrst, 'reload schema';
