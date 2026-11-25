-- All Academy sessions in Monday window (fallback if title filter misses).

select
  s.id::text as session_id,
  s.code,
  s.pacing,
  s.status,
  s.started_at,
  s.finished_at,
  coalesce(s.settings->>'mode', '') as mode,
  l.title as lesson_title,
  u.email as host_email,
  (select count(*)::int from public.academy_participants p
    where p.session_id = s.id and p.status <> 'kicked') as participants,
  (select count(*)::int from public.academy_answers a
    where a.session_id = s.id) as answers
from public.academy_sessions s
left join public.academy_lessons l on l.id = s.lesson_id
left join auth.users u on u.id = s.host_user_id
where s.started_at >= '2026-09-27 18:00:00+00'
  and s.started_at <  '2026-09-29 12:00:00+00'
order by s.started_at nulls last
limit 80;
