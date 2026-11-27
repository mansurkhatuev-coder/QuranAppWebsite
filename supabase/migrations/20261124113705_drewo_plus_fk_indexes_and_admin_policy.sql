-- Keep parent and owner lookups efficient; expose only each administrator's own marker.

create index drewo_plus_people_tree_parent_idx
  on public.drewo_plus_people (tree_id, parent_id);

create index drewo_plus_video_exports_owner_idx
  on public.drewo_plus_video_exports (owner_id);

create index drewo_plus_video_exports_tree_owner_idx
  on public.drewo_plus_video_exports (tree_id, owner_id);

create policy drewo_plus_admins_read_self
  on drewo_plus_private.admins for select to authenticated
  using (user_id = (select auth.uid()));
