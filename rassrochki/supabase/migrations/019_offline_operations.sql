-- Durable command IDs make offline retries safe, while row versions detect edits
-- made on another device after the local snapshot was downloaded.

alter table public.clients
  add column if not exists offline_version bigint not null default 1;

alter table public.loans
  add column if not exists offline_version bigint not null default 1;

create or replace function public.bump_offline_row_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.offline_version := old.offline_version + 1;
  return new;
end;
$$;

drop trigger if exists clients_bump_offline_version on public.clients;
create trigger clients_bump_offline_version
before update on public.clients
for each row execute function public.bump_offline_row_version();

drop trigger if exists loans_bump_offline_version on public.loans;
create trigger loans_bump_offline_version
before update on public.loans
for each row execute function public.bump_offline_row_version();

-- Payments are loan edits for optimistic conflict detection.
create or replace function public.bump_loan_version_after_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.loans
  set offline_version = offline_version + 1
  where id = new.loan_id
    and organization_id = new.organization_id;
  return new;
end;
$$;

drop trigger if exists payments_bump_loan_offline_version on public.payments;
create trigger payments_bump_loan_offline_version
after insert on public.payments
for each row execute function public.bump_loan_version_after_payment();

revoke all on function public.bump_offline_row_version() from public;
revoke all on function public.bump_loan_version_after_payment() from public, anon, authenticated;

create table if not exists public.offline_operation_log (
  operation_id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_id uuid not null references auth.users (id) on delete cascade,
  command_type text not null,
  payload_hash text not null,
  result jsonb,
  created_at timestamptz not null default now()
);

alter table public.offline_operation_log enable row level security;
revoke all on table public.offline_operation_log from public, anon, authenticated;

