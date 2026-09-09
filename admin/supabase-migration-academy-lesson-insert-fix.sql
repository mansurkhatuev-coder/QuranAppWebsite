-- Fix INSERT policy on academy_lessons (RLS violation on save).
-- Also harden owner-sync trigger with row_security off.
-- Additive / safe to re-run. No data deletes.

create or replace function public.academy_lesson_owner_sync()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  insert into public.academy_lesson_teachers (lesson_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (lesson_id, user_id) do update set role = excluded.role;
  return new;
end;
$$;

-- Insert: own row + must exist in academy_teachers (direct exists, no helper recursion).
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

-- Teachers can always read/update their own teacher row (needed for exists above under RLS).
drop policy if exists "teachers read self" on public.academy_teachers;
create policy "teachers read self"
  on public.academy_teachers
  for select
  to authenticated
  using (user_id = auth.uid());
