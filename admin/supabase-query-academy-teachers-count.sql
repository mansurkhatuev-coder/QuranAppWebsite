-- Diagnostic only: count teachers and auth users. No writes.
select
  (select count(*)::int from auth.users) as auth_users,
  (select count(*)::int from public.academy_teachers) as teachers,
  (select count(*)::int from public.academy_teachers where is_active) as teachers_active;
