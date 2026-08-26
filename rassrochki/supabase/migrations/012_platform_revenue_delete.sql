-- Platform: доход с организации + удаление с защитами

alter table public.organizations
  add column if not exists platform_revenue numeric(12, 2) not null default 0
    check (platform_revenue >= 0);

comment on column public.organizations.platform_revenue is
  'Сколько владелец продукта получил от этой организации (сумма оплат за доступ)';

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
  new.platform_revenue := old.platform_revenue;
  return new;
end;
$$;

drop function if exists public.platform_list_organizations();

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
  platform_revenue numeric,
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
    o.platform_revenue,
    public.organization_has_access(o.id) as has_access
  from public.organizations o
  order by o.created_at desc;
end;
$$;

drop function if exists public.platform_set_organization_access(uuid, text, int, text);

create or replace function public.platform_set_organization_access(
  p_org_id uuid,
  p_action text,
  p_months int default 1,
  p_note text default null,
  p_payment_amount numeric default null
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
  pay numeric(12, 2) := greatest(coalesce(p_payment_amount, 0), 0);
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
      access_note = coalesce(nullif(trim(p_note), ''), access_note),
      platform_revenue = platform_revenue + pay
    where id = p_org_id
    returning * into org;

  elsif p_action = 'deactivate' then
    if not org.is_active or org.subscription_status = 'disabled' then
      raise exception 'Organization already disabled';
    end if;
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

  elsif p_action = 'set_revenue' then
    if p_payment_amount is null or p_payment_amount < 0 then
      raise exception 'Payment amount required';
    end if;
    update public.organizations
    set
      platform_revenue = p_payment_amount,
      access_note = coalesce(nullif(trim(p_note), ''), access_note)
    where id = p_org_id
    returning * into org;

  else
    raise exception 'Unknown action: %', p_action;
  end if;

  return org;
end;
$$;

create or replace function public.platform_delete_organization(
  p_org_id uuid,
  p_confirm_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org public.organizations;
begin
  if not public.is_platform_admin() then
    raise exception 'Forbidden';
  end if;

  select * into org from public.organizations where id = p_org_id for update;
  if not found then
    raise exception 'Organization not found';
  end if;

  if org.is_active and org.subscription_status <> 'disabled' then
    raise exception 'Disable organization before deleting';
  end if;

  if trim(coalesce(p_confirm_name, '')) is distinct from org.name then
    raise exception 'Confirm name mismatch';
  end if;

  -- profiles / settings / clients / loans … cascade from organizations
  delete from public.organizations where id = p_org_id;
end;
$$;

grant execute on function public.platform_list_organizations() to authenticated;
grant execute on function public.platform_set_organization_access(uuid, text, int, text, numeric) to authenticated;
grant execute on function public.platform_delete_organization(uuid, text) to authenticated;
