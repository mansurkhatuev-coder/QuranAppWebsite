-- Allow removing only loans with no recorded payment or receipt history.
drop policy if exists "loans_all" on public.loans;
drop policy if exists "loans_select" on public.loans;
drop policy if exists "loans_insert" on public.loans;
drop policy if exists "loans_update" on public.loans;
drop policy if exists "loans_delete_without_payment_history" on public.loans;

create policy "loans_select" on public.loans
  for select using (
    organization_id = public.user_organization_id()
    and public.organization_has_access(organization_id)
  );

create policy "loans_insert" on public.loans
  for insert with check (
    organization_id = public.user_organization_id()
    and public.organization_has_access(organization_id)
    and public.client_belongs_to_org(client_id, organization_id)
    and public.investor_belongs_to_org(investor_id, organization_id)
  );

create policy "loans_update" on public.loans
  for update
  using (
    organization_id = public.user_organization_id()
    and public.organization_has_access(organization_id)
  )
  with check (
    organization_id = public.user_organization_id()
    and public.organization_has_access(organization_id)
    and public.client_belongs_to_org(client_id, organization_id)
    and public.investor_belongs_to_org(investor_id, organization_id)
  );

create policy "loans_delete_without_payment_history" on public.loans
  for delete using (
    organization_id = public.user_organization_id()
    and public.organization_has_access(organization_id)
    and not exists (
      select 1 from public.payments p
      where p.loan_id = loans.id
        and p.organization_id = loans.organization_id
    )
    and not exists (
      select 1 from public.payment_schedules s
      where s.loan_id = loans.id
        and s.organization_id = loans.organization_id
        and (
          s.status = 'paid'
          or coalesce(s.paid_amount, 0) > 0
          or s.paid_at is not null
          or s.receipt_path is not null
        )
    )
  );

create or replace function public.delete_loan_without_payments(p_loan_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_organization_id uuid := public.user_organization_id();
  v_deleted_count int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_loan_id is null or v_organization_id is null
    or not public.organization_has_access(v_organization_id) then
    raise exception 'Organization access denied' using errcode = '42501';
  end if;

  perform l.id
  from public.loans l
  where l.id = p_loan_id
    and l.organization_id = v_organization_id
  for update;
  if not found then
    raise exception 'Loan not found';
  end if;

  perform s.id
  from public.payment_schedules s
  where s.loan_id = p_loan_id
    and s.organization_id = v_organization_id
  order by s.sequence_number
  for update;

  if exists (
    select 1 from public.payments p
    where p.loan_id = p_loan_id
      and p.organization_id = v_organization_id
  ) or exists (
    select 1 from public.payment_schedules s
    where s.loan_id = p_loan_id
      and s.organization_id = v_organization_id
      and (
        s.status = 'paid'
        or coalesce(s.paid_amount, 0) > 0
        or s.paid_at is not null
        or s.receipt_path is not null
      )
  ) then
    raise exception 'Нельзя удалить рассрочку: по ней есть оплаты или чеки. Закройте её, чтобы сохранить историю.'
      using errcode = '55000';
  end if;

  delete from public.loans l
  where l.id = p_loan_id
    and l.organization_id = v_organization_id;
  get diagnostics v_deleted_count = row_count;
  if v_deleted_count = 0 then
    raise exception 'Не удалось удалить рассрочку';
  end if;
end;
$$;

revoke all on function public.delete_loan_without_payments(uuid) from public;
revoke all on function public.delete_loan_without_payments(uuid) from anon;
grant execute on function public.delete_loan_without_payments(uuid) to authenticated;
