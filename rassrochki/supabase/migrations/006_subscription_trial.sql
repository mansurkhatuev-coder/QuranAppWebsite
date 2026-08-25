-- Подписка / пробный период (30 дней) + platform-admin

alter table public.organizations
  add column if not exists is_active boolean not null default true,
  add column if not exists subscription_status text not null default 'trial'
    check (subscription_status in ('trial', 'active', 'expired', 'disabled')),
  add column if not exists trial_ends_at timestamptz,
  add column if not exists paid_until date,
  add column if not exists access_note text;

-- Существующим организациям даём месяц с момента миграции
update public.organizations
set
  is_active = coalesce(is_active, true),
  subscription_status = coalesce(nullif(subscription_status, ''), 'trial'),
  trial_ends_at = coalesce(trial_ends_at, now() + interval '30 days')
where trial_ends_at is null;

alter table public.organizations
  alter column trial_ends_at set default (now() + interval '30 days');

alter table public.profiles
  add column if not exists is_platform_admin boolean not null default false;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_platform_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.organization_has_access(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organizations o
    where o.id = org_id
      and o.is_active = true
      and (
        (o.subscription_status = 'trial' and o.trial_ends_at is not null and o.trial_ends_at > now())
        or (
          o.subscription_status = 'active'
          and (o.paid_until is null or o.paid_until >= (timezone('utc', now()))::date)
        )
      )
  );
$$;

create or replace function public.current_organization_has_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.organization_has_access(public.user_organization_id());
$$;

-- Создание org: сразу trial на 30 дней
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

  insert into public.organizations (
    name,
    is_active,
    subscription_status,
    trial_ends_at
  )
  values (
    trim(org_name),
    true,
    'trial',
    now() + interval '30 days'
  )
  returning id into new_org_id;

  insert into public.profiles (id, organization_id, full_name, role)
  values (uid, new_org_id, nullif(trim(user_full_name), ''), 'admin');

  insert into public.organization_settings (organization_id) values (new_org_id);

  return new_org_id;
end;
$$;

-- Обычный админ org не может менять поля подписки
create or replace function public.protect_organization_subscription_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_platform_admin() then
    return new;
  end if;

  new.is_active := old.is_active;
  new.subscription_status := old.subscription_status;
  new.trial_ends_at := old.trial_ends_at;
  new.paid_until := old.paid_until;
  new.access_note := old.access_note;
  return new;
end;
$$;

drop trigger if exists trg_protect_organization_subscription on public.organizations;
create trigger trg_protect_organization_subscription
  before update on public.organizations
  for each row
  execute function public.protect_organization_subscription_fields();

