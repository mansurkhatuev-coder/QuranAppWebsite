-- Supabase schema for future admin publish flow (not required for MVP download workflow).

create table if not exists public.dua_items (
  id text primary key,
  category text not null check (category in ('support_dua', 'general_dua')),
  title text not null,
  nav_title text,
  text text not null,
  translation text,
  transliteration text,
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

alter table public.dua_items enable row level security;
alter table public.app_release enable row level security;

-- Public read for published JSON export (optional, via service role in Edge Function).
create policy "public read published dua"
  on public.dua_items
  for select
  using (status = 'published');

create policy "public read app release"
  on public.app_release
  for select
  using (true);

-- Authenticated admin user can write (single login MVP).
create policy "authenticated manage dua"
  on public.dua_items
  for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated manage release"
  on public.app_release
  for all
  to authenticated
  using (true)
  with check (true);
