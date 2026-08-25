-- Ужесточение RLS: дочерние строки должны ссылаться на родителя той же организации.

create or replace function public.loan_belongs_to_org(p_loan_id uuid, p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.loans l
    where l.id = p_loan_id and l.organization_id = p_org_id
  );
$$;

create or replace function public.client_belongs_to_org(p_client_id uuid, p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.clients c
    where c.id = p_client_id and c.organization_id = p_org_id
  );
$$;

create or replace function public.investor_belongs_to_org(p_investor_id uuid, p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_investor_id is null or exists (
    select 1 from public.investors i
    where i.id = p_investor_id and i.organization_id = p_org_id
  );
$$;

create or replace function public.schedule_belongs_to_org(p_schedule_id uuid, p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_schedule_id is null or exists (
    select 1 from public.payment_schedules s
    where s.id = p_schedule_id and s.organization_id = p_org_id
  );
$$;

drop policy if exists "loans_all" on public.loans;
create policy "loans_all" on public.loans
  for all
  using (organization_id = public.user_organization_id())
  with check (
    organization_id = public.user_organization_id()
    and public.client_belongs_to_org(client_id, organization_id)
    and public.investor_belongs_to_org(investor_id, organization_id)
  );

drop policy if exists "schedules_all" on public.payment_schedules;
create policy "schedules_all" on public.payment_schedules
  for all
  using (organization_id = public.user_organization_id())
  with check (
    organization_id = public.user_organization_id()
    and public.loan_belongs_to_org(loan_id, organization_id)
  );

drop policy if exists "payments_all" on public.payments;
create policy "payments_all" on public.payments
  for all
  using (organization_id = public.user_organization_id())
  with check (
    organization_id = public.user_organization_id()
    and public.loan_belongs_to_org(loan_id, organization_id)
    and public.schedule_belongs_to_org(schedule_id, organization_id)
  );

drop policy if exists "guarantors_all" on public.loan_guarantors;
create policy "guarantors_all" on public.loan_guarantors
  for all
  using (organization_id = public.user_organization_id())
  with check (
    organization_id = public.user_organization_id()
    and public.loan_belongs_to_org(loan_id, organization_id)
  );
