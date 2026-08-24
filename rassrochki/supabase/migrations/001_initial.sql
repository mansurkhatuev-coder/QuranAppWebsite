-- Рассрочки MVP: организации, клиенты, займы, график платежей

create extension if not exists "pgcrypto";

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  full_name text,
  role text not null default 'admin' check (role in ('admin')),
  created_at timestamptz not null default now()
);

create table public.organization_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  default_term_months int not null default 12,
  income_share_manager numeric(5, 2) not null default 30,
  income_share_investor numeric(5, 2) not null default 70,
  overdue_days int not null default 3,
  currency text not null default 'RUB',
  contract_template text not null default 'ДОГОВОР РАССРОЧКИ

Организация: {organization}
Клиент: {client}
Телефон: {phone}
Сумма: {amount} ₽
Срок: {term_months} мес.
Ежемесячный платёж: {monthly_payment} ₽
Дата начала: {start_date}

График платежей:
{schedule}

Доли дохода: {manager_share}% / {investor_share}%
Инвестор: {investor}

Подпись клиента: _______________
Подпись организации: _______________',
  updated_at timestamptz not null default now()
);

create table public.investors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  share_percent numeric(5, 2) not null default 70,
  notes text,
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  full_name text not null,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete restrict,
  investor_id uuid references public.investors (id) on delete set null,
  title text,
  principal numeric(12, 2) not null check (principal > 0),
  term_months int not null check (term_months > 0),
  start_date date not null,
  monthly_payment numeric(12, 2) not null check (monthly_payment > 0),
  income_share_manager numeric(5, 2) not null,
  income_share_investor numeric(5, 2) not null,
  status text not null default 'active' check (status in ('active', 'closed')),
  notes text,
  created_at timestamptz not null default now()
);

create table public.payment_schedules (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sequence_number int not null,
  due_date date not null,
  amount numeric(12, 2) not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'overdue')),
  paid_at timestamptz,
  paid_amount numeric(12, 2),
  unique (loan_id, sequence_number)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  schedule_id uuid references public.payment_schedules (id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  method text,
  notes text
);

create index idx_profiles_org on public.profiles (organization_id);
create index idx_clients_org on public.clients (organization_id);
create index idx_loans_org on public.loans (organization_id);
create index idx_loans_client on public.loans (client_id);
create index idx_schedules_loan on public.payment_schedules (loan_id);
create index idx_schedules_due on public.payment_schedules (organization_id, due_date, status);

create or replace function public.user_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid()
$$;

create or replace function public.create_organization_for_user(
  org_name text,
  user_full_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if exists (select 1 from public.profiles where id = uid) then
    raise exception 'Profile already exists';
  end if;
  if trim(org_name) = '' then
    raise exception 'Organization name required';
  end if;

  insert into public.organizations (name) values (trim(org_name)) returning id into new_org_id;
  insert into public.profiles (id, organization_id, full_name, role)
  values (uid, new_org_id, nullif(trim(user_full_name), ''), 'admin');
  insert into public.organization_settings (organization_id) values (new_org_id);

  return new_org_id;
end;
$$;

grant execute on function public.create_organization_for_user(text, text) to authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_settings enable row level security;
alter table public.investors enable row level security;
alter table public.clients enable row level security;
alter table public.loans enable row level security;
alter table public.payment_schedules enable row level security;
alter table public.payments enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());

create policy "profiles_select_org" on public.profiles
  for select using (organization_id = public.user_organization_id());

create policy "organizations_select" on public.organizations
  for select using (id = public.user_organization_id());

create policy "organizations_update" on public.organizations
  for update using (id = public.user_organization_id());

create policy "settings_select" on public.organization_settings
  for select using (organization_id = public.user_organization_id());

create policy "settings_update" on public.organization_settings
  for update using (organization_id = public.user_organization_id());

create policy "investors_all" on public.investors
  for all using (organization_id = public.user_organization_id())
  with check (organization_id = public.user_organization_id());

create policy "clients_all" on public.clients
  for all using (organization_id = public.user_organization_id())
  with check (organization_id = public.user_organization_id());

create policy "loans_all" on public.loans
  for all using (organization_id = public.user_organization_id())
  with check (organization_id = public.user_organization_id());

create policy "schedules_all" on public.payment_schedules
  for all using (organization_id = public.user_organization_id())
  with check (organization_id = public.user_organization_id());

create policy "payments_all" on public.payments
  for all using (organization_id = public.user_organization_id())
  with check (organization_id = public.user_organization_id());
