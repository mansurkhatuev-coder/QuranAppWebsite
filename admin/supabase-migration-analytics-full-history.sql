-- Full-history breakdowns for the admin product analytics dashboard.
-- Apply after supabase-migration-analytics-dashboard.sql. Safe to re-run.

create or replace function public.analytics_dashboard(p_days integer default 7)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_days integer := greatest(coalesce(p_days, 7), 0);
  v_now timestamptz := now();
  v_from timestamptz;
  v_prev_from timestamptz;
  v_prev_to timestamptz;
  v_series_from date;
  v_period jsonb;
  v_prev jsonb;
  v_series jsonb;
  v_platforms jsonb;
  v_lesson_courses jsonb;
  v_course_funnel jsonb;
  v_azkar_categories jsonb;
  v_all_time bigint;
begin
  -- Keep today fresh for sparklines.
  perform public.refresh_analytics_daily((v_now at time zone 'utc')::date);
  perform public.refresh_analytics_daily(((v_now at time zone 'utc')::date - 1));

  if v_days = 0 then
    v_from := timestamptz '1970-01-01 00:00:00+00';
    v_prev_from := v_from;
    v_prev_to := v_from;
  else
    v_from := v_now - make_interval(days => v_days);
    v_prev_to := v_from;
    v_prev_from := v_from - make_interval(days => v_days);
  end if;

  v_series_from := (v_now at time zone 'utc')::date - 29;

  select greatest(
    (select count(*)::bigint from public.analytics_installations),
    (select count(distinct installation_id)::bigint
       from public.analytics_events
      where char_length(installation_id) between 8 and 80
        and created_at < v_now)
  ) into v_all_time;

  select jsonb_build_object(
    'active', case
      when v_days = 0 then v_all_time::integer
      else (select count(*)::int
              from public.analytics_installations
             where last_seen_at >= v_from and last_seen_at < v_now)
    end,
    'new_installs', (select count(*)::int
                       from public.analytics_installations
                      where first_seen_at >= v_from and first_seen_at < v_now),
    'events', (select count(*)::int
                 from public.analytics_events
                where created_at >= v_from and created_at < v_now),
    'app_open', (select count(*)::int
                   from public.analytics_events
                  where created_at >= v_from and created_at < v_now and event = 'app_open'),
    'academy_hub_open', (select count(*)::int
                           from public.analytics_events
                          where created_at >= v_from and created_at < v_now and event = 'academy_hub_open'),
    'lessons', (select count(*)::int
                  from public.analytics_events
                 where created_at >= v_from and created_at < v_now and event = 'academy_lesson_completed'),
    'azkar', (select count(*)::int
                from public.analytics_events
               where created_at >= v_from and created_at < v_now and event = 'azkar_item_completed'),
    'azkar_users', (select count(distinct installation_id)::int
                      from public.analytics_events
                     where created_at >= v_from and created_at < v_now and event = 'azkar_item_completed'),
    'lesson_users', (select count(distinct installation_id)::int
                       from public.analytics_events
                      where created_at >= v_from and created_at < v_now and event = 'academy_lesson_completed'),
    'tasbih', (select count(*)::int
                 from public.analytics_events
                where created_at >= v_from and created_at < v_now and event = 'tasbih_milestone')
  ) into v_period;

  if v_days = 0 then
    v_prev := v_period;
  else
    select jsonb_build_object(
      'active', (select count(*)::int
                  from public.analytics_installations
                 where last_seen_at >= v_prev_from and last_seen_at < v_prev_to),
      'new_installs', (select count(*)::int
                         from public.analytics_installations
                        where first_seen_at >= v_prev_from and first_seen_at < v_prev_to),
      'events', (select count(*)::int
                   from public.analytics_events
                  where created_at >= v_prev_from and created_at < v_prev_to),
      'app_open', (select count(*)::int
                     from public.analytics_events
                    where created_at >= v_prev_from and created_at < v_prev_to and event = 'app_open'),
      'lessons', (select count(*)::int
                    from public.analytics_events
                   where created_at >= v_prev_from and created_at < v_prev_to and event = 'academy_lesson_completed'),
      'azkar', (select count(*)::int
                  from public.analytics_events
                 where created_at >= v_prev_from and created_at < v_prev_to and event = 'azkar_item_completed'),
      'azkar_users', (select count(distinct installation_id)::int
                        from public.analytics_events
                       where created_at >= v_prev_from and created_at < v_prev_to and event = 'azkar_item_completed'),
      'lesson_users', (select count(distinct installation_id)::int
                         from public.analytics_events
                        where created_at >= v_prev_from and created_at < v_prev_to and event = 'academy_lesson_completed'),
      'tasbih', (select count(*)::int
                   from public.analytics_events
                  where created_at >= v_prev_from and created_at < v_prev_to and event = 'tasbih_milestone')
    ) into v_prev;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'category', category,
        'completions', completions
      ) order by completions desc, category
    ),
    '[]'::jsonb
  )
  into v_azkar_categories
  from (
    select coalesce(nullif(btrim(props ->> 'category'), ''), '__missing__') as category,
           count(*)::int as completions
      from public.analytics_events
     where created_at >= v_from
       and created_at < v_now
       and event = 'azkar_item_completed'
     group by 1
  ) grouped_categories;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'course_id', course_id,
        'completions', completions,
        'learners', learners
      ) order by completions desc, course_id
    ),
    '[]'::jsonb
  )
  into v_lesson_courses
  from (
    select case
             when nullif(btrim(props ->> 'course_id'), '') in ('names99', 'madina', 'tajweed')
               then btrim(props ->> 'course_id')
             else '__missing__'
           end as course_id,
           count(*)::int as completions,
           count(distinct installation_id)::int as learners
      from public.analytics_events
     where created_at >= v_from
       and created_at < v_now
       and event = 'academy_lesson_completed'
     group by 1
  ) grouped_courses;

  with course_totals(course_id, total_lessons) as (
    values ('names99'::text, 10), ('madina'::text, 23), ('tajweed'::text, 44)
  ), learner_courses as (
    select nullif(btrim(props ->> 'course_id'), '') as course_id,
           installation_id,
           count(distinct nullif(btrim(props ->> 'lesson_id'), ''))::int as lessons_completed,
           max(created_at) as last_completed_at
      from public.analytics_events
     where created_at >= v_from
       and created_at < v_now
       and event = 'academy_lesson_completed'
       and nullif(btrim(props ->> 'course_id'), '') in ('names99', 'madina', 'tajweed')
     group by 1, 2
  ), course_states as (
    select totals.course_id,
           totals.total_lessons,
           learner_courses.installation_id,
           learner_courses.lessons_completed,
           learner_courses.last_completed_at
      from course_totals totals
      left join learner_courses using (course_id)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'course_id', course_id,
        'started', started,
        'finished', finished,
        'abandoned', abandoned,
        'studying', studying,
        'total_lessons', total_lessons
      ) order by started desc, course_id
    ) filter (where started > 0),
    '[]'::jsonb
  )
  into v_course_funnel
  from (
    select course_id,
           total_lessons,
           count(installation_id)::int as started,
           count(installation_id) filter (
             where lessons_completed >= total_lessons
           )::int as finished,
           count(installation_id) filter (
             where lessons_completed < total_lessons
               and last_completed_at < v_now - interval '14 days'
           )::int as abandoned,
           count(installation_id) filter (
             where lessons_completed < total_lessons
               and last_completed_at >= v_now - interval '14 days'
           )::int as studying
      from course_states
     group by course_id, total_lessons
  ) funnel_counts;

  select coalesce(jsonb_agg(row_to_json(s)::jsonb order by s.day), '[]'::jsonb)
  into v_series
  from (
    select d.day::text as day,
           d.active_installs,
           d.new_installs,
           d.events_total,
           d.app_open,
           d.azkar_item_completed as azkar,
           d.academy_lesson_completed as lessons
      from public.analytics_daily d
     where d.day >= v_series_from
     order by d.day
  ) s;

  select coalesce(jsonb_agg(jsonb_build_object('platform', p.platform, 'count', p.cnt) order by p.cnt desc), '[]'::jsonb)
    into v_platforms
    from (
      select coalesce(nullif(platform, ''), '—') as platform, count(*)::int as cnt
        from public.analytics_installations
       group by 1
       order by 2 desc
       limit 8
    ) p;

  return jsonb_build_object(
    'ok', true,
    'days', v_days,
    'generated_at', v_now,
    'all_time_installs', v_all_time,
    'period', v_period,
    'previous', v_prev,
    'series', v_series,
    'platforms', v_platforms,
    'details', jsonb_build_object(
      'azkar_categories', v_azkar_categories,
      'lesson_courses', v_lesson_courses,
      'course_funnel', v_course_funnel
    ),
    'source', 'analytics_dashboard'
  );
end;
$$;

revoke all on function public.analytics_dashboard(integer) from public;
grant execute on function public.analytics_dashboard(integer) to authenticated;
