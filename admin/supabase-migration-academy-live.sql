-- Academy live lessons (madrasah): schema for web-first MVP.
-- Run in Supabase SQL Editor after core admin schema.
-- See docs/academy-live-lessons-plan.md

-- ---------------------------------------------------------------------------
-- Orgs / teachers (multi-teacher from day one; org UI later)
-- ---------------------------------------------------------------------------

create table if not exists public.academy_orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.academy_org_members (
  org_id uuid not null references public.academy_orgs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('org_admin', 'teacher')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table if not exists public.academy_teachers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  org_id uuid references public.academy_orgs (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Lessons / questions (options live in payload jsonb for extensible types)
-- ---------------------------------------------------------------------------

create table if not exists public.academy_lessons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid references public.academy_orgs (id) on delete set null,
  title text not null,
  subject text not null default 'other',
  level text not null default 'beginner'
    check (level in ('beginner', 'intermediate', 'advanced')),
  description text not null default '',
  is_favorite boolean not null default false,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.academy_lesson_teachers (
  lesson_id uuid not null references public.academy_lessons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (lesson_id, user_id)
);

create table if not exists public.academy_questions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.academy_lessons (id) on delete cascade,
  type text not null,
  prompt text not null default '',
  prompt_media jsonb,
  payload jsonb not null default '{}'::jsonb,
  scoring jsonb not null default '{"method":"auto","points":1}'::jsonb,
  position integer not null default 0,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_questions_type_nonempty check (length(trim(type)) > 0)
);

create index if not exists academy_questions_lesson_pos_idx
  on public.academy_questions (lesson_id, position);

create index if not exists academy_lessons_owner_idx
  on public.academy_lessons (owner_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- Live sessions
-- ---------------------------------------------------------------------------

create table if not exists public.academy_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.academy_orgs (id) on delete set null,
  lesson_id uuid not null references public.academy_lessons (id) on delete restrict,
  host_user_id uuid not null references auth.users (id) on delete cascade,
  code text not null,
  status text not null default 'lobby'
    check (status in ('lobby', 'live', 'paused', 'finished', 'abandoned')),
  phase text not null default 'lobby'
    check (phase in ('lobby', 'answering', 'reveal', 'results')),
  pacing text not null default 'live'
    check (pacing in ('live', 'async')),
  settings jsonb not null default '{}'::jsonb,
  current_index integer not null default 0,
  question_snapshot jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  phase_ends_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint academy_sessions_code_format check (code ~ '^[0-9]{4,8}$')
);

create unique index if not exists academy_sessions_active_code_uidx
  on public.academy_sessions (code)
  where status in ('lobby', 'live', 'paused');

create index if not exists academy_sessions_host_status_idx
  on public.academy_sessions (host_user_id, status, last_activity_at desc);

create index if not exists academy_sessions_lesson_idx
  on public.academy_sessions (lesson_id, created_at desc);

create table if not exists public.academy_session_hosts (
  session_id uuid not null references public.academy_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table if not exists public.academy_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.academy_sessions (id) on delete cascade,
  display_name text not null,
  user_id uuid references auth.users (id) on delete set null,
  resume_token_hash text not null,
  client_fingerprint text,
  status text not null default 'active'
    check (status in ('active', 'left', 'kicked')),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint academy_participants_name_nonempty check (length(trim(display_name)) > 0)
);

create index if not exists academy_participants_session_idx
  on public.academy_participants (session_id, joined_at);

create unique index if not exists academy_participants_resume_hash_uidx
  on public.academy_participants (resume_token_hash);

create table if not exists public.academy_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.academy_sessions (id) on delete cascade,
  participant_id uuid not null references public.academy_participants (id) on delete cascade,
  question_index integer not null,
  question_id text,
  answer_payload jsonb not null default '{}'::jsonb,
  is_correct boolean,
  score numeric(8, 2),
  scored_at timestamptz,
  scored_by text,
  created_at timestamptz not null default now(),
  unique (participant_id, question_index)
);

create index if not exists academy_answers_session_idx
  on public.academy_answers (session_id, question_index);

