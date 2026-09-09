-- Additive: register all existing Auth users as Academy teachers.
-- Does not delete or deactivate anyone. Safe to re-run.

insert into public.academy_teachers (user_id, display_name, is_active)
select
  u.id,
  coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), u.email, 'Учитель'),
  true
from auth.users u
on conflict (user_id) do update
  set is_active = true,
      display_name = excluded.display_name,
      updated_at = now();
