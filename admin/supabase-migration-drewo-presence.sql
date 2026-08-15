-- Anonymous live presence for family trees (who is online now).
-- Run in Supabase SQL Editor. Safe to re-run.
-- Written only by publish-drewo Edge Function (service role). No public policies.

create table if not exists public.drewo_presence (
  tree_dir text not null
    check (tree_dir in ('drewo', 'drewo-dada-yurt', 'drewo-reklama')),
  session_id text not null
    check (char_length(session_id) between 8 and 80),
  last_seen_at timestamptz not null default now(),
  primary key (tree_dir, session_id)
);

create index if not exists drewo_presence_tree_seen_idx
  on public.drewo_presence (tree_dir, last_seen_at desc);

alter table public.drewo_presence enable row level security;

-- Intentionally no anon/authenticated policies: clients talk only via Edge Function.
