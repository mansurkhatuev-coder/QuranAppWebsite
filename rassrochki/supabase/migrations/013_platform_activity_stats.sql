-- Platform: последний вход + число рассрочек

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
  has_access boolean,
  last_sign_in_at timestamptz,
  loans_count bigint,
  active_loans_count bigint
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
    public.organization_has_access(o.id) as has_access,
    (
      select max(u.last_sign_in_at)
      from public.profiles p
      join auth.users u on u.id = p.id
      where p.organization_id = o.id
    ) as last_sign_in_at,
    (
      select count(*)::bigint
      from public.loans l
      where l.organization_id = o.id
    ) as loans_count,
    (
      select count(*)::bigint
      from public.loans l
      where l.organization_id = o.id
        and coalesce(l.status, 'active') <> 'closed'
    ) as active_loans_count
  from public.organizations o
  order by last_sign_in_at desc nulls last, o.created_at desc;
end;
$$;

grant execute on function public.platform_list_organizations() to authenticated;
