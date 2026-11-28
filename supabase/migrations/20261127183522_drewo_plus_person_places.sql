-- Personal place links remain private to the owner of the Plus tree.
begin;

create table public.drewo_plus_person_places (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null,
  person_id uuid not null,
  place_id text not null check (
    char_length(place_id) between 1 and 120
    and place_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  kind text not null check (kind in ('Родное место', 'Место рождения', 'Переселение')),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (tree_id, person_id, place_id, kind),
  foreign key (tree_id, person_id)
    references public.drewo_plus_people (tree_id, id) on delete cascade
);

create index drewo_plus_person_places_tree_person_created_idx
  on public.drewo_plus_person_places (tree_id, person_id, created_at, id);

alter table public.drewo_plus_person_places enable row level security;
revoke all on public.drewo_plus_person_places from public, anon, authenticated;
grant select, delete on public.drewo_plus_person_places to authenticated;
grant insert (tree_id, person_id, place_id, kind, note)
  on public.drewo_plus_person_places to authenticated;

create policy drewo_plus_person_places_read_own_tree
  on public.drewo_plus_person_places for select to authenticated
  using (exists (
    select 1 from public.drewo_plus_trees t
    where t.id = tree_id and t.owner_id = (select auth.uid())
  ));

create policy drewo_plus_person_places_insert_own_tree
  on public.drewo_plus_person_places for insert to authenticated
  with check (exists (
    select 1 from public.drewo_plus_trees t
    where t.id = tree_id and t.owner_id = (select auth.uid())
  ));

create policy drewo_plus_person_places_delete_own_tree
  on public.drewo_plus_person_places for delete to authenticated
  using (exists (
    select 1 from public.drewo_plus_trees t
    where t.id = tree_id and t.owner_id = (select auth.uid())
  ));

commit;