-- ---------------------------------------------------------------------------
-- Helpers (security definer for RLS)
-- ---------------------------------------------------------------------------

create or replace function public.is_academy_teacher(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.academy_teachers t
    where t.user_id = uid
      and t.is_active = true
  );
$$;

revoke all on function public.is_academy_teacher(uuid) from public;
grant execute on function public.is_academy_teacher(uuid) to authenticated, anon;

create or replace function public.can_manage_academy_lesson(p_lesson_id uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.academy_lessons l
    where l.id = p_lesson_id
      and l.owner_id = uid
  )
  or exists (
    select 1
    from public.academy_lesson_teachers lt
    where lt.lesson_id = p_lesson_id
      and lt.user_id = uid
      and lt.role in ('owner', 'editor')
  );
$$;

revoke all on function public.can_manage_academy_lesson(uuid, uuid) from public;
grant execute on function public.can_manage_academy_lesson(uuid, uuid) to authenticated;

create or replace function public.can_host_academy_session(p_session_id uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.academy_sessions s
    where s.id = p_session_id
      and s.host_user_id = uid
  )
  or exists (
    select 1
    from public.academy_session_hosts h
    where h.session_id = p_session_id
      and h.user_id = uid
  );
$$;

revoke all on function public.can_host_academy_session(uuid, uuid) from public;
grant execute on function public.can_host_academy_session(uuid, uuid) to authenticated;

create or replace function public.touch_academy_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists academy_teachers_touch on public.academy_teachers;
create trigger academy_teachers_touch
  before update on public.academy_teachers
  for each row execute function public.touch_academy_updated_at();

drop trigger if exists academy_lessons_touch on public.academy_lessons;
create trigger academy_lessons_touch
  before update on public.academy_lessons
  for each row execute function public.touch_academy_updated_at();

drop trigger if exists academy_questions_touch on public.academy_questions;
create trigger academy_questions_touch
  before update on public.academy_questions
  for each row execute function public.touch_academy_updated_at();

-- When a lesson is created, register owner in lesson_teachers.
create or replace function public.academy_lesson_owner_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.academy_lesson_teachers (lesson_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (lesson_id, user_id) do update set role = excluded.role;
  return new;
end;
$$;

drop trigger if exists academy_lessons_owner_sync on public.academy_lessons;
create trigger academy_lessons_owner_sync
  after insert on public.academy_lessons
  for each row execute function public.academy_lesson_owner_sync();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.academy_orgs enable row level security;
alter table public.academy_org_members enable row level security;
alter table public.academy_teachers enable row level security;
alter table public.academy_lessons enable row level security;
alter table public.academy_lesson_teachers enable row level security;
alter table public.academy_questions enable row level security;
alter table public.academy_sessions enable row level security;
alter table public.academy_session_hosts enable row level security;
alter table public.academy_participants enable row level security;
alter table public.academy_answers enable row level security;

-- Teachers: read own profile row
drop policy if exists "teachers read self" on public.academy_teachers;
create policy "teachers read self"
  on public.academy_teachers
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_academy_teacher());

drop policy if exists "teachers update self" on public.academy_teachers;
create policy "teachers update self"
  on public.academy_teachers
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Orgs: members can read their org (stubs)
drop policy if exists "org members read org" on public.academy_orgs;
create policy "org members read org"
  on public.academy_orgs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.academy_org_members m
      where m.org_id = academy_orgs.id and m.user_id = auth.uid()
    )
  );

drop policy if exists "org members read membership" on public.academy_org_members;
create policy "org members read membership"
  on public.academy_org_members
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_academy_teacher());

-- Lessons
drop policy if exists "teachers read manage lessons" on public.academy_lessons;
create policy "teachers read manage lessons"
  on public.academy_lessons
  for select
  to authenticated
  using (
    public.is_academy_teacher()
    and (
      owner_id = auth.uid()
      or exists (
        select 1 from public.academy_lesson_teachers lt
        where lt.lesson_id = academy_lessons.id and lt.user_id = auth.uid()
      )
    )
  );

drop policy if exists "teachers insert lessons" on public.academy_lessons;
create policy "teachers insert lessons"
  on public.academy_lessons
  for insert
  to authenticated
  with check (public.is_academy_teacher() and owner_id = auth.uid());

