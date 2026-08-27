-- Collapse duplicate academy feedback rows.
-- Unique rule: one row per (course_id, client_id) when client_id is set.
-- Older app builds inserted again instead of upsert → duplicates in admin.

-- 1) Keep newest row per (course_id, client_id).
with ranked as (
  select
    id,
    row_number() over (
      partition by course_id, client_id
      order by coalesce(updated_at, created_at) desc, created_at desc, id desc
    ) as rn
  from public.academy_course_feedback
  where client_id is not null
    and btrim(client_id) <> ''
)
delete from public.academy_course_feedback f
using ranked r
where f.id = r.id
  and r.rn > 1;

-- 2) Rows without client_id: keep one per identical course+rating+comment+name.
with ranked_anon as (
  select
    id,
    row_number() over (
      partition by
        course_id,
        rating,
        coalesce(nullif(btrim(comment), ''), ''),
        coalesce(nullif(btrim(display_name), ''), '')
      order by created_at desc, id desc
    ) as rn
  from public.academy_course_feedback
  where client_id is null
     or btrim(client_id) = ''
)
delete from public.academy_course_feedback f
using ranked_anon r
where f.id = r.id
  and r.rn > 1;

notify pgrst, 'reload schema';
