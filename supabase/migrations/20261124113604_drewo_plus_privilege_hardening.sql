-- Replace Supabase's broad default table grants with Drewo's column-level access model.
-- This only affects Drewo's newly created tables in the shared database.

revoke all privileges on table
  public.drewo_plus_accounts,
  public.drewo_plus_trees,
  public.drewo_plus_people,
  public.drewo_plus_video_exports,
  drewo_plus_private.admins
from public, anon, authenticated;

grant select, insert (user_id, display_name), update (display_name)
  on public.drewo_plus_accounts to authenticated;

grant select, delete on public.drewo_plus_trees to authenticated;
grant insert (owner_id, request_id, title, atlas_group_id, atlas_teip_id)
  on public.drewo_plus_trees to authenticated;
grant update (title) on public.drewo_plus_trees to authenticated;

grant select, delete on public.drewo_plus_people to authenticated;
grant insert (tree_id, parent_id, name, born, died, note)
  on public.drewo_plus_people to authenticated;
grant update (name, parent_id, born, died, note)
  on public.drewo_plus_people to authenticated;

grant select, delete on public.drewo_plus_video_exports to authenticated;
grant insert (tree_id, owner_id, storage_path)
  on public.drewo_plus_video_exports to authenticated;
