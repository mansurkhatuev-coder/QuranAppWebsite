-- Azkar / dua tajweed transliteration draft (single JSON library snapshot).
-- Add the owner's auth.users.id to azkar_tajweed_admins with the SQL editor
-- before enabling cloud save/publish. No client may grant itself this role.

create table if not exists public.azkar_tajweed_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.azkar_tajweed_admins enable row level security;

drop policy if exists "read own azkar tajweed admin role" on public.azkar_tajweed_admins;
create policy "read own azkar tajweed admin role"
  on public.azkar_tajweed_admins
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create table if not exists public.azkar_tajweed_draft (
  id integer primary key default 1 check (id = 1),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.azkar_tajweed_draft enable row level security;

drop policy if exists "authenticated read azkar tajweed draft" on public.azkar_tajweed_draft;
drop policy if exists "authenticated manage azkar tajweed draft" on public.azkar_tajweed_draft;

create policy "authenticated read azkar tajweed draft"
  on public.azkar_tajweed_draft
  for select
  to authenticated
  using (exists (select 1 from public.azkar_tajweed_admins where user_id = (select auth.uid())));

create policy "authenticated manage azkar tajweed draft"
  on public.azkar_tajweed_draft
  for all
  to authenticated
  using (exists (select 1 from public.azkar_tajweed_admins where user_id = (select auth.uid())))
  with check (exists (select 1 from public.azkar_tajweed_admins where user_id = (select auth.uid())));

-- Track last published pack alongside dua/home manifests.
alter table public.content_manifest
  add column if not exists remote_azkar_tajweed jsonb not null default '{}'::jsonb;

-- Bootstrap: grant existing Auth users (site admins) the editor role.
-- New users must be inserted manually — clients cannot self-grant.
insert into public.azkar_tajweed_admins (user_id)
select id from auth.users
on conflict (user_id) do nothing;
