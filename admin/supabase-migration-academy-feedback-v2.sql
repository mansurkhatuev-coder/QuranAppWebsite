-- v2: optional name, stable client id for updates, updated_at.

alter table public.academy_course_feedback
  add column if not exists client_id text,
  add column if not exists display_name text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists academy_course_feedback_course_client_uidx
  on public.academy_course_feedback (course_id, client_id)
  where client_id is not null;

drop policy if exists "anon update academy feedback" on public.academy_course_feedback;

create policy "anon update academy feedback"
  on public.academy_course_feedback
  for update
  to anon, authenticated
  using (client_id is not null)
  with check (client_id is not null);

notify pgrst, 'reload schema';
