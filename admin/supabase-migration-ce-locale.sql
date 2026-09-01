-- Chechen UI locale draft (single JSON snapshot for admin workbench)

create table if not exists public.ce_locale_draft (
  id integer primary key default 1 check (id = 1),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.ce_locale_draft enable row level security;

drop policy if exists "authenticated read ce locale draft" on public.ce_locale_draft;
drop policy if exists "authenticated manage ce locale draft" on public.ce_locale_draft;

create policy "authenticated read ce locale draft"
  on public.ce_locale_draft
  for select
  to authenticated
  using (true);

create policy "authenticated manage ce locale draft"
  on public.ce_locale_draft
  for all
  to authenticated
  using (true)
  with check (true);
