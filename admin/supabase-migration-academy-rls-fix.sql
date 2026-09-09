-- Fix infinite RLS recursion on academy_lessons / academy_lesson_teachers / sessions.
-- Additive: no DROP TABLE / DELETE. Safe to re-run.
--
-- Root cause: policies on lessons queried lesson_teachers, whose policies called
-- can_manage_academy_lesson() which re-queried lessons under RLS → recursion.
--
-- Fix: helper functions run with row_security = off; policies call helpers only.

create or replace function public.is_academy_teacher(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.academy_teachers t
    where t.user_id = uid
      and t.is_active = true
  );
$$;

create or replace function public.can_manage_academy_lesson(p_lesson_id uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
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

create or replace function public.is_academy_lesson_owner(p_lesson_id uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.academy_lessons l
    where l.id = p_lesson_id
      and l.owner_id = uid
  );
$$;

create or replace function public.can_host_academy_session(p_session_id uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
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

create or replace function public.is_academy_session_primary_host(p_session_id uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.academy_sessions s
    where s.id = p_session_id
      and s.host_user_id = uid
  );
$$;

revoke all on function public.is_academy_teacher(uuid) from public;
grant execute on function public.is_academy_teacher(uuid) to authenticated, anon;

revoke all on function public.can_manage_academy_lesson(uuid, uuid) from public;
grant execute on function public.can_manage_academy_lesson(uuid, uuid) to authenticated;

revoke all on function public.is_academy_lesson_owner(uuid, uuid) from public;
grant execute on function public.is_academy_lesson_owner(uuid, uuid) to authenticated;

revoke all on function public.can_host_academy_session(uuid, uuid) from public;
grant execute on function public.can_host_academy_session(uuid, uuid) to authenticated;

revoke all on function public.is_academy_session_primary_host(uuid, uuid) from public;
grant execute on function public.is_academy_session_primary_host(uuid, uuid) to authenticated;

-- Lessons: no direct subquery into lesson_teachers (that re-entered RLS).
drop policy if exists "teachers read manage lessons" on public.academy_lessons;
create policy "teachers read manage lessons"
  on public.academy_lessons
  for select
  to authenticated
  using (public.can_manage_academy_lesson(id));

drop policy if exists "teachers insert lessons" on public.academy_lessons;
create policy "teachers insert lessons"
  on public.academy_lessons
  for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.academy_teachers t
      where t.user_id = auth.uid()
        and t.is_active = true
    )
  );

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
  using (public.is_academy_lesson_owner(id));

-- Lesson teachers: avoid selecting lessons under RLS.
drop policy if exists "lesson teachers read" on public.academy_lesson_teachers;
create policy "lesson teachers read"
  on public.academy_lesson_teachers
  for select
  to authenticated
  using (user_id = auth.uid() or public.can_manage_academy_lesson(lesson_id));

drop policy if exists "lesson owners manage collab" on public.academy_lesson_teachers;
create policy "lesson owners manage collab"
  on public.academy_lesson_teachers
  for all
  to authenticated
  using (public.is_academy_lesson_owner(lesson_id))
  with check (public.is_academy_lesson_owner(lesson_id));

-- Questions unchanged in intent; helpers now bypass RLS.
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

-- Sessions / hosts: same pattern.
drop policy if exists "hosts read sessions" on public.academy_sessions;
create policy "hosts read sessions"
  on public.academy_sessions
  for select
  to authenticated
  using (public.can_host_academy_session(id));

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
  using (public.is_academy_session_primary_host(session_id))
  with check (public.is_academy_session_primary_host(session_id));

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
