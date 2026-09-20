-- Register one Academy teacher after creating the Auth user in Dashboard.
-- Authentication → Users → Add user → copy UUID into :teacher_user_id below.
--
-- Example:
--   display_name = 'Учитель медресе'
--   user_id      = '........-....-....-....-............'

insert into public.academy_teachers (user_id, display_name, is_active)
values (
  '<teacher_user_id>'::uuid,
  'Учитель медресе',
  true
)
on conflict (user_id) do update
  set is_active = true,
      display_name = excluded.display_name,
      updated_at = now();

-- Optional: list teachers
-- select t.user_id, t.display_name, t.is_active, u.email
-- from public.academy_teachers t
-- left join auth.users u on u.id = t.user_id
-- order by t.created_at desc;
