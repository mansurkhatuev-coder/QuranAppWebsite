-- Daily social learning aggregates for Academy (Sajda-style counters).
-- Safe to re-run. Readable by anon (aggregates only, no PII).

create table if not exists public.analytics_social_daily (
  day date not null,
  course_id text not null,
  unique_learners integer not null default 0 check (unique_learners >= 0),
  lesson_completions integer not null default 0 check (lesson_completions >= 0),
  updated_at timestamptz not null default now(),
  primary key (day, course_id)
);

alter table public.analytics_social_daily enable row level security;

drop policy if exists "public read analytics social daily" on public.analytics_social_daily;
drop policy if exists "authenticated read analytics social daily" on public.analytics_social_daily;

create policy "public read analytics social daily"
  on public.analytics_social_daily
  for select
  to anon, authenticated
  using (true);

create or replace function public.refresh_analytics_social_daily(
  p_day date default ((timezone('utc', now()))::date)
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.analytics_social_daily where day = p_day;

  insert into public.analytics_social_daily (
    day,
    course_id,
    unique_learners,
    lesson_completions,
    updated_at
  )
  select
    p_day,
    coalesce(nullif(props->>'course_id', ''), 'unknown') as course_id,
    count(distinct installation_id)::integer as unique_learners,
    count(*)::integer as lesson_completions,
    now()
  from public.analytics_events
  where event = 'academy_lesson_completed'
    and created_at >= p_day::timestamptz
    and created_at < (p_day + 1)::timestamptz
  group by 1, 2;
end;
$$;

revoke all on function public.refresh_analytics_social_daily(date) from public;
grant execute on function public.refresh_analytics_social_daily(date) to authenticated;

-- Initial fill for today (optional).
select public.refresh_analytics_social_daily();
