-- Core account and tree limits for the static Supabase edition of Drewo.
-- All application objects are namespaced; no existing QuranAppWebsite tables are altered.

create schema if not exists drewo_plus_private;
revoke all on schema drewo_plus_private from public, anon, authenticated;

create table public.drewo_plus_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  plan text not null default 'free' check (plan in ('free', 'plus')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.drewo_plus_trees (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  request_id uuid not null,
  title text not null check (char_length(trim(title)) between 1 and 100),
  atlas_group_id text check (atlas_group_id is null or atlas_group_id in
    ('akki', 'melkhiy', 'nokhch', 'orst', 'terloy', 'chantiy', 'cheber', 'sharoi', 'shatoi')),
  atlas_teip_id text check (atlas_teip_id is null or char_length(trim(atlas_teip_id)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (atlas_teip_id is null or atlas_group_id is not null),
  unique (id, owner_id),
  unique (owner_id, request_id)
);

create table public.drewo_plus_people (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.drewo_plus_trees (id) on delete cascade,
  parent_id uuid,
  name text not null check (char_length(trim(name)) between 1 and 100),
  born integer check (born is null or born between 1 and 9999),
  died integer check (died is null or died between 1 and 9999),
  note text not null default '' check (char_length(note) <= 2000),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tree_id, id),
  foreign key (tree_id, parent_id)
    references public.drewo_plus_people (tree_id, id) on delete restrict,
  check (parent_id is distinct from id),
  check (born is null or died is null or born <= died)
);

create index drewo_plus_people_tree_created_idx
  on public.drewo_plus_people (tree_id, created_at, id);

create table public.drewo_plus_video_exports (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.drewo_plus_trees (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  foreign key (tree_id, owner_id)
    references public.drewo_plus_trees (id, owner_id) on delete cascade,
  check (storage_path like owner_id::text || '/' || tree_id::text || '/%')
);

create index drewo_plus_video_exports_tree_created_idx
  on public.drewo_plus_video_exports (tree_id, created_at desc);

create table drewo_plus_private.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.drewo_plus_accounts enable row level security;
alter table public.drewo_plus_trees enable row level security;
alter table public.drewo_plus_people enable row level security;
alter table public.drewo_plus_video_exports enable row level security;
alter table drewo_plus_private.admins enable row level security;

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

create policy drewo_plus_accounts_read_own
  on public.drewo_plus_accounts for select to authenticated
  using (user_id = (select auth.uid()));

create policy drewo_plus_accounts_insert_own
  on public.drewo_plus_accounts for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy drewo_plus_accounts_update_own_name
  on public.drewo_plus_accounts for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy drewo_plus_trees_read_own
  on public.drewo_plus_trees for select to authenticated
  using (owner_id = (select auth.uid()));

create policy drewo_plus_trees_insert_own
  on public.drewo_plus_trees for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy drewo_plus_trees_update_own
  on public.drewo_plus_trees for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy drewo_plus_trees_delete_own
  on public.drewo_plus_trees for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy drewo_plus_people_read_own_tree
  on public.drewo_plus_people for select to authenticated
  using (exists (
    select 1 from public.drewo_plus_trees t
    where t.id = tree_id and t.owner_id = (select auth.uid())
  ));

create policy drewo_plus_people_insert_own_tree
  on public.drewo_plus_people for insert to authenticated
  with check (exists (
    select 1 from public.drewo_plus_trees t
    where t.id = tree_id and t.owner_id = (select auth.uid())
  ));

create policy drewo_plus_people_update_own_tree
  on public.drewo_plus_people for update to authenticated
  using (exists (
    select 1 from public.drewo_plus_trees t
    where t.id = tree_id and t.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.drewo_plus_trees t
    where t.id = tree_id and t.owner_id = (select auth.uid())
  ));

create policy drewo_plus_people_delete_own_tree
  on public.drewo_plus_people for delete to authenticated
  using (exists (
    select 1 from public.drewo_plus_trees t
    where t.id = tree_id and t.owner_id = (select auth.uid())
  ));

create policy drewo_plus_video_exports_read_own
  on public.drewo_plus_video_exports for select to authenticated
  using (owner_id = (select auth.uid()));

create policy drewo_plus_video_exports_insert_own
  on public.drewo_plus_video_exports for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.drewo_plus_trees t
      where t.id = tree_id and t.owner_id = (select auth.uid())
    )
  );

create policy drewo_plus_video_exports_delete_own
  on public.drewo_plus_video_exports for delete to authenticated
  using (owner_id = (select auth.uid()));

create function public.drewo_plus_ensure_account(p_display_name text default '')
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Войдите в аккаунт.' using errcode = '42501';
  end if;
  insert into public.drewo_plus_accounts (user_id, display_name)
  values (current_user_id, left(trim(coalesce(p_display_name, '')), 80))
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function public.drewo_plus_ensure_account(text) from public, anon;
grant execute on function public.drewo_plus_ensure_account(text) to authenticated;

create function public.drewo_plus_touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  if tg_table_name = 'drewo_plus_people' then
    new.revision := old.revision + 1;
  end if;
  return new;
end;
$$;

revoke all on function public.drewo_plus_touch_updated_at() from public, anon, authenticated;
create trigger drewo_plus_accounts_updated_at
  before update on public.drewo_plus_accounts
  for each row execute function public.drewo_plus_touch_updated_at();
create trigger drewo_plus_trees_updated_at
  before update on public.drewo_plus_trees
  for each row execute function public.drewo_plus_touch_updated_at();
create trigger drewo_plus_people_updated_at
  before update on public.drewo_plus_people
  for each row execute function public.drewo_plus_touch_updated_at();

create function public.drewo_plus_check_person_parent()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  has_cycle boolean;
begin
  if new.parent_id is null then return new; end if;
  with recursive ancestors (id, parent_id) as (
    select p.id, p.parent_id
    from public.drewo_plus_people p
    where p.tree_id = new.tree_id and p.id = new.parent_id
    union all
    select p.id, p.parent_id
    from public.drewo_plus_people p
    join ancestors a on p.id = a.parent_id
    where p.tree_id = new.tree_id
  )
  select exists (select 1 from ancestors where id = new.id) into has_cycle;
  if has_cycle then
    raise exception 'Связь создаёт замкнутую ветвь.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.drewo_plus_check_person_parent() from public, anon, authenticated;
create trigger drewo_plus_people_parent_no_cycle
  before insert or update of parent_id on public.drewo_plus_people
  for each row execute function public.drewo_plus_check_person_parent();

create function public.drewo_plus_enforce_people_limit()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  tree_owner uuid;
  current_plan text;
  people_count integer;
  people_limit integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.tree_id::text, 0));
  select t.owner_id into tree_owner
  from public.drewo_plus_trees t
  where t.id = new.tree_id;
  if tree_owner is null or tree_owner <> auth.uid() then
    raise exception 'Древо недоступно.' using errcode = '42501';
  end if;
  select a.plan into current_plan
  from public.drewo_plus_accounts a
  where a.user_id = tree_owner;
  people_limit := case when current_plan = 'plus' then 500 else 50 end;
  select count(*)::integer into people_count
  from public.drewo_plus_people p
  where p.tree_id = new.tree_id;
  if people_count >= people_limit then
    raise exception 'Достигнут лимит древа: % человек.', people_limit
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.drewo_plus_enforce_people_limit() from public, anon, authenticated;
create trigger drewo_plus_people_insert_limit
  before insert on public.drewo_plus_people
  for each row execute function public.drewo_plus_enforce_people_limit();

