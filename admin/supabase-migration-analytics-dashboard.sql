-- Product analytics dashboard (reliable KPIs + daily series).
-- Safe to re-run. Bootstraps analytics_events if missing.

-- ── Events table (prerequisite) ─────────────────────────────────────────────
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event text not null
    check (
      char_length(event) between 1 and 64
      and event in (
        'app_open',
        'academy_hub_open',
        'academy_lesson_completed',
        'azkar_item_completed',
        'tasbih_milestone'
      )
    ),
  props jsonb not null default '{}'::jsonb,
  installation_id text not null check (char_length(installation_id) between 8 and 80),
  app_version text,
  platform text,
  locale text,
  created_at timestamptz not null default now()
);

alter table public.analytics_events enable row level security;

drop policy if exists "public insert analytics events" on public.analytics_events;
drop policy if exists "authenticated read analytics events" on public.analytics_events;

create policy "public insert analytics events"
  on public.analytics_events for insert to anon, authenticated with check (true);
create policy "authenticated read analytics events"
  on public.analytics_events for select to authenticated using (true);

-- ── Installations registry (ensure) ─────────────────────────────────────────
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
  on public.analytics_installations for insert to anon, authenticated with check (true);
create policy "public update analytics installations"
  on public.analytics_installations for update to anon, authenticated using (true) with check (true);
create policy "authenticated read analytics installations"
  on public.analytics_installations for select to authenticated using (true);

create index if not exists analytics_installations_last_seen_idx
  on public.analytics_installations (last_seen_at desc);
create index if not exists analytics_installations_first_seen_idx
  on public.analytics_installations (first_seen_at desc);
create index if not exists analytics_events_installation_idx
  on public.analytics_events (installation_id);
create index if not exists analytics_events_created_idx
  on public.analytics_events (created_at desc);
create index if not exists analytics_events_event_created_idx
  on public.analytics_events (event, created_at desc);

-- ── Keep registry in sync on every event ────────────────────────────────────
create or replace function public.analytics_events_upsert_installation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.installation_id is null or char_length(new.installation_id) < 8 then
    return new;
  end if;
  insert into public.analytics_installations (
    installation_id, first_seen_at, last_seen_at, platform, app_version, locale
  ) values (
    new.installation_id, new.created_at, new.created_at, new.platform, new.app_version, new.locale
  )
  on conflict (installation_id) do update set
    last_seen_at = greatest(public.analytics_installations.last_seen_at, excluded.last_seen_at),
    first_seen_at = least(public.analytics_installations.first_seen_at, excluded.first_seen_at),
    platform = coalesce(excluded.platform, public.analytics_installations.platform),
    app_version = coalesce(excluded.app_version, public.analytics_installations.app_version),
    locale = coalesce(excluded.locale, public.analytics_installations.locale);
  return new;
end;
$$;

drop trigger if exists analytics_events_upsert_installation_trg on public.analytics_events;
create trigger analytics_events_upsert_installation_trg
  after insert on public.analytics_events
  for each row execute function public.analytics_events_upsert_installation();