drop policy if exists "teachers update lessons" on public.academy_lessons;
create policy "teachers update lessons"
  on public.academy_lessons
  for update
  to authenticated
  using (public.can_manage_academy_lesson(id))
  with check (public.can_manage_academy_lesson(id));

drop policy if exists "teachers delete lessons" on public.academy_lessons;
create policy "teachers delete lessons"
  on public.academy_lessons
  for delete
  to authenticated
  using (owner_id = auth.uid());

-- Lesson teachers
drop policy if exists "lesson teachers read" on public.academy_lesson_teachers;
create policy "lesson teachers read"
  on public.academy_lesson_teachers
  for select
  to authenticated
  using (public.can_manage_academy_lesson(lesson_id) or user_id = auth.uid());

drop policy if exists "lesson owners manage collab" on public.academy_lesson_teachers;
create policy "lesson owners manage collab"
  on public.academy_lesson_teachers
  for all
  to authenticated
  using (
    exists (
      select 1 from public.academy_lessons l
      where l.id = lesson_id and l.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.academy_lessons l
      where l.id = lesson_id and l.owner_id = auth.uid()
    )
  );

-- Questions
drop policy if exists "teachers read questions" on public.academy_questions;
create policy "teachers read questions"
  on public.academy_questions
  for select
  to authenticated
  using (public.can_manage_academy_lesson(lesson_id));

drop policy if exists "teachers write questions" on public.academy_questions;
create policy "teachers write questions"
  on public.academy_questions
  for all
  to authenticated
  using (public.can_manage_academy_lesson(lesson_id))
  with check (public.can_manage_academy_lesson(lesson_id));

-- Sessions: hosts can read; writes go through Edge Functions (service role) later.
-- Teachers may insert a session shell for local testing of schema; live control still via functions.
drop policy if exists "hosts read sessions" on public.academy_sessions;
create policy "hosts read sessions"
  on public.academy_sessions
  for select
  to authenticated
  using (public.can_host_academy_session(id) or host_user_id = auth.uid());

drop policy if exists "teachers insert sessions" on public.academy_sessions;
create policy "teachers insert sessions"
  on public.academy_sessions
  for insert
  to authenticated
  with check (
    public.is_academy_teacher()
    and host_user_id = auth.uid()
    and public.can_manage_academy_lesson(lesson_id)
  );

drop policy if exists "hosts update sessions" on public.academy_sessions;
create policy "hosts update sessions"
  on public.academy_sessions
  for update
  to authenticated
  using (public.can_host_academy_session(id))
  with check (public.can_host_academy_session(id));

drop policy if exists "hosts read session hosts" on public.academy_session_hosts;
create policy "hosts read session hosts"
  on public.academy_session_hosts
  for select
  to authenticated
  using (public.can_host_academy_session(session_id));

drop policy if exists "primary host manage cohosts" on public.academy_session_hosts;
create policy "primary host manage cohosts"
  on public.academy_session_hosts
  for all
  to authenticated
  using (
    exists (
      select 1 from public.academy_sessions s
      where s.id = session_id and s.host_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.academy_sessions s
      where s.id = session_id and s.host_user_id = auth.uid()
    )
  );

-- Participants / answers: no anon policies.
-- Join/resume/submit will use Edge Functions with service role.
-- Hosts can read for teacher dashboard (counts / reports).
drop policy if exists "hosts read participants" on public.academy_participants;
create policy "hosts read participants"
  on public.academy_participants
  for select
  to authenticated
  using (public.can_host_academy_session(session_id));

drop policy if exists "hosts read answers" on public.academy_answers;
create policy "hosts read answers"
  on public.academy_answers
  for select
  to authenticated
  using (public.can_host_academy_session(session_id));

-- ---------------------------------------------------------------------------
-- Bootstrap note:
-- After creating an Auth user, insert them as teacher, e.g.:
--   insert into public.academy_teachers (user_id, display_name)
--   values ('<auth-user-uuid>', 'Учитель')
--   on conflict (user_id) do update set is_active = true;
-- ---------------------------------------------------------------------------
