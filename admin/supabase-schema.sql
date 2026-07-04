-- Supabase schema for Waydean admin (dua + app release + manifest metadata).

create table if not exists public.dua_items (
  id text primary key,
  category text not null check (category in ('support_dua', 'general_dua')),
  title text not null,
  nav_title text,
  text text not null,
  translation text,
  transliteration text,
  translation_chechen text,
  extra_translations jsonb not null default '[]'::jsonb,
  target_count integer not null default 3,
  audio jsonb not null default '[]'::jsonb,
  "group" text,
  authenticity text not null,
  source jsonb,
  benefit_hadith jsonb,
  tags text[] not null default '{}',
  importance text,
  placement_fit text,
  status text not null default 'published',
  updated_at timestamptz not null default now()
);

create table if not exists public.app_release (
  id integer primary key default 1 check (id = 1),
  android jsonb not null default '{}'::jsonb,
  ios jsonb not null default '{}'::jsonb,
  message_ru text,
  message_en text,
  updated_at timestamptz not null default now()
);

create table if not exists public.content_manifest (
  id integer primary key default 1 check (id = 1),
  remote_dua jsonb not null default '{}'::jsonb,
  app_release jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  published_by text,
  updated_at timestamptz not null default now()
);

alter table public.dua_items enable row level security;
alter table public.app_release enable row level security;
alter table public.content_manifest enable row level security;

drop policy if exists "public read published dua" on public.dua_items;
drop policy if exists "authenticated manage dua" on public.dua_items;
drop policy if exists "public read app release" on public.app_release;
drop policy if exists "authenticated manage release" on public.app_release;
drop policy if exists "authenticated read manifest" on public.content_manifest;
drop policy if exists "authenticated manage manifest" on public.content_manifest;

create policy "public read published dua"
  on public.dua_items
  for select
  using (status = 'published');

create policy "authenticated manage dua"
  on public.dua_items
  for all
  to authenticated
  using (true)
  with check (true);

create policy "public read app release"
  on public.app_release
  for select
  using (true);

create policy "authenticated manage release"
  on public.app_release
  for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated read manifest"
  on public.content_manifest
  for select
  to authenticated
  using (true);

create policy "authenticated manage manifest"
  on public.content_manifest
  for all
  to authenticated
  using (true)
  with check (true);

create index if not exists dua_items_category_idx on public.dua_items (category);
create index if not exists dua_items_status_idx on public.dua_items (status);
