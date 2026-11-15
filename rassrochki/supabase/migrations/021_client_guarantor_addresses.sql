alter table public.clients
  add column if not exists address text;

alter table public.loan_guarantors
  add column if not exists address text;

create or replace function public.replace_loan_guarantors(
  p_loan_id uuid,
  p_organization_id uuid,
  p_guarantors jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_loan_id is null or p_organization_id is null
    or public.user_organization_id() is distinct from p_organization_id
    or not public.organization_has_access(p_organization_id) then
    raise exception 'Organization access denied' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_guarantors, '[]'::jsonb)) is distinct from 'array' then
    raise exception 'Invalid guarantors';
  end if;
  if not exists (
    select 1 from public.loans
    where id = p_loan_id and organization_id = p_organization_id
  ) then
    raise exception 'Loan not found';
  end if;

  delete from public.loan_guarantors
  where loan_id = p_loan_id and organization_id = p_organization_id;

  insert into public.loan_guarantors (
    id, loan_id, organization_id, full_name, phone, address, notes
  )
  select
    coalesce(nullif(g.id, '')::uuid, gen_random_uuid()),
    p_loan_id,
    p_organization_id,
    nullif(btrim(g.full_name), ''),
    nullif(btrim(g.phone), ''),
    nullif(btrim(g.address), ''),
    nullif(btrim(g.notes), '')
  from jsonb_to_recordset(coalesce(p_guarantors, '[]'::jsonb)) as g(
    id text,
    full_name text,
    phone text,
    address text,
    notes text
  )
  where nullif(btrim(g.full_name), '') is not null;
end;
$$;

revoke all on function public.replace_loan_guarantors(uuid, uuid, jsonb) from public;
grant execute on function public.replace_loan_guarantors(uuid, uuid, jsonb) to authenticated;
