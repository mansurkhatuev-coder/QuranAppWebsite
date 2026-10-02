-- Read-only lookup: Зачёт sessions around Monday 2026-09-28 (MSK).
-- Window: Sun 27 evening UTC → Tue 29 morning UTC covers Mon MSK fully.

select
  s.id::text as session_id,
  s.code,
  s.pacing,
  s.status,
  s.phase,
  s.started_at,
  s.finished_at,
  s.hub_id::text as hub_id,
  coalesce(s.settings->>'mode', '') as mode,
  l.title as lesson_title,
  l.id::text as lesson_id,
  u.email as host_email,
  t.display_name as host_name,
  (select count(*)::int from public.academy_participants p
    where p.session_id = s.id and p.status <> 'kicked') as participants,
  (select count(*)::int from public.academy_answers a
    where a.session_id = s.id) as answers,
  (select count(*)::int from public.academy_answers a
    where a.session_id = s.id and a.is_correct is true) as correct_answers
from public.academy_sessions s
left join public.academy_lessons l on l.id = s.lesson_id
left join public.academy_teachers t on t.user_id = s.host_user_id
left join auth.users u on u.id = s.host_user_id
where s.started_at >= '2026-09-27 18:00:00+00'
  and s.started_at <  '2026-09-29 12:00:00+00'
  and (
    l.title ~* 'зач[её]т|экзамен|контрол'
    or coalesce(s.settings->>'mode', '') in ('exam', 'open')
    or s.lesson_id = 'a87e19bf-2347-4f52-b78d-fe50ff9e6eb1'
  )
order by s.started_at nulls last;