create function public.drewo_plus_create_tree(
  p_title text,
  p_first_name text,
  p_request_id uuid,
  p_atlas_group_id text default null,
  p_atlas_teip_id text default null
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  existing_id uuid;
  existing_request_id uuid;
  created_id uuid;
begin
  if current_user_id is null then
    raise exception 'Войдите в аккаунт.' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 1 and 100
     or char_length(trim(coalesce(p_first_name, ''))) not between 1 and 100
     or p_request_id is null
     or (p_atlas_teip_id is not null and p_atlas_group_id is null)
     or (p_atlas_teip_id is not null and char_length(trim(p_atlas_teip_id)) not between 1 and 100) then
    raise exception 'Проверьте название древа и имя первого человека.' using errcode = '22023';
  end if;
  select t.id, t.request_id into existing_id, existing_request_id
  from public.drewo_plus_trees t where t.owner_id = current_user_id;
  if existing_id is not null then
    if existing_request_id = p_request_id then
      return existing_id;
    end if;
    raise exception 'У аккаунта уже есть древо.' using errcode = '23505';
  end if;
  insert into public.drewo_plus_trees (owner_id, request_id, title, atlas_group_id, atlas_teip_id)
  values (current_user_id, p_request_id, trim(p_title), p_atlas_group_id, p_atlas_teip_id)
  returning id into created_id;
  insert into public.drewo_plus_people (tree_id, name)
  values (created_id, trim(p_first_name));
  return created_id;
end;
$$;

revoke all on function public.drewo_plus_create_tree(text, text, uuid, text, text) from public, anon;
grant execute on function public.drewo_plus_create_tree(text, text, uuid, text, text) to authenticated;

create function drewo_plus_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, drewo_plus_private
as $$
  select auth.uid() is not null and exists (
    select 1 from drewo_plus_private.admins a where a.user_id = auth.uid()
  );
$$;

revoke all on function drewo_plus_private.is_admin() from public, anon;
grant usage on schema drewo_plus_private to authenticated;
grant execute on function drewo_plus_private.is_admin() to authenticated;

create function public.drewo_plus_is_admin()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, drewo_plus_private
as $$
  select drewo_plus_private.is_admin();
$$;

revoke all on function public.drewo_plus_is_admin() from public, anon;
grant execute on function public.drewo_plus_is_admin() to authenticated;

create function drewo_plus_private.admin_list_accounts(p_query text default '')
returns table (
  user_id uuid,
  email text,
  display_name text,
  plan text,
  tree_id uuid,
  tree_title text,
  people_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, drewo_plus_private
as $$
begin
  if not exists (select 1 from drewo_plus_private.admins a where a.user_id = auth.uid()) then
    raise exception 'Доступ только для администратора.' using errcode = '42501';
  end if;
  return query
  select a.user_id, u.email::text, a.display_name, a.plan, t.id, t.title,
    (select count(*) from public.drewo_plus_people p where p.tree_id = t.id)
  from public.drewo_plus_accounts a
  join auth.users u on u.id = a.user_id
  left join public.drewo_plus_trees t on t.owner_id = a.user_id
  where coalesce(p_query, '') = ''
     or lower(coalesce(u.email, '') || ' ' || a.display_name) like '%' || lower(trim(p_query)) || '%'
  order by a.created_at desc
  limit 100;
end;
$$;

create function drewo_plus_private.set_plus(p_user_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, drewo_plus_private
as $$
begin
  if not exists (select 1 from drewo_plus_private.admins a where a.user_id = auth.uid()) then
    raise exception 'Доступ только для администратора.' using errcode = '42501';
  end if;
  if p_user_id is null or p_enabled is null then
    raise exception 'Не передан аккаунт или состояние Drewo+.' using errcode = '22023';
  end if;
  update public.drewo_plus_accounts
    set plan = case when p_enabled then 'plus' else 'free' end
    where user_id = p_user_id;
  if not found then
    raise exception 'Аккаунт не найден.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function drewo_plus_private.admin_list_accounts(text) from public, anon;
grant execute on function drewo_plus_private.admin_list_accounts(text) to authenticated;
revoke all on function drewo_plus_private.set_plus(uuid, boolean) from public, anon;
grant execute on function drewo_plus_private.set_plus(uuid, boolean) to authenticated;

create function public.drewo_plus_admin_list_accounts(p_query text default '')
returns table (
  user_id uuid,
  email text,
  display_name text,
  plan text,
  tree_id uuid,
  tree_title text,
  people_count bigint
)
language sql
stable
security invoker
set search_path = pg_catalog, drewo_plus_private
as $$
  select * from drewo_plus_private.admin_list_accounts(p_query);
$$;

create function public.drewo_plus_set_plan(p_user_id uuid, p_enabled boolean)
returns void
language sql
security invoker
set search_path = pg_catalog, drewo_plus_private
as $$
  select drewo_plus_private.set_plus(p_user_id, p_enabled);
$$;

revoke all on function public.drewo_plus_admin_list_accounts(text) from public, anon;
grant execute on function public.drewo_plus_admin_list_accounts(text) to authenticated;
revoke all on function public.drewo_plus_set_plan(uuid, boolean) from public, anon;
grant execute on function public.drewo_plus_set_plan(uuid, boolean) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'drewo-plus-private-exports', 'drewo-plus-private-exports', false,
  52428800, array['video/mp4', 'video/webm', 'video/quicktime']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy drewo_plus_video_storage_read_own
  on storage.objects for select to authenticated
  using (
    bucket_id = 'drewo-plus-private-exports'
    and exists (
      select 1 from public.drewo_plus_video_exports e
      where e.storage_path = name and e.owner_id = (select auth.uid())
    )
  );

create policy drewo_plus_video_storage_insert_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'drewo-plus-private-exports'
    and exists (
      select 1 from public.drewo_plus_video_exports e
      where e.storage_path = name and e.owner_id = (select auth.uid())
    )
  );

create policy drewo_plus_video_storage_update_own
  on storage.objects for update to authenticated
  using (
    bucket_id = 'drewo-plus-private-exports'
    and exists (
      select 1 from public.drewo_plus_video_exports e
      where e.storage_path = name and e.owner_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'drewo-plus-private-exports'
    and exists (
      select 1 from public.drewo_plus_video_exports e
      where e.storage_path = name and e.owner_id = (select auth.uid())
    )
  );

create policy drewo_plus_video_storage_delete_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'drewo-plus-private-exports'
    and exists (
      select 1 from public.drewo_plus_video_exports e
      where e.storage_path = name and e.owner_id = (select auth.uid())
    )
  );

create function public.drewo_plus_enforce_video_limit()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  current_plan text;
  export_count integer;
  export_limit integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.tree_id::text, 1));
  if new.owner_id <> auth.uid() or not exists (
    select 1 from public.drewo_plus_trees t
    where t.id = new.tree_id and t.owner_id = new.owner_id
  ) then
    raise exception 'Древо недоступно.' using errcode = '42501';
  end if;
  select a.plan into current_plan
  from public.drewo_plus_accounts a where a.user_id = new.owner_id;
  export_limit := case when current_plan = 'plus' then 5 else 1 end;
  select count(*)::integer into export_count
  from public.drewo_plus_video_exports e where e.tree_id = new.tree_id;
  if export_count >= export_limit then
    raise exception 'Достигнут лимит сохранённых видео: %.', export_limit
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.drewo_plus_enforce_video_limit() from public, anon, authenticated;
create trigger drewo_plus_video_exports_insert_limit
  before insert on public.drewo_plus_video_exports
  for each row execute function public.drewo_plus_enforce_video_limit();
