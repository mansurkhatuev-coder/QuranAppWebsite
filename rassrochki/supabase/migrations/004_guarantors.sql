-- Несколько поручителей на одну рассрочку

create table if not exists public.loan_guarantors (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  full_name text not null,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_guarantors_loan on public.loan_guarantors (loan_id);
create index if not exists idx_guarantors_org on public.loan_guarantors (organization_id);

alter table public.loan_guarantors enable row level security;

drop policy if exists "guarantors_all" on public.loan_guarantors;
create policy "guarantors_all" on public.loan_guarantors
  for all using (organization_id = public.user_organization_id())
  with check (organization_id = public.user_organization_id());
