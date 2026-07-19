-- Academy final-exam giveaway (settings + entries).

create table if not exists public.academy_giveaway_settings (
  campaign_id text primary key,
  active boolean not null default false,
  prize_text text,
  winners_target integer not null default 3 check (winners_target between 1 and 3),
  updated_at timestamptz not null default now()
);

insert into public.academy_giveaway_settings (campaign_id, active, prize_text, winners_target)
values ('tajweed_final_v1', false, null, 3)
on conflict (campaign_id) do nothing;

create table if not exists public.academy_final_exam_entries (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null references public.academy_giveaway_settings (campaign_id),
  client_id text not null,
  code text not null,
  display_name text not null,
  phone text not null,
  phone_raw text,
  score_percent integer not null check (score_percent between 0 and 100),
  exam_version text not null,
  attempted_at timestamptz,
  consent_at timestamptz not null default now(),
  status text not null default 'entered'
    check (status in ('entered', 'winner', 'not_selected')),
  app_version text,
  platform text,
  locale text,
  created_at timestamptz not null default now(),
  unique (campaign_id, client_id),
  unique (campaign_id, code)
);

create index if not exists academy_final_exam_entries_phone_idx
  on public.academy_final_exam_entries (campaign_id, phone);

create index if not exists academy_final_exam_entries_created_idx
  on public.academy_final_exam_entries (campaign_id, created_at desc);

alter table public.academy_giveaway_settings enable row level security;
alter table public.academy_final_exam_entries enable row level security;

drop policy if exists "public read giveaway settings" on public.academy_giveaway_settings;
create policy "public read giveaway settings"
  on public.academy_giveaway_settings
  for select
  to anon, authenticated
  using (true);

drop policy if exists "authenticated manage giveaway settings" on public.academy_giveaway_settings;
create policy "authenticated manage giveaway settings"
  on public.academy_giveaway_settings
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "authenticated read giveaway entries" on public.academy_final_exam_entries;
create policy "authenticated read giveaway entries"
  on public.academy_final_exam_entries
  for select
  to authenticated
  using (true);

drop policy if exists "authenticated update giveaway entries" on public.academy_final_exam_entries;
create policy "authenticated update giveaway entries"
  on public.academy_final_exam_entries
  for update
  to authenticated
  using (true)
  with check (true);

-- Inserts go through Edge Function with service role (preferred).
