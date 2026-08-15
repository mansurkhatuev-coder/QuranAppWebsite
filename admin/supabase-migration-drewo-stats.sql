-- Atomic visit counters for family trees (avoids GitHub race on concurrent first visits).
-- Run in Supabase SQL Editor. Safe to re-run.

create table if not exists public.drewo_tree_stats (
  tree_dir text primary key
    check (tree_dir in ('drewo', 'drewo-dada-yurt', 'drewo-reklama')),
  visit_count bigint not null default 0 check (visit_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.drewo_tree_stats enable row level security;

create or replace function public.drewo_increment_visit(p_tree_dir text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v bigint;
begin
  if p_tree_dir is null or p_tree_dir not in ('drewo', 'drewo-dada-yurt', 'drewo-reklama') then
    raise exception 'invalid tree_dir';
  end if;

  insert into public.drewo_tree_stats as s (tree_dir, visit_count, updated_at)
  values (p_tree_dir, 1, now())
  on conflict (tree_dir) do update
    set visit_count = s.visit_count + 1,
        updated_at = now()
  returning s.visit_count into v;

  return v;
end;
$$;

revoke all on function public.drewo_increment_visit(text) from public;
grant execute on function public.drewo_increment_visit(text) to service_role;