-- Platform RPCs
create or replace function public.platform_list_organizations()
returns table (
  id uuid,
  name text,
  created_at timestamptz,
  is_active boolean,
  subscription_status text,
  trial_ends_at timestamptz,
  paid_until date,
  access_note text,
  has_access boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Forbidden';
  end if;

  return query
  select
    o.id,
    o.name,
    o.created_at,
    o.is_active,
    o.subscription_status,
    o.trial_ends_at,
    o.paid_until,
    o.access_note,
    public.organization_has_access(o.id) as has_access
  from public.organizations o
  order by o.created_at desc;
end;
$$;

create or replace function public.platform_set_organization_access(
  p_org_id uuid,
  p_action text,
  p_months int default 1,
  p_note text default null
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  org public.organizations;
  months int := greatest(coalesce(p_months, 1), 1);
  base_date date;
begin
  if not public.is_platform_admin() then
    raise exception 'Forbidden';
  end if;

  select * into org from public.organizations where id = p_org_id for update;
  if not found then
    raise exception 'Organization not found';
  end if;

  if p_action = 'extend' then
    base_date := greatest(coalesce(org.paid_until, current_date), current_date);
    update public.organizations
    set
      is_active = true,
      subscription_status = 'active',
      paid_until = (base_date + make_interval(months => months))::date,
      access_note = coalesce(nullif(trim(p_note), ''), access_note)
    where id = p_org_id
    returning * into org;

  elsif p_action = 'deactivate' then
    update public.organizations
    set
      is_active = false,
      subscription_status = 'disabled',
      access_note = coalesce(nullif(trim(p_note), ''), access_note)
    where id = p_org_id
    returning * into org;

  elsif p_action = 'activate_trial' then
    update public.organizations
    set
      is_active = true,
      subscription_status = 'trial',
      trial_ends_at = now() + interval '30 days',
      access_note = coalesce(nullif(trim(p_note), ''), access_note)
    where id = p_org_id
    returning * into org;

  else
    raise exception 'Unknown action: %', p_action;
  end if;

  return org;
end;
$$;

grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.organization_has_access(uuid) to authenticated;
grant execute on function public.current_organization_has_access() to authenticated;
grant execute on function public.platform_list_organizations() to authenticated;
grant execute on function public.platform_set_organization_access(uuid, text, int, text) to authenticated;

-- RLS: данные org только при активном доступе
drop policy if exists "settings_select" on public.organization_settings;
drop policy if exists "settings_update" on public.organization_settings;
drop policy if exists "investors_all" on public.investors;
drop policy if exists "clients_all" on public.clients;
drop policy if exists "loans_all" on public.loans;
drop policy if exists "schedules_all" on public.payment_schedules;
drop policy if exists "payments_all" on public.payments;
drop policy if exists "guarantors_all" on public.loan_guarantors;

create policy "settings_select" on public.organization_settings
  for select using (
    organization_id = public.user_organization_id()
    and public.organization_has_access(organization_id)
  );

create policy "settings_update" on public.organization_settings
  for update using (
    organization_id = public.user_organization_id()
    and public.organization_has_access(organization_id)
  );

create policy "investors_all" on public.investors
  for all using (
    organization_id = public.user_organization_id()
    and public.organization_has_access(organization_id)
  )
  with check (
    organization_id = public.user_organization_id()
    and public.organization_has_access(organization_id)
  );

create policy "clients_all" on public.clients
  for all using (
    organization_id = public.user_organization_id()
    and public.organization_has_access(organization_id)
  )
  with check (
    organization_id = public.user_organization_id()
    and public.organization_has_access(organization_id)
  );

create policy "loans_all" on public.loans
  for all using (
    organization_id = public.user_organization_id()
    and public.organization_has_access(organization_id)
  )
  with check (
    organization_id = public.user_organization_id()
    and public.organization_has_access(organization_id)
  );

create policy "schedules_all" on public.payment_schedules
  for all using (
    organization_id = public.user_organization_id()
    and public.organization_has_access(organization_id)
  )
  with check (
    organization_id = public.user_organization_id()
    and public.organization_has_access(organization_id)
  );

create policy "payments_all" on public.payments
  for all using (
    organization_id = public.user_organization_id()
    and public.organization_has_access(organization_id)
  )
  with check (
    organization_id = public.user_organization_id()
    and public.organization_has_access(organization_id)
  );

create policy "guarantors_all" on public.loan_guarantors
  for all using (
    organization_id = public.user_organization_id()
    and public.organization_has_access(organization_id)
  )
  with check (
    organization_id = public.user_organization_id()
    and public.organization_has_access(organization_id)
  );

-- Чеки: тоже только при доступе
drop policy if exists "receipts_select_org" on storage.objects;
drop policy if exists "receipts_insert_org" on storage.objects;
drop policy if exists "receipts_update_org" on storage.objects;
drop policy if exists "receipts_delete_org" on storage.objects;

create policy "receipts_select_org"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = public.user_organization_id()::text
    and public.current_organization_has_access()
  );

create policy "receipts_insert_org"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = public.user_organization_id()::text
    and public.current_organization_has_access()
  );

create policy "receipts_update_org"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = public.user_organization_id()::text
    and public.current_organization_has_access()
  );

create policy "receipts_delete_org"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = public.user_organization_id()::text
    and public.current_organization_has_access()
  );

comment on column public.organizations.is_active is 'Ручной рубильник доступа';
comment on column public.organizations.subscription_status is 'trial | active | expired | disabled';
comment on column public.organizations.trial_ends_at is 'Конец пробного периода (обычно +30 дней)';
comment on column public.organizations.paid_until is 'Оплачено до этой даты (включительно)';
comment on column public.profiles.is_platform_admin is 'Владелец продукта: /platform';

-- После деплоя назначь себя platform-admin:
-- update public.profiles set is_platform_admin = true
-- where id = (select id from auth.users where email = 'YOUR_EMAIL');
