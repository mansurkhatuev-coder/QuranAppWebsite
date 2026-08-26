-- Запрет платежа больше общего остатка рассрочки.
-- Сохраняем атомарность, FOR UPDATE, idempotency и запрет повторной оплатыты стартовой строки.

create or replace function public.record_payment(
  p_schedule_id uuid,
  p_amount numeric(12, 2),
  p_paid_at timestamptz,
  p_method text default null,
  p_notes text default null,
  p_receipt_path text default null,
  p_idempotency_key text default null
)
returns table (
  payment_id uuid,
  loan_id uuid,
  applied_total numeric(12, 2),
  surplus numeric(12, 2),
  loan_closed boolean,
  idempotent_replay boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.user_organization_id();
  v_start public.payment_schedules%rowtype;
  v_row public.payment_schedules%rowtype;
  v_loan public.loans%rowtype;
  v_paid_at timestamptz := coalesce(p_paid_at, now());
  v_amount numeric(12, 2);
  v_left numeric(12, 2);
  v_apply numeric(12, 2);
  v_new_paid numeric(12, 2);
  v_financed numeric(12, 2);
  v_paid_total numeric(12, 2);
  v_loan_remaining numeric(12, 2) := 0;
  v_inserted_payment_id uuid;
  v_existing_payment public.payments%rowtype;
  v_eps constant numeric := 0.009;
  v_has_updates boolean := false;
begin
  if v_org_id is null then
    raise exception 'Not authenticated';
  end if;
  if p_schedule_id is null then
    raise exception 'Schedule is required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be > 0';
  end if;

  v_amount := round(p_amount::numeric, 2);

  if p_idempotency_key is not null and btrim(p_idempotency_key) <> '' then
    perform pg_advisory_xact_lock(hashtextextended(v_org_id::text || ':' || btrim(p_idempotency_key), 0));
    select *
      into v_existing_payment
    from public.payments p
    where p.organization_id = v_org_id
      and p.idempotency_key = btrim(p_idempotency_key)
    limit 1;

    if found then
      payment_id := v_existing_payment.id;
      loan_id := v_existing_payment.loan_id;
      applied_total := 0;
      surplus := 0;
      loan_closed := false;
      idempotent_replay := true;
      return next;
      return;
    end if;
  end if;

  select *
    into v_start
  from public.payment_schedules s
  where s.id = p_schedule_id
    and s.organization_id = v_org_id
  for update;

  if not found then
    raise exception 'Payment schedule not found';
  end if;

  select *
    into v_loan
  from public.loans l
  where l.id = v_start.loan_id
    and l.organization_id = v_org_id
  for update;

  if not found then
    raise exception 'Loan not found';
  end if;

  -- Блокируем ВСЕ строки графика займа до проверки лимита.
  perform 1
  from public.payment_schedules s
  where s.loan_id = v_start.loan_id
    and s.organization_id = v_org_id
  for update;

  if v_start.status = 'paid'
    or coalesce(v_start.paid_amount, 0) + v_eps >= v_start.amount then
    raise exception 'Стартовый платёж уже полностью оплачен';
  end if;

  select round(coalesce(sum(
    greatest(0, s.amount - case
      when s.status = 'paid' then coalesce(s.paid_amount, s.amount)
      else coalesce(s.paid_amount, 0)
    end)
  ), 0), 2)
    into v_loan_remaining
  from public.payment_schedules s
  where s.loan_id = v_start.loan_id
    and s.organization_id = v_org_id;

  if v_amount > v_loan_remaining + v_eps then
    raise exception
      using message = format(
        'Сумма превышает остаток рассрочки. Максимум: %s',
        to_char(v_loan_remaining, 'FM999999999990.00')
      );
  end if;

  v_left := v_amount;

  for v_row in
    select *
    from public.payment_schedules s
    where s.loan_id = v_start.loan_id
      and s.organization_id = v_org_id
      and s.sequence_number >= v_start.sequence_number
    order by s.sequence_number
  loop
    exit when v_left <= v_eps;

    v_apply := least(
      v_left,
      greatest(0, round(v_row.amount - coalesce(v_row.paid_amount, 0), 2))
    );
    if v_apply <= v_eps then
      continue;
    end if;

    v_new_paid := round(coalesce(v_row.paid_amount, 0) + v_apply, 2);

    update public.payment_schedules
      set
        paid_amount = v_new_paid,
        paid_at = v_paid_at,
        status = case
          when v_new_paid + v_eps >= v_row.amount then 'paid'
          when v_row.status = 'overdue' then 'overdue'
          else 'pending'
        end,
        receipt_path = case
          when v_row.id = v_start.id then p_receipt_path
          else receipt_path
        end
    where id = v_row.id
      and organization_id = v_org_id;

    v_has_updates := true;
    v_left := round(v_left - v_apply, 2);
  end loop;

  if not v_has_updates then
    raise exception 'Не удалось распределить оплату по графику';
  end if;

  -- После лимита по общему остатку свободный хвост недопустим.
  if v_left > v_eps then
    raise exception 'Не удалось распределить оплату по графику';
  end if;

  insert into public.payments (
    loan_id,
    organization_id,
    schedule_id,
    amount,
    paid_at,
    method,
    notes,
    receipt_path,
    idempotency_key
  ) values (
    v_start.loan_id,
    v_org_id,
    v_start.id,
    v_amount,
    v_paid_at,
    nullif(btrim(coalesce(p_method, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_receipt_path,
    nullif(btrim(coalesce(p_idempotency_key, '')), '')
  )
  returning id into v_inserted_payment_id;

  select round(sum(
    case
      when s.status = 'paid' then coalesce(s.paid_amount, s.amount)
      else coalesce(s.paid_amount, 0)
    end
  ), 2)
    into v_paid_total
  from public.payment_schedules s
  where s.loan_id = v_start.loan_id
    and s.organization_id = v_org_id;

  v_financed := round(greatest(0, v_loan.principal - coalesce(v_loan.down_payment, 0)), 2);

  if coalesce(v_paid_total, 0) + v_eps >= coalesce(v_financed, 0) then
    update public.loans
      set status = 'closed'
    where id = v_start.loan_id
      and organization_id = v_org_id;
    loan_closed := true;
  else
    loan_closed := false;
  end if;

  payment_id := v_inserted_payment_id;
  loan_id := v_start.loan_id;
  applied_total := v_amount;
  surplus := 0;
  idempotent_replay := false;
  return next;
end;
$$;

grant execute on function public.record_payment(
  uuid,
  numeric,
  timestamptz,
  text,
  text,
  text,
  text
) to authenticated;
