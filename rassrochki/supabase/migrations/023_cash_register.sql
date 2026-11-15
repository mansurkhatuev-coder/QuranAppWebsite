create table public.cash_transactions (
  id uuid primary key,
  operation_id uuid not null unique,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  transaction_type text not null check (transaction_type in (
    'opening_balance',
    'deposit',
    'owner_withdrawal',
    'expense',
    'investor_contribution',
    'investor_return'
  )),
  amount numeric(12, 2) not null check (
    amount >= 0 and (transaction_type = 'opening_balance' or amount > 0)
  ),
  occurred_at timestamptz not null,
  investor_id uuid references public.investors (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  constraint cash_transactions_notes_length check (notes is null or char_length(notes) <= 1000)
);

alter table public.payments
  add column cash_recorded_at timestamptz not null default now();

alter table public.loans
  add column down_payment_recorded_at timestamptz not null default now();

comment on column public.payments.cash_recorded_at is
  'When the payment was recorded by the application, independent of its selected paid_at date.';
comment on column public.loans.down_payment_recorded_at is
  'When the loan initial payment was recorded by the application.';

create index cash_transactions_org_occurred_idx
  on public.cash_transactions (organization_id, occurred_at desc, id);

create unique index cash_transactions_one_opening_balance
  on public.cash_transactions (organization_id)
  where transaction_type = 'opening_balance';

alter table public.cash_transactions enable row level security;
revoke all on table public.cash_transactions from public, anon, authenticated;
grant select on table public.cash_transactions to authenticated;

create policy "cash_transactions_select_org" on public.cash_transactions
  for select using (
    organization_id = public.user_organization_id()
    and public.organization_has_access(organization_id)
  );

create or replace function public.apply_offline_cash_transaction(
  p_operation_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org_id uuid := public.user_organization_id();
  v_payload_hash text;
  v_log public.offline_operation_log%rowtype;
  v_inserted int;
  v_result jsonb;
  v_entity jsonb;
  v_id uuid;
  v_type text;
  v_amount numeric;
  v_occurred_at timestamptz;
  v_investor_id uuid;
  v_notes text;
  v_error_message text;
  v_error_state text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if v_org_id is null or not public.organization_has_access(v_org_id) then
    raise exception 'Organization access denied' using errcode = '42501';
  end if;
  if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Invalid offline operation';
  end if;

  v_payload_hash := md5(jsonb_build_object(
    'command_type', 'cash.transaction.create',
    'payload', p_payload
  )::text);

  insert into public.offline_operation_log (
    operation_id, organization_id, actor_id, command_type, payload_hash
  ) values (
    p_operation_id, v_org_id, v_uid, 'cash.transaction.create', v_payload_hash
  )
  on conflict (operation_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select * into v_log
    from public.offline_operation_log
    where operation_id = p_operation_id
    for update;

    if v_log.actor_id <> v_uid
      or v_log.organization_id <> v_org_id
      or v_log.command_type <> 'cash.transaction.create'
      or v_log.payload_hash <> v_payload_hash then
      return jsonb_build_object(
        'status', 'conflict',
        'message', 'Идентификатор операции уже использован с другими данными'
      );
    end if;

    if v_log.result is null then
      raise exception 'Offline operation is still being processed' using errcode = '40001';
    end if;
    return v_log.result;
  end if;

  begin
    v_entity := p_payload->'transaction';
    if jsonb_typeof(v_entity) is distinct from 'object' then
      raise exception 'Некорректная кассовая операция';
    end if;

    v_id := nullif(v_entity->>'id', '')::uuid;
    v_type := nullif(v_entity->>'transaction_type', '');
    v_amount := nullif(v_entity->>'amount', '')::numeric;
    v_occurred_at := nullif(v_entity->>'occurred_at', '')::timestamptz;
    v_investor_id := nullif(v_entity->>'investor_id', '')::uuid;
    v_notes := nullif(btrim(v_entity->>'notes'), '');

    if v_id is null or v_type is null or v_type not in (
      'opening_balance', 'deposit', 'owner_withdrawal', 'expense',
      'investor_contribution', 'investor_return'
    ) or v_amount is null or v_amount < 0
      or (v_type <> 'opening_balance' and v_amount <= 0)
      or v_amount <> round(v_amount, 2)
      or v_amount > 9999999999.99 or v_occurred_at is null
      or (v_notes is not null and char_length(v_notes) > 1000) then
      raise exception 'Проверьте тип операции, сумму и заметку';
    end if;

    if v_type in ('investor_contribution', 'investor_return') then
      if v_investor_id is null or not exists (
        select 1 from public.investors
        where id = v_investor_id and organization_id = v_org_id
      ) then
        raise exception 'Выберите инвестора из этой организации';
      end if;
    elsif v_investor_id is not null then
      raise exception 'Инвестора можно указать только для инвесторской операции';
    end if;

    if v_type = 'opening_balance' and exists (
      select 1 from public.cash_transactions
      where organization_id = v_org_id and transaction_type = 'opening_balance'
    ) then
      raise exception 'Начальный остаток уже задан';
    end if;

    insert into public.cash_transactions (
      id, operation_id, organization_id, transaction_type, amount,
      occurred_at, investor_id, notes
    ) values (
      v_id, p_operation_id, v_org_id, v_type, v_amount,
      v_occurred_at, v_investor_id, v_notes
    );
    v_result := jsonb_build_object('status', 'synced', 'cash_transaction_id', v_id);
  exception
    when serialization_failure or deadlock_detected or lock_not_available or query_canceled then
      raise;
    when others then
      get stacked diagnostics
        v_error_message = message_text,
        v_error_state = returned_sqlstate;
      v_result := jsonb_build_object(
        'status', 'conflict',
        'message', case
          when v_error_state = 'P0001' then v_error_message
          when v_error_state = '23505' then 'Такая кассовая операция уже записана'
          else 'Не удалось сохранить кассовую операцию'
        end
      );
  end;

  update public.offline_operation_log
  set result = v_result
  where operation_id = p_operation_id
    and actor_id = v_uid
    and organization_id = v_org_id;

  return v_result;
end;
$$;

revoke all on function public.apply_offline_cash_transaction(uuid, jsonb) from public, anon;
grant execute on function public.apply_offline_cash_transaction(uuid, jsonb) to authenticated;
