-- Store download and install days from RuStore, App Store Connect, and Google Play reports.
-- Run in Supabase SQL Editor. Safe to re-run.

create table if not exists public.store_download_days (
  store text not null,
  day date not null,
  downloads integer not null default 0 check (downloads >= 0),
  updates integer not null default 0 check (updates >= 0),
  uninstalls integer not null default 0 check (uninstalls >= 0),
  current_user_installs integer check (current_user_installs is null or current_user_installs >= 0),
  active_device_installs integer check (active_device_installs is null or active_device_installs >= 0),
  source text not null default 'csv',
  fetched_at timestamptz not null default now(),
  primary key (store, day)
);

alter table public.store_download_days
  add column if not exists uninstalls integer not null default 0 check (uninstalls >= 0),
  add column if not exists current_user_installs integer check (current_user_installs is null or current_user_installs >= 0),
  add column if not exists active_device_installs integer check (active_device_installs is null or active_device_installs >= 0);

alter table public.store_download_days
  drop constraint if exists store_download_days_store_check;
alter table public.store_download_days
  add constraint store_download_days_store_check
  check (store in ('rustore', 'appstore', 'googleplay'));

create table if not exists public.store_download_meta (
  key text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.store_download_days enable row level security;
alter table public.store_download_meta enable row level security;

drop policy if exists "authenticated read store download days" on public.store_download_days;
create policy "authenticated read store download days"
  on public.store_download_days
  for select
  to authenticated
  using (true);

drop policy if exists "authenticated read store download meta" on public.store_download_meta;
create policy "authenticated read store download meta"
  on public.store_download_meta
  for select
  to authenticated
  using (true);

create index if not exists store_download_days_day_idx
  on public.store_download_days (day desc);
