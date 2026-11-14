-- Update loan terms, guarantors, and future schedule without deleting payment history.
create or replace function public.edit_loan_transaction(
  p_loan_id uuid,
  p_organization_id uuid,
  p_loan jsonb,
  p_partial_schedule jsonb,
  p_new_schedules jsonb,
  p_guarantors jsonb,
  p_expected_total numeric
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_loan public.loans%rowtype;
  v_partial_id uuid;
  v_partial_amount numeric(12, 2);
  v_partial_due_date date;
  v_partial_sequence int;
  v_collected numeric(12, 2);
  v_expected_remaining numeric(12, 2);
  v_schedule_remaining numeric(12, 2);
  v_max_preserved_sequence int;
  v_paid_schedule_count int;
  v_computed_total numeric(12, 2);
  v_payment numeric(12, 2);
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_loan_id is null or p_organization_id is null then
    raise exception 'Loan and organization are required';
  end if;
  if public.user_organization_id() is distinct from p_organization_id
    or not public.organization_has_access(p_organization_id) then
    raise exception 'Organization access denied' using errcode = '42501';
  end if;
  if jsonb_typeof(p_loan) is distinct from 'object'
    or jsonb_typeof(coalesce(p_new_schedules, '[]'::jsonb)) is distinct from 'array'
    or jsonb_typeof(coalesce(p_guarantors, '[]'::jsonb)) is distinct from 'array'
    or (p_partial_schedule is not null and jsonb_typeof(p_partial_schedule) is distinct from 'object') then
    raise exception 'Invalid loan edit payload';
  end if;

  select *
    into v_loan
  from public.loans l
  where l.id = p_loan_id
    and l.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'Loan not found';
  end if;

  perform s.id
  from public.payment_schedules s
  where s.loan_id = p_loan_id
    and s.organization_id = p_organization_id
  order by s.sequence_number
  for update;

  perform p.id
  from public.payments p
  where p.loan_id = p_loan_id
    and p.organization_id = p_organization_id
  for update;

  if nullif(p_loan->>'client_id', '') is null
    or not public.client_belongs_to_org((p_loan->>'client_id')::uuid, p_organization_id) then
    raise exception 'Client does not belong to the organization' using errcode = '42501';
  end if;
  if not public.investor_belongs_to_org(nullif(p_loan->>'investor_id', '')::uuid, p_organization_id) then
    raise exception 'Investor does not belong to the organization' using errcode = '42501';
  end if;
  if p_expected_total is null or p_expected_total <= 0 then
    raise exception 'Schedule total must be greater than zero';
  end if;

  v_computed_total := case
    when (p_loan->>'schedule_on_full_amount')::boolean then (p_loan->>'principal')::numeric
    else greatest(0, (p_loan->>'principal')::numeric - (p_loan->>'down_payment')::numeric)
  end;
  if abs(round(v_computed_total, 2) - round(p_expected_total, 2)) > 0.009 then
    raise exception 'Schedule total does not match loan terms';
  end if;

  -- Count each linked payment once, using the larger of the schedule aggregate
  -- and its payment rows; unlinked legacy payments are added separately.
  with schedule_totals as (
    select
      s.id,
      case when s.status = 'paid' then coalesce(s.paid_amount, s.amount)
        else coalesce(s.paid_amount, 0) end as schedule_paid,
      coalesce(sum(p.amount), 0) as linked_paid
    from public.payment_schedules s
    left join public.payments p
      on p.schedule_id = s.id
      and p.loan_id = s.loan_id
      and p.organization_id = s.organization_id
    where s.loan_id = p_loan_id
      and s.organization_id = p_organization_id
    group by s.id, s.status, s.paid_amount, s.amount
  ), unallocated as (
    select coalesce(sum(p.amount), 0) as amount
    from public.payments p
    where p.loan_id = p_loan_id
      and p.organization_id = p_organization_id
      and (
        p.schedule_id is null
        or not exists (
          select 1 from public.payment_schedules s
          where s.id = p.schedule_id
            and s.loan_id = p.loan_id
            and s.organization_id = p.organization_id
        )
      )
  )
  select round(
    coalesce((select sum(greatest(st.schedule_paid, st.linked_paid)) from schedule_totals st), 0)
      + (select u.amount from unallocated u),
    2
  ) into v_collected;
  v_collected := coalesce(v_collected, 0);

  if v_collected > p_expected_total + 0.009 then
    raise exception 'New schedule total is less than payments already received';
  end if;
  v_expected_remaining := greatest(0, round(p_expected_total - v_collected, 2));

  v_partial_id := nullif(p_partial_schedule->>'id', '')::uuid;
  if p_partial_schedule is not null then
    v_partial_amount := (p_partial_schedule->>'amount')::numeric;
    v_partial_due_date := (p_partial_schedule->>'due_date')::date;
    v_partial_sequence := (p_partial_schedule->>'sequence_number')::int;
    if v_partial_amount is null or v_partial_amount < 0
      or v_partial_due_date is null
      or v_partial_sequence is null
      or v_partial_sequence < 1
      or v_partial_sequence > (p_loan->>'term_months')::int then
      raise exception 'Invalid revised partial payment';
    end if;
    if not exists (
      select 1 from public.payment_schedules s
      where s.id = v_partial_id
        and s.loan_id = p_loan_id
        and s.organization_id = p_organization_id
        and s.status <> 'paid'
    ) then
      raise exception 'Partial schedule row is not editable';
    end if;
  end if;

  -- Remove only untouched schedule rows. Rows carrying payments, paid totals,
  -- a paid status, or the partial row's receipt remain in place.
  delete from public.payment_schedules s
  where s.loan_id = p_loan_id
    and s.organization_id = p_organization_id
    and s.status <> 'paid'
    and coalesce(s.paid_amount, 0) <= 0
    and s.receipt_path is null
    and s.id is distinct from v_partial_id
    and not exists (
      select 1 from public.payments p
      where p.schedule_id = s.id
        and p.loan_id = p_loan_id
        and p.organization_id = p_organization_id
    );

  -- Repair aggregate fields from the immutable payment ledger, without touching receipts.
  update public.payment_schedules s
  set paid_amount = greatest(
        coalesce(s.paid_amount, 0),
        coalesce(linked.amount, 0),
        case when s.status = 'paid' then s.amount else 0 end
      ),
      status = case
        when greatest(
          coalesce(s.paid_amount, 0),
          coalesce(linked.amount, 0),
          case when s.status = 'paid' then s.amount else 0 end
        ) + 0.009 >= s.amount then 'paid'
        when s.due_date < current_date then 'overdue'
        else 'pending'
      end
  from (
    select p.schedule_id, sum(p.amount) as amount
    from public.payments p
    where p.loan_id = p_loan_id
      and p.organization_id = p_organization_id
      and p.schedule_id is not null
    group by p.schedule_id
  ) linked
  where s.id = linked.schedule_id
    and s.loan_id = p_loan_id
    and s.organization_id = p_organization_id;

  select coalesce(max(s.sequence_number), 0), count(*)::int
    into v_max_preserved_sequence, v_paid_schedule_count
  from public.payment_schedules s
  where s.loan_id = p_loan_id
    and s.organization_id = p_organization_id
    and s.status = 'paid';
  if v_paid_schedule_count <> v_max_preserved_sequence then
    raise exception 'Paid schedule rows must form a continuous prefix';
  end if;
  if v_max_preserved_sequence > (p_loan->>'term_months')::int then
    raise exception 'New term is shorter than the paid schedule';
  end if;

  if v_partial_id is not null then
    select greatest(
      coalesce(s.paid_amount, 0),
      coalesce((
        select sum(p.amount)
        from public.payments p
        where p.schedule_id = s.id
          and p.loan_id = p_loan_id
          and p.organization_id = p_organization_id
      ), 0)
    )
      into v_payment
    from public.payment_schedules s
    where s.id = v_partial_id
      and s.loan_id = p_loan_id
      and s.organization_id = p_organization_id;
    v_payment := coalesce(v_payment, 0);
    if exists (
      select 1 from public.payment_schedules s
      where s.id = v_partial_id
        and s.status = 'paid'
    ) then
      raise exception 'Fully paid schedule rows cannot be resized';
    end if;
    if v_partial_amount + 0.009 < v_payment then
      raise exception 'Partial schedule amount is less than its recorded payments';
    end if;

    if v_partial_sequence <> v_max_preserved_sequence + 1 then
      raise exception 'Partial schedule row must follow paid rows';
    end if;
    if v_partial_sequence > (p_loan->>'term_months')::int then
      raise exception 'New term is shorter than the paid schedule';
    end if;
    if (
      select count(*)
      from public.payment_schedules s
      where s.loan_id = p_loan_id
        and s.organization_id = p_organization_id
        and s.status <> 'paid'
        and (
          coalesce(s.paid_amount, 0) > 0
          or s.receipt_path is not null
          or exists (
            select 1 from public.payments p
            where p.schedule_id = s.id
              and p.loan_id = p_loan_id
              and p.organization_id = p_organization_id
          )
        )
    ) > 1 then
      raise exception 'Only one unpaid schedule row may contain payments or a receipt';
    end if;

    update public.payment_schedules s
    set sequence_number = v_partial_sequence,
        due_date = v_partial_due_date,
        amount = v_partial_amount,
        paid_amount = v_payment,
        status = case
          when v_payment + 0.009 >= v_partial_amount then 'paid'
          when v_partial_due_date < current_date then 'overdue'
          else 'pending'
        end
    where s.id = v_partial_id
      and s.loan_id = p_loan_id
      and s.organization_id = p_organization_id;
  end if;

  select coalesce(max(s.sequence_number), 0)
    into v_max_preserved_sequence
  from public.payment_schedules s
  where s.loan_id = p_loan_id
    and s.organization_id = p_organization_id;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_new_schedules, '[]'::jsonb)) as n(
      sequence_number int,
      due_date date,
      amount numeric
    )
    where n.sequence_number is null
      or n.sequence_number <= v_max_preserved_sequence
      or n.sequence_number > (p_loan->>'term_months')::int
      or n.due_date is null
      or n.amount is null
      or n.amount <= 0
  ) then
    raise exception 'Invalid new schedule rows';
  end if;

  insert into public.payment_schedules (
    loan_id,
    organization_id,
    sequence_number,
    due_date,
    amount,
    status
  )
  select
    p_loan_id,
    p_organization_id,
    n.sequence_number,
    n.due_date,
    n.amount,
    'pending'
  from jsonb_to_recordset(coalesce(p_new_schedules, '[]'::jsonb)) as n(
    sequence_number int,
    due_date date,
    amount numeric
  );

  delete from public.loan_guarantors g
  where g.loan_id = p_loan_id
    and g.organization_id = p_organization_id;

  insert into public.loan_guarantors (
    loan_id,
    organization_id,
    full_name,
    phone,
    notes
  )
  select
    p_loan_id,
    p_organization_id,
    nullif(btrim(g.full_name), ''),
    nullif(btrim(g.phone), ''),
    nullif(btrim(g.notes), '')
  from jsonb_to_recordset(coalesce(p_guarantors, '[]'::jsonb)) as g(
    full_name text,
    phone text,
    notes text
  )
  where nullif(btrim(g.full_name), '') is not null;

  update public.loans l
  set client_id = (p_loan->>'client_id')::uuid,
      investor_id = nullif(p_loan->>'investor_id', '')::uuid,
      investor_amount = nullif(p_loan->>'investor_amount', '')::numeric,
      title = nullif(btrim(p_loan->>'title'), ''),
      cost_amount = nullif(p_loan->>'cost_amount', '')::numeric,
      markup_percent = (p_loan->>'markup_percent')::numeric,
      principal = (p_loan->>'principal')::numeric,
      down_payment = (p_loan->>'down_payment')::numeric,
      schedule_on_full_amount = (p_loan->>'schedule_on_full_amount')::boolean,
      term_months = (p_loan->>'term_months')::int,
      start_date = (p_loan->>'start_date')::date,
      monthly_payment = (p_loan->>'monthly_payment')::numeric,
      income_share_manager = (p_loan->>'income_share_manager')::numeric,
      income_share_investor = (p_loan->>'income_share_investor')::numeric,
      status = p_loan->>'status',
      notes = nullif(btrim(p_loan->>'notes'), '')
  where l.id = p_loan_id
    and l.organization_id = p_organization_id;

  select round(coalesce(sum(greatest(
      0,
      s.amount - case when s.status = 'paid' then coalesce(s.paid_amount, s.amount)
        else coalesce(s.paid_amount, 0) end
    )), 0), 2)
    into v_schedule_remaining
  from public.payment_schedules s
  where s.loan_id = p_loan_id
    and s.organization_id = p_organization_id;

  if abs(v_schedule_remaining - v_expected_remaining) > 0.009 then
    raise exception 'Revised schedule does not match the remaining loan balance';
  end if;
  if (v_expected_remaining > 0.009 and p_loan->>'status' <> 'active')
    or (v_expected_remaining <= 0.009 and p_loan->>'status' <> 'closed') then
    raise exception 'Loan status does not match the remaining schedule balance';
  end if;
end;
$$;

revoke all on function public.edit_loan_transaction(uuid, uuid, jsonb, jsonb, jsonb, jsonb, numeric) from public;
revoke all on function public.edit_loan_transaction(uuid, uuid, jsonb, jsonb, jsonb, jsonb, numeric) from anon;
grant execute on function public.edit_loan_transaction(uuid, uuid, jsonb, jsonb, jsonb, jsonb, numeric) to authenticated;
