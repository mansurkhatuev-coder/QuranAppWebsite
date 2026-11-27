-- A registered account may create its personal tree only once.
-- Keep the owner unique index and prevent owners from deleting the row through the API.

begin;

drop policy if exists drewo_plus_trees_delete_own
  on public.drewo_plus_trees;

revoke delete on table public.drewo_plus_trees from anon, authenticated;

commit;
