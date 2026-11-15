create or replace function public.apply_offline_client_address(
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
  v_id uuid;
  v_expected_version bigint;
  v_current_version bigint;
  v_address text;
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
    'command_type', 'client.address',
    'payload', p_payload
  )::text);

  insert into public.offline_operation_log (
    operation_id, organization_id, actor_id, command_type, payload_hash
  ) values (
    p_operation_id, v_org_id, v_uid, 'client.address', v_payload_hash
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
      or v_log.command_type <> 'client.address'
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
    if nullif(p_payload->>'clientId', '') is null
      or nullif(p_payload->>'expectedVersion', '') is null
      or not (p_payload ? 'address')
      or jsonb_typeof(p_payload->'address') not in ('string', 'null') then
      raise exception 'Некорректные данные адреса клиента';
    end if;

    v_id := (p_payload->>'clientId')::uuid;
    v_expected_version := (p_payload->>'expectedVersion')::bigint;
    v_address := nullif(btrim(p_payload->>'address'), '');
    if v_address is not null and char_length(v_address) > 1000 then
      raise exception 'Адрес не может быть длиннее 1000 символов';
    end if;

    select offline_version into v_current_version
    from public.clients
    where id = v_id and organization_id = v_org_id
    for update;

    if not found then
      v_result := jsonb_build_object('status', 'conflict', 'message', 'Клиент не найден');
    elsif v_current_version <> v_expected_version then
      v_result := jsonb_build_object(
        'status', 'conflict',
        'message', 'Карточка клиента изменилась на другом устройстве'
      );
    else
      update public.clients
      set address = v_address
      where id = v_id and organization_id = v_org_id;

      select offline_version into v_current_version
      from public.clients
      where id = v_id and organization_id = v_org_id;
      v_result := jsonb_build_object(
        'status', 'synced',
        'client_id', v_id,
        'version', v_current_version,
        'address', v_address
      );
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

revoke all on function public.apply_offline_client_address(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_offline_client_address(uuid, jsonb) to authenticated;
