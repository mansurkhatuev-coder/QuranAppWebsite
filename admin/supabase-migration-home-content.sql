-- Run once in Supabase SQL Editor after initial schema.

create table if not exists public.home_announcements (
  id text primary key,
  title_ru text not null,
  title_en text,
  body_ru text,
  body_en text,
  action_url text,
  action_label_ru text,
  action_label_en text,
  starts_at date,
  ends_at date,
  priority integer not null default 0,
  status text not null default 'published',
  updated_at timestamptz not null default now()
);

create table if not exists public.home_daily_pools (
  id integer primary key default 1 check (id = 1),
  ayah_pool jsonb not null default '[]'::jsonb,
  dua_pool jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.home_announcements enable row level security;
alter table public.home_daily_pools enable row level security;

drop policy if exists "authenticated read announcements" on public.home_announcements;
drop policy if exists "authenticated manage announcements" on public.home_announcements;
drop policy if exists "authenticated read daily pools" on public.home_daily_pools;
drop policy if exists "authenticated manage daily pools" on public.home_daily_pools;

create policy "authenticated read announcements"
  on public.home_announcements
  for select
  to authenticated
  using (true);

create policy "authenticated manage announcements"
  on public.home_announcements
  for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated read daily pools"
  on public.home_daily_pools
  for select
  to authenticated
  using (true);

create policy "authenticated manage daily pools"
  on public.home_daily_pools
  for all
  to authenticated
  using (true)
  with check (true);

alter table public.content_manifest
  add column if not exists remote_home jsonb not null default '{}'::jsonb;
