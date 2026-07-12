-- Academy course feedback from the mobile app (stars + comment).

create table if not exists public.academy_course_feedback (
  id uuid primary key default gen_random_uuid(),
  course_id text not null check (course_id in ('tajweed', 'names99')),
  lesson_id text,
  rating integer not null check (rating between 1 and 5),
  comment text,
  locale text,
  app_version text,
  platform text,
  created_at timestamptz not null default now()
);

alter table public.academy_course_feedback enable row level security;

drop policy if exists "public insert academy feedback" on public.academy_course_feedback;
drop policy if exists "authenticated read academy feedback" on public.academy_course_feedback;

create policy "public insert academy feedback"
  on public.academy_course_feedback
  for insert
  to anon, authenticated
  with check (true);

create policy "authenticated read academy feedback"
  on public.academy_course_feedback
  for select
  to authenticated
  using (true);

create index if not exists academy_course_feedback_created_idx
  on public.academy_course_feedback (created_at desc);

create index if not exists academy_course_feedback_course_idx
  on public.academy_course_feedback (course_id, created_at desc);