-- Backfill registry once from all events.
insert into public.analytics_installations (
  installation_id, first_seen_at, last_seen_at, platform, app_version, locale
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
on conflict (installation_id) do update set
  first_seen_at = least(public.analytics_installations.first_seen_at, excluded.first_seen_at),
  last_seen_at = greatest(public.analytics_installations.last_seen_at, excluded.last_seen_at),
  platform = coalesce(excluded.platform, public.analytics_installations.platform),
  app_version = coalesce(excluded.app_version, public.analytics_installations.app_version),
  locale = coalesce(excluded.locale, public.analytics_installations.locale);

-- ── Daily rollup ────────────────────────────────────────────────────────────
create table if not exists public.analytics_daily (
  day date primary key,
  active_installs integer not null default 0 check (active_installs >= 0),
  new_installs integer not null default 0 check (new_installs >= 0),
  events_total integer not null default 0 check (events_total >= 0),
  app_open integer not null default 0 check (app_open >= 0),
  academy_hub_open integer not null default 0 check (academy_hub_open >= 0),
  academy_lesson_completed integer not null default 0 check (academy_lesson_completed >= 0),
  azkar_item_completed integer not null default 0 check (azkar_item_completed >= 0),
  tasbih_milestone integer not null default 0 check (tasbih_milestone >= 0),
  updated_at timestamptz not null default now()
);

alter table public.analytics_daily enable row level security;

drop policy if exists "authenticated read analytics daily" on public.analytics_daily;
create policy "authenticated read analytics daily"
  on public.analytics_daily for select to authenticated using (true);

create or replace function public.refresh_analytics_daily(
  p_day date default ((timezone('utc', now()))::date)
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from timestamptz := p_day::timestamptz;
  v_to timestamptz := (p_day + 1)::timestamptz;
begin
  insert into public.analytics_daily as d (
    day, active_installs, new_installs, events_total,
    app_open, academy_hub_open, academy_lesson_completed,
    azkar_item_completed, tasbih_milestone, updated_at
  )
  select
    p_day,
    (select count(distinct installation_id)::integer
       from public.analytics_events
      where created_at >= v_from and created_at < v_to),
    (select count(*)::integer
       from public.analytics_installations
      where first_seen_at >= v_from and first_seen_at < v_to),
    (select count(*)::integer
       from public.analytics_events
      where created_at >= v_from and created_at < v_to),
    (select count(*)::integer from public.analytics_events
      where created_at >= v_from and created_at < v_to and event = 'app_open'),
    (select count(*)::integer from public.analytics_events
      where created_at >= v_from and created_at < v_to and event = 'academy_hub_open'),
    (select count(*)::integer from public.analytics_events
      where created_at >= v_from and created_at < v_to and event = 'academy_lesson_completed'),
    (select count(*)::integer from public.analytics_events
      where created_at >= v_from and created_at < v_to and event = 'azkar_item_completed'),
    (select count(*)::integer from public.analytics_events
      where created_at >= v_from and created_at < v_to and event = 'tasbih_milestone'),
    now()
  on conflict (day) do update set
    active_installs = excluded.active_installs,
    new_installs = excluded.new_installs,
    events_total = excluded.events_total,
    app_open = excluded.app_open,
    academy_hub_open = excluded.academy_hub_open,
    academy_lesson_completed = excluded.academy_lesson_completed,
    azkar_item_completed = excluded.azkar_item_completed,
    tasbih_milestone = excluded.tasbih_milestone,
    updated_at = now();
end;
$$;

revoke all on function public.refresh_analytics_daily(date) from public;
grant execute on function public.refresh_analytics_daily(date) to authenticated;

create or replace function public.refresh_analytics_daily_range(
  p_from date,
  p_to date default ((timezone('utc', now()))::date)
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  d date;
  n integer := 0;
begin
  if p_from is null or p_to is null or p_from > p_to then
    return 0;
  end if;
  d := p_from;
  while d <= p_to loop
    perform public.refresh_analytics_daily(d);
    n := n + 1;
    d := d + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.refresh_analytics_daily_range(date, date) from public;
grant execute on function public.refresh_analytics_daily_range(date, date) to authenticated;

-- Backfill last 90 days of daily rollups (idempotent).
select public.refresh_analytics_daily_range(
  ((timezone('utc', now()))::date - 89),
  ((timezone('utc', now()))::date)
);

-- ── Dashboard RPC (full-table, not last-5000) ───────────────────────────────
create or replace function public.analytics_dashboard(p_days integer default 7)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_days integer := greatest(coalesce(p_days, 7), 0);
  v_now timestamptz := timezone('utc', now());
  v_from timestamptz;
  v_prev_from timestamptz;
  v_prev_to timestamptz;
  v_series_from date;
  v_period jsonb;
  v_prev jsonb;
  v_series jsonb;
  v_platforms jsonb;
  v_all_time bigint;
begin
  -- Keep today fresh for sparklines.
  perform public.refresh_analytics_daily((v_now)::date);
  perform public.refresh_analytics_daily(((v_now)::date - 1));

  if v_days = 0 then
    v_from := timestamptz '1970-01-01 00:00:00+00';
    v_prev_from := v_from;
    v_prev_to := v_from;
  else
    v_from := v_now - make_interval(days => v_days);
    v_prev_to := v_from;
    v_prev_from := v_from - make_interval(days => v_days);
  end if;

  v_series_from := (v_now)::date - 29;

  select greatest(
    (select count(*)::bigint from public.analytics_installations),
    (select count(distinct installation_id)::bigint
       from public.analytics_events
      where char_length(installation_id) between 8 and 80)
  ) into v_all_time;

  select jsonb_build_object(
    'active', (select count(*)::int from public.analytics_installations where last_seen_at >= v_from),
    'new_installs', (select count(*)::int from public.analytics_installations where first_seen_at >= v_from),
    'events', (select count(*)::int from public.analytics_events where created_at >= v_from),
    'app_open', (select count(*)::int from public.analytics_events where created_at >= v_from and event = 'app_open'),
    'academy_hub_open', (select count(*)::int from public.analytics_events where created_at >= v_from and event = 'academy_hub_open'),
    'lessons', (select count(*)::int from public.analytics_events where created_at >= v_from and event = 'academy_lesson_completed'),
    'azkar', (select count(*)::int from public.analytics_events where created_at >= v_from and event = 'azkar_item_completed'),
    'azkar_users', (select count(distinct installation_id)::int from public.analytics_events where created_at >= v_from and event = 'azkar_item_completed'),
    'lesson_users', (select count(distinct installation_id)::int from public.analytics_events where created_at >= v_from and event = 'academy_lesson_completed'),
    'tasbih', (select count(*)::int from public.analytics_events where created_at >= v_from and event = 'tasbih_milestone')
  ) into v_period;

  if v_days = 0 then
    v_prev := v_period;
  else
    select jsonb_build_object(
      'active', (select count(*)::int from public.analytics_installations where last_seen_at >= v_prev_from and last_seen_at < v_prev_to),
      'new_installs', (select count(*)::int from public.analytics_installations where first_seen_at >= v_prev_from and first_seen_at < v_prev_to),
      'events', (select count(*)::int from public.analytics_events where created_at >= v_prev_from and created_at < v_prev_to),
      'app_open', (select count(*)::int from public.analytics_events where created_at >= v_prev_from and created_at < v_prev_to and event = 'app_open'),
      'lessons', (select count(*)::int from public.analytics_events where created_at >= v_prev_from and created_at < v_prev_to and event = 'academy_lesson_completed'),
      'azkar', (select count(*)::int from public.analytics_events where created_at >= v_prev_from and created_at < v_prev_to and event = 'azkar_item_completed'),
      'azkar_users', (select count(distinct installation_id)::int from public.analytics_events where created_at >= v_prev_from and created_at < v_prev_to and event = 'azkar_item_completed'),
      'lesson_users', (select count(distinct installation_id)::int from public.analytics_events where created_at >= v_prev_from and created_at < v_prev_to and event = 'academy_lesson_completed'),
      'tasbih', (select count(*)::int from public.analytics_events where created_at >= v_prev_from and created_at < v_prev_to and event = 'tasbih_milestone')
    ) into v_prev;
  end if;

  select coalesce(jsonb_agg(row_to_json(s)::jsonb order by s.day), '[]'::jsonb)
  into v_series
  from (
    select
      d.day::text as day,
      d.active_installs,
      d.new_installs,
      d.events_total,
      d.app_open,
      d.azkar_item_completed as azkar,
      d.academy_lesson_completed as lessons
    from public.analytics_daily d
    where d.day >= v_series_from
    order by d.day
  ) s;

  select coalesce(jsonb_agg(jsonb_build_object('platform', p.platform, 'count', p.cnt) order by p.cnt desc), '[]'::jsonb)
  into v_platforms
  from (
    select coalesce(nullif(platform, ''), '—') as platform, count(*)::int as cnt
    from public.analytics_installations
    where last_seen_at >= v_from
    group by 1
    order by 2 desc
    limit 8
  ) p;

  return jsonb_build_object(
    'ok', true,
    'days', v_days,
    'generated_at', v_now,
    'all_time_installs', v_all_time,
    'period', v_period,
    'previous', v_prev,
    'series', v_series,
    'platforms', v_platforms,
    'source', 'analytics_dashboard'
  );
end;
$$;

revoke all on function public.analytics_dashboard(integer) from public;
grant execute on function public.analytics_dashboard(integer) to authenticated;

-- Keep legacy all-time helper in sync.
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
