-- Delete an installment and its full financial history in one database transaction.
-- The receipt object paths are returned so the client can remove the files from Storage.
-- Route all loan deletions through the explicitly confirmed, organization-scoped RPC.
drop policy if exists "loans_delete_without_payment_history" on public.loans;

create or replace function public.delete_loan_with_history(p_loan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid := public.user_organization_id();
  v_receipt_paths text[];
  v_deleted_count int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_loan_id is null or v_organization_id is null
    or not public.organization_has_access(v_organization_id) then
    raise exception 'Organization access denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.loans l
    where l.id = p_loan_id
      and l.organization_id = v_organization_id
  ) then
    raise exception 'Loan not found';
  end if;

  -- Match payment-entry lock order to avoid deadlocks with a concurrent payment.
  perform s.id
  from public.payment_schedules s
  where s.loan_id = p_loan_id
    and s.organization_id = v_organization_id
  order by s.sequence_number
  for update;

  perform l.id
  from public.loans l
  where l.id = p_loan_id
    and l.organization_id = v_organization_id
  for update;
  if not found then
    raise exception 'Loan not found';
  end if;

  perform p.id
  from public.payments p
  where p.loan_id = p_loan_id
    and p.organization_id = v_organization_id
  order by p.paid_at, p.id
  for update;

  select coalesce(
    array_agg(distinct receipt_path) filter (
      where receipt_path is not null and btrim(receipt_path) <> ''
    ),
    array[]::text[]
  )
  into v_receipt_paths
  from (
    select s.receipt_path as receipt_path
    from public.payment_schedules s
    where s.loan_id = p_loan_id
      and s.organization_id = v_organization_id
    union all
    select p.receipt_path
    from public.payments p
    where p.loan_id = p_loan_id
      and p.organization_id = v_organization_id
  ) receipts;

  -- Foreign-key cascades remove schedules, payments, and guarantors atomically.
  delete from public.loans l
  where l.id = p_loan_id
    and l.organization_id = v_organization_id;
  get diagnostics v_deleted_count = row_count;
  if v_deleted_count = 0 then
    raise exception 'Не удалось удалить рассрочку';
  end if;

  return jsonb_build_object('receipt_paths', to_jsonb(v_receipt_paths));
end;
$$;

revoke all on function public.delete_loan_with_history(uuid) from public;
revoke all on function public.delete_loan_with_history(uuid) from anon;
grant execute on function public.delete_loan_with_history(uuid) to authenticated;
