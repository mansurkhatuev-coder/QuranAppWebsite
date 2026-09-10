-- Academy public async hubs (homework sets): additive schema.
-- Does NOT drop tables or delete rows. Live sessions untouched.
-- Apply via workflow apply-academy-public-async.yml or
--   scripts/apply-academy-live-migration.sh admin/supabase-migration-academy-public-async.sql

-- ---------------------------------------------------------------------------
-- Students (separate role from teachers; same auth.users, separate table/UI)
-- ---------------------------------------------------------------------------

create table if not exists public.academy_students (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists academy_students_active_idx
  on public.academy_students (is_active, updated_at desc);

-- ---------------------------------------------------------------------------
-- Public hubs = published lesson sets with one share token
-- ---------------------------------------------------------------------------

create table if not exists public.academy_public_hubs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Домашние задания',
  token text not null,
  is_open boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_public_hubs_token_format check (token ~ '^[a-zA-Z0-9_-]{8,64}$'),
  constraint academy_public_hubs_title_nonempty check (length(trim(title)) > 0)
);

create unique index if not exists academy_public_hubs_token_uidx
  on public.academy_public_hubs (token);

create index if not exists academy_public_hubs_owner_idx
  on public.academy_public_hubs (owner_id, updated_at desc);

create table if not exists public.academy_public_hub_lessons (
  hub_id uuid not null references public.academy_public_hubs (id) on delete cascade,
  lesson_id uuid not null references public.academy_lessons (id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (hub_id, lesson_id)
);

create index if not exists academy_public_hub_lessons_lesson_idx
  on public.academy_public_hub_lessons (lesson_id);

-- Link async runs to hub (nullable; live sessions stay null)
alter table public.academy_sessions
  add column if not exists hub_id uuid references public.academy_public_hubs (id) on delete set null;

create index if not exists academy_sessions_hub_idx
  on public.academy_sessions (hub_id, created_at desc)
  where hub_id is not null;

create index if not exists academy_sessions_pacing_status_idx
  on public.academy_sessions (pacing, status, last_activity_at desc);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_academy_student(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.academy_students s
    where s.user_id = uid
      and s.is_active = true
  );
$$;

revoke all on function public.is_academy_student(uuid) from public;
grant execute on function public.is_academy_student(uuid) to authenticated, anon;

create or replace function public.can_manage_academy_hub(p_hub_id uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.academy_public_hubs h
    where h.id = p_hub_id
      and h.owner_id = uid
  );
$$;

revoke all on function public.can_manage_academy_hub(uuid, uuid) from public;
grant execute on function public.can_manage_academy_hub(uuid, uuid) to authenticated;

drop trigger if exists academy_students_touch on public.academy_students;
create trigger academy_students_touch
  before update on public.academy_students
  for each row execute function public.touch_academy_updated_at();

drop trigger if exists academy_public_hubs_touch on public.academy_public_hubs;
create trigger academy_public_hubs_touch
  before update on public.academy_public_hubs
  for each row execute function public.touch_academy_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.academy_students enable row level security;
alter table public.academy_public_hubs enable row level security;
alter table public.academy_public_hub_lessons enable row level security;

drop policy if exists "students read self" on public.academy_students;
create policy "students read self"
  on public.academy_students
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "students update self" on public.academy_students;
create policy "students update self"
  on public.academy_students
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Inserts go through Edge Function (service role) via ensure_student.
-- Teachers manage hubs they own.
drop policy if exists "teachers read own hubs" on public.academy_public_hubs;
create policy "teachers read own hubs"
  on public.academy_public_hubs
  for select
  to authenticated
  using (owner_id = auth.uid() and public.is_academy_teacher());

drop policy if exists "teachers insert hubs" on public.academy_public_hubs;
create policy "teachers insert hubs"
  on public.academy_public_hubs
  for insert
  to authenticated
  with check (owner_id = auth.uid() and public.is_academy_teacher());

drop policy if exists "teachers update own hubs" on public.academy_public_hubs;
create policy "teachers update own hubs"
  on public.academy_public_hubs
  for update
  to authenticated
  using (owner_id = auth.uid() and public.is_academy_teacher())
  with check (owner_id = auth.uid() and public.is_academy_teacher());

drop policy if exists "teachers delete own hubs" on public.academy_public_hubs;
create policy "teachers delete own hubs"
  on public.academy_public_hubs
  for delete
  to authenticated
  using (owner_id = auth.uid() and public.is_academy_teacher());

drop policy if exists "teachers read hub lessons" on public.academy_public_hub_lessons;
create policy "teachers read hub lessons"
  on public.academy_public_hub_lessons
  for select
  to authenticated
  using (public.can_manage_academy_hub(hub_id));

drop policy if exists "teachers write hub lessons" on public.academy_public_hub_lessons;
create policy "teachers write hub lessons"
  on public.academy_public_hub_lessons
  for all
  to authenticated
  using (public.can_manage_academy_hub(hub_id))
  with check (public.can_manage_academy_hub(hub_id));

-- Hosts already read sessions via can_host; hub_id sessions use host_user_id = teacher.
