-- Per-student scores for Monday-window Зачёт sessions.

select
  s.code,
  s.pacing,
  s.status,
  s.started_at,
  l.title as lesson_title,
  p.display_name as student,
  p.status as student_status,
  count(a.id)::int as answered,
  count(a.id) filter (where a.is_correct is true)::int as correct,
  coalesce(sum(a.score), 0)::numeric as score_sum
from public.academy_sessions s
left join public.academy_lessons l on l.id = s.lesson_id
join public.academy_participants p on p.session_id = s.id and p.status <> 'kicked'
left join public.academy_answers a on a.session_id = s.id and a.participant_id = p.id
where s.started_at >= '2026-09-27 18:00:00+00'
  and s.started_at <  '2026-09-29 12:00:00+00'
  and (
    l.title ~* 'зач[её]т|экзамен|контрол'
    or coalesce(s.settings->>'mode', '') in ('exam', 'open')
    or s.lesson_id = 'a87e19bf-2347-4f52-b78d-fe50ff9e6eb1'
  )
group by s.id, s.code, s.pacing, s.status, s.started_at, l.title, p.id, p.display_name, p.status
order by s.started_at, score_sum desc, p.display_name;
