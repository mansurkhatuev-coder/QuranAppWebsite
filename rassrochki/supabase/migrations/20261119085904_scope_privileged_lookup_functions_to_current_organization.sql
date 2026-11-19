-- Restrict privileged lookups to the caller's organization, platform administrator, or trusted backend.
CREATE OR REPLACE FUNCTION public.client_belongs_to_org(p_client_id uuid, p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((current_setting('role', true) not in ('anon', 'authenticated') or (p_org_id = public.user_organization_id()) or public.is_platform_admin()), false)
    and (exists (
    select 1 from public.clients c
    where c.id = p_client_id and c.organization_id = p_org_id
  ));
$function$;

CREATE OR REPLACE FUNCTION public.investor_belongs_to_org(p_investor_id uuid, p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((current_setting('role', true) not in ('anon', 'authenticated') or (p_org_id = public.user_organization_id()) or public.is_platform_admin()), false)
    and (p_investor_id is null or exists (
    select 1 from public.investors i
    where i.id = p_investor_id and i.organization_id = p_org_id
  ));
$function$;

CREATE OR REPLACE FUNCTION public.loan_belongs_to_org(p_loan_id uuid, p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((current_setting('role', true) not in ('anon', 'authenticated') or (p_org_id = public.user_organization_id()) or public.is_platform_admin()), false)
    and (exists (
    select 1 from public.loans l
    where l.id = p_loan_id and l.organization_id = p_org_id
  ));
$function$;

CREATE OR REPLACE FUNCTION public.organization_has_access(org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((current_setting('role', true) not in ('anon', 'authenticated') or (org_id = public.user_organization_id()) or public.is_platform_admin()), false)
    and (exists (
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
  ));
$function$;

CREATE OR REPLACE FUNCTION public.schedule_belongs_to_org(p_schedule_id uuid, p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((current_setting('role', true) not in ('anon', 'authenticated') or (p_org_id = public.user_organization_id()) or public.is_platform_admin()), false)
    and (p_schedule_id is null or exists (
    select 1 from public.payment_schedules s
    where s.id = p_schedule_id and s.organization_id = p_org_id
  ));
$function$;
