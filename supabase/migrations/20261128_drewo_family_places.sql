create schema if not exists drewo_private;
revoke all on schema drewo_private from public, anon, authenticated;

create table if not exists drewo_private.family_places (
  tree_dir text not null check (tree_dir ~ '^drewo(-[a-z0-9-]{1,48})?$'),
  place_id text not null check (place_id ~ '^[a-z0-9-]{1,64}$'),
  kind text not null check (kind in ('Родное место', 'Место рождения', 'Переселение')),
  primary key (tree_dir, place_id, kind)
);
alter table drewo_private.family_places enable row level security;
revoke all on drewo_private.family_places from public, anon, authenticated;

create or replace function public.drewo_family_places(
  p_tree_dir text, p_place_id text default null, p_kind text default null, p_present boolean default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_tree_dir is null or p_tree_dir !~ '^drewo(-[a-z0-9-]{1,48})?$' then
    raise exception 'Invalid family tree ID';
  end if;
  if p_present is not null then
    if p_place_id is null or p_kind is null then
      raise exception 'Invalid family place';
    end if;
    if p_present then
      insert into drewo_private.family_places (tree_dir, place_id, kind)
      values (p_tree_dir, p_place_id, p_kind) on conflict do nothing;
    else
      delete from drewo_private.family_places
      where tree_dir = p_tree_dir and place_id = p_place_id and kind = p_kind;
    end if;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', place_id, 'kind', kind) order by place_id, kind)
    from drewo_private.family_places where tree_dir = p_tree_dir
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.drewo_family_places(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.drewo_family_places(text, text, text, boolean) to service_role;
