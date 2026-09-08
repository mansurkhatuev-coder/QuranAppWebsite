-- Drewo Web Push: trees metadata + per-device subscriptions

create table if not exists public.drewo_trees (
  tree_id text primary key,
  name text not null,
  premium boolean not null default true,
  notifications_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.drewo_push_subscriptions (
  id bigserial primary key,
  tree_id text not null references public.drewo_trees (tree_id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (tree_id, endpoint)
);

create index if not exists drewo_push_subscriptions_tree_id_idx
  on public.drewo_push_subscriptions (tree_id);

insert into public.drewo_trees (tree_id, name, premium, notifications_enabled)
values ('drewo', 'Хьоти некъ', true, true)
on conflict (tree_id) do update set
  name = excluded.name,
  premium = excluded.premium,
  notifications_enabled = excluded.notifications_enabled;

alter table public.drewo_trees enable row level security;
alter table public.drewo_push_subscriptions enable row level security;