create or replace function public.apply_offline_operation(
  p_operation_id uuid,
  p_command_type text,
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
  v_current_version bigint;
  v_expected_version bigint;
  v_term int;
  v_schedule_total numeric(12, 2);
  v_expected_schedule_total numeric(12, 2);
  v_schedule_count int;
  v_receipt_paths jsonb;
  v_payment record;
  v_error_message text;
  v_error_state text;
  v_schedule_id uuid;
  v_payment_loan_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if v_org_id is null or not public.organization_has_access(v_org_id) then
    raise exception 'Organization access denied' using errcode = '42501';
  end if;
  if p_operation_id is null or p_command_type is null or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Invalid offline operation';
  end if;

  v_payload_hash := md5(jsonb_build_object(
    'command_type', p_command_type,
    'payload', p_payload
  )::text);

  insert into public.offline_operation_log (
    operation_id, organization_id, actor_id, command_type, payload_hash
  ) values (
    p_operation_id, v_org_id, v_uid, p_command_type, v_payload_hash
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
      or v_log.command_type <> p_command_type
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
    if p_command_type = 'client.create' then
      v_entity := p_payload->'client';
      v_id := nullif(v_entity->>'id', '')::uuid;
      if jsonb_typeof(v_entity) is distinct from 'object'
        or v_id is null
        or nullif(btrim(v_entity->>'full_name'), '') is null then
        raise exception 'Некорректные данные клиента';
      end if;

      insert into public.clients (
        id, organization_id, full_name, phone, notes, is_blacklisted, blacklist_note
      ) values (
        v_id,
        v_org_id,
        btrim(v_entity->>'full_name'),
        nullif(btrim(coalesce(v_entity->>'phone', '')), ''),
        nullif(btrim(coalesce(v_entity->>'notes', '')), ''),
        false,
        null
      );
      v_result := jsonb_build_object('status', 'synced', 'client_id', v_id);

    elsif p_command_type = 'client.blacklist' then
      v_id := nullif(p_payload->>'clientId', '')::uuid;
      v_expected_version := nullif(p_payload->>'expectedVersion', '')::bigint;
      select offline_version into v_current_version
      from public.clients
      where id = v_id and organization_id = v_org_id
      for update;

      if not found then
        v_result := jsonb_build_object('status', 'conflict', 'message', 'Клиент не найден');
      elsif v_expected_version is null or v_current_version <> v_expected_version then
        v_result := jsonb_build_object('status', 'conflict', 'message', 'Карточка клиента изменилась на другом устройстве');
      else
        update public.clients
        set is_blacklisted = coalesce((p_payload->>'isBlacklisted')::boolean, false),
            blacklist_note = case
              when coalesce((p_payload->>'isBlacklisted')::boolean, false)
                then nullif(btrim(coalesce(p_payload->>'blacklistNote', '')), '')
              else null
            end
        where id = v_id and organization_id = v_org_id;
        select offline_version into v_current_version
        from public.clients where id = v_id and organization_id = v_org_id;
        v_result := jsonb_build_object('status', 'synced', 'client_id', v_id, 'version', v_current_version);
      end if;

    elsif p_command_type = 'client.delete' then
      v_id := nullif(p_payload->>'clientId', '')::uuid;
      v_expected_version := nullif(p_payload->>'expectedVersion', '')::bigint;
      select offline_version into v_current_version
      from public.clients
      where id = v_id and organization_id = v_org_id
      for update;

      if not found then
        v_result := jsonb_build_object('status', 'conflict', 'message', 'Клиент уже удалён или недоступен');
      elsif v_expected_version is null or v_current_version <> v_expected_version then
        v_result := jsonb_build_object('status', 'conflict', 'message', 'Карточка клиента изменилась на другом устройстве');
      elsif exists (
        select 1 from public.loans l
        where l.client_id = v_id and l.organization_id = v_org_id
      ) then
        v_result := jsonb_build_object('status', 'conflict', 'message', 'У клиента появились связанные рассрочки');
      else
        delete from public.clients where id = v_id and organization_id = v_org_id;
        v_result := jsonb_build_object('status', 'synced', 'client_id', v_id);
      end if;

    elsif p_command_type = 'loan.create' then
      v_entity := p_payload->'loan';
      v_id := nullif(v_entity->>'id', '')::uuid;
      v_term := nullif(v_entity->>'term_months', '')::int;
      if jsonb_typeof(v_entity) is distinct from 'object'
        or v_id is null
        or v_term is null or v_term < 1
        or nullif(v_entity->>'client_id', '') is null
        or nullif(v_entity->>'start_date', '') is null then
        raise exception 'Некорректные данные рассрочки';
      end if;
      if not public.client_belongs_to_org((v_entity->>'client_id')::uuid, v_org_id)
        or exists (
          select 1 from public.clients c
          where c.id = (v_entity->>'client_id')::uuid
            and c.organization_id = v_org_id
            and c.is_blacklisted
        ) then
        raise exception 'Клиент недоступен для новой рассрочки' using errcode = '42501';
      end if;
      if not public.investor_belongs_to_org(nullif(v_entity->>'investor_id', '')::uuid, v_org_id) then
        raise exception 'Инвестор не принадлежит организации' using errcode = '42501';
      end if;

      if jsonb_typeof(p_payload->'schedules') is distinct from 'array'
        or jsonb_typeof(coalesce(p_payload->'guarantors', '[]'::jsonb)) is distinct from 'array' then
        raise exception 'Некорректные график или поручители';
      end if;
      select count(*)::int, coalesce(sum((row->>'amount')::numeric), 0)
      into v_schedule_count, v_schedule_total
      from jsonb_array_elements(p_payload->'schedules') as item(row);
      v_expected_schedule_total := greatest(
        0,
        (v_entity->>'principal')::numeric - coalesce((v_entity->>'down_payment')::numeric, 0)
      );
      if v_schedule_count <> v_term
        or abs(round(v_schedule_total, 2) - round(v_expected_schedule_total, 2)) > 0.009 then
        raise exception 'Сумма графика не совпадает с условиями рассрочки';
      end if;

      insert into public.loans (
        id, organization_id, client_id, investor_id, title, cost_amount, markup_percent,
        principal, down_payment, schedule_on_full_amount, term_months, start_date,
        monthly_payment, income_share_manager, income_share_investor, investor_amount,
        status, notes
      ) values (
        v_id, v_org_id, (v_entity->>'client_id')::uuid,
        nullif(v_entity->>'investor_id', '')::uuid,
        nullif(btrim(coalesce(v_entity->>'title', '')), ''),
        nullif(v_entity->>'cost_amount', '')::numeric,
        coalesce(nullif(v_entity->>'markup_percent', '')::numeric, 0),
        (v_entity->>'principal')::numeric,
        coalesce(nullif(v_entity->>'down_payment', '')::numeric, 0),
        false,
        v_term, (v_entity->>'start_date')::date,
        (v_entity->>'monthly_payment')::numeric,
        coalesce(nullif(v_entity->>'income_share_manager', '')::numeric, 100),
        coalesce(nullif(v_entity->>'income_share_investor', '')::numeric, 0),
        nullif(v_entity->>'investor_amount', '')::numeric,
        'active', nullif(btrim(coalesce(v_entity->>'notes', '')), '')
      );

      for v_entity in select value from jsonb_array_elements(p_payload->'schedules') loop
        if jsonb_typeof(v_entity) is distinct from 'object'
          or nullif(v_entity->>'sequence_number', '')::int < 1
          or nullif(v_entity->>'sequence_number', '')::int > v_term
          or nullif(v_entity->>'due_date', '') is null
          or nullif(v_entity->>'amount', '')::numeric < 0 then
          raise exception 'Некорректная строка графика';
        end if;
        insert into public.payment_schedules (
          id, loan_id, organization_id, sequence_number, due_date, amount, status,
          paid_at, paid_amount, receipt_path
        ) values (
          coalesce(nullif(v_entity->>'id', '')::uuid, gen_random_uuid()),
          v_id, v_org_id,
          (v_entity->>'sequence_number')::int,
          (v_entity->>'due_date')::date,
          (v_entity->>'amount')::numeric,
          'pending', null, null, null
        );
      end loop;

      for v_entity in select value from jsonb_array_elements(coalesce(p_payload->'guarantors', '[]'::jsonb)) loop
        if jsonb_typeof(v_entity) is distinct from 'object'
          or nullif(btrim(coalesce(v_entity->>'full_name', '')), '') is null then
          raise exception 'Некорректные данные поручителя';
        end if;
        insert into public.loan_guarantors (
          id, loan_id, organization_id, full_name, phone, notes
        ) values (
          coalesce(nullif(v_entity->>'id', '')::uuid, gen_random_uuid()),
          v_id, v_org_id, btrim(v_entity->>'full_name'),
          nullif(btrim(coalesce(v_entity->>'phone', '')), ''),
          nullif(btrim(coalesce(v_entity->>'notes', '')), '')
        );
      end loop;
      v_result := jsonb_build_object('status', 'synced', 'loan_id', v_id, 'version', 1);

    elsif p_command_type = 'loan.edit' then
      v_id := nullif(p_payload->>'loanId', '')::uuid;
      v_expected_version := nullif(p_payload->>'expectedVersion', '')::bigint;
      select offline_version into v_current_version
      from public.loans
      where id = v_id and organization_id = v_org_id
      for update;

      if not found then
        v_result := jsonb_build_object('status', 'conflict', 'message', 'Рассрочка не найдена');
      elsif v_expected_version is null or v_current_version <> v_expected_version then
        v_result := jsonb_build_object('status', 'conflict', 'message', 'Рассрочка или оплаты изменились на другом устройстве');
      else
        perform public.edit_loan_transaction(
          v_id,
          v_org_id,
          p_payload->'loan',
          nullif(p_payload->'partialSchedule', 'null'::jsonb),
          coalesce(p_payload->'newSchedules', '[]'::jsonb),
          coalesce(p_payload->'guarantors', '[]'::jsonb),
          (p_payload->>'expectedTotal')::numeric
        );
        -- Preserve client-generated IDs for untouched new rows so a later queued
        -- payment can refer to the same schedule before and after synchronization.
        for v_entity in select value from jsonb_array_elements(coalesce(p_payload->'newSchedules', '[]'::jsonb)) loop
          v_schedule_id := nullif(v_entity->>'id', '')::uuid;
          if v_schedule_id is not null then
            update public.payment_schedules
            set id = v_schedule_id
            where loan_id = v_id
              and organization_id = v_org_id
              and sequence_number = (v_entity->>'sequence_number')::int;
          end if;
        end loop;
        select offline_version into v_current_version
        from public.loans where id = v_id and organization_id = v_org_id;
        v_result := jsonb_build_object('status', 'synced', 'loan_id', v_id, 'version', v_current_version);
      end if;

    elsif p_command_type = 'payment.record' then
      v_entity := p_payload->'payment';
      v_id := nullif(v_entity->>'schedule_id', '')::uuid;
      if jsonb_typeof(v_entity) is distinct from 'object'
        or v_id is null
        or (v_entity->>'amount')::numeric <= 0 then
        raise exception 'Некорректные данные оплаты';
      end if;
      select loan_id into v_payment_loan_id
      from public.payment_schedules
      where id = v_id and organization_id = v_org_id;
      if not found or v_payment_loan_id::text is distinct from (v_entity->>'loan_id') then
        raise exception 'Платёж не относится к указанной рассрочке';
      end if;
      if nullif(v_entity->>'receipt_path', '') is not null
        and (split_part(v_entity->>'receipt_path', '/', 1) <> v_org_id::text
          or split_part(v_entity->>'receipt_path', '/', 2) <> nullif(v_entity->>'loan_id', '')) then
        raise exception 'Путь чека не принадлежит рассрочке' using errcode = '42501';
      end if;
      select * into v_payment
      from public.record_payment(
        v_id,
        (v_entity->>'amount')::numeric,
        (v_entity->>'paid_at')::timestamptz,
        v_entity->>'method',
        v_entity->>'notes',
        nullif(v_entity->>'receipt_path', ''),
        p_operation_id::text
      );
      v_result := jsonb_build_object(
        'status', 'synced',
        'payment_id', v_payment.payment_id,
        'loan_id', v_payment.loan_id,
        'applied_total', v_payment.applied_total,
        'idempotent_replay', v_payment.idempotent_replay
      );

    elsif p_command_type = 'loan.delete' then
      v_id := nullif(p_payload->>'loanId', '')::uuid;
      v_expected_version := nullif(p_payload->>'expectedVersion', '')::bigint;
      -- Match payment/deletion lock order: schedules first, then the loan row.
      perform s.id
      from public.payment_schedules s
      where s.loan_id = v_id and s.organization_id = v_org_id
      order by s.sequence_number
      for update;
      select offline_version into v_current_version
      from public.loans
      where id = v_id and organization_id = v_org_id
      for update;

      if not found then
        v_result := jsonb_build_object('status', 'conflict', 'message', 'Рассрочка уже удалена или недоступна');
      elsif v_expected_version is null or v_current_version <> v_expected_version then
        v_result := jsonb_build_object('status', 'conflict', 'message', 'Рассрочка или оплаты изменились на другом устройстве');
      else
        v_receipt_paths := (public.delete_loan_with_history(v_id)->'receipt_paths');
        v_result := jsonb_build_object(
          'status', 'synced',
          'loan_id', v_id,
          'receipt_paths', coalesce(v_receipt_paths, '[]'::jsonb)
        );
      end if;

    else
      raise exception 'Unsupported offline operation';
    end if;
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
          else 'Операцию нельзя применить к текущей версии данных'
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

revoke all on function public.apply_offline_operation(uuid, text, jsonb) from public, anon;
grant execute on function public.apply_offline_operation(uuid, text, jsonb) to authenticated;
