-- Product analytics events from the mobile app (anonymous, allowlisted names).
-- Run in Supabase SQL Editor. Safe to re-run.

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
  on public.analytics_events
  for insert
  to anon, authenticated
  with check (true);

create policy "authenticated read analytics events"
  on public.analytics_events
  for select
  to authenticated
  using (true);

create index if not exists analytics_events_created_idx
  on public.analytics_events (created_at desc);

create index if not exists analytics_events_event_created_idx
  on public.analytics_events (event, created_at desc);
