-- All Edge Function instances share the same password attempt budget.
create schema if not exists drewo_private;
revoke all on schema drewo_private from public, anon, authenticated;

create table if not exists drewo_private.password_attempts (
  bucket bigint not null,
  scope_key text not null,
  attempts integer not null default 0,
  primary key (bucket, scope_key)
);
revoke all on drewo_private.password_attempts from public, anon, authenticated;

create or replace function public.drewo_password_budget(
  p_client text, p_family text, p_pair text, p_refund_bucket bigint default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_sec bigint := floor(extract(epoch from clock_timestamp()));
  current_bucket bigint := now_sec / 900;
  scope_keys text[] := array[p_client, p_family, p_pair];
begin
  if p_client is null or p_family is null or p_pair is null
     or p_client !~ '^[0-9a-f]{64}$' or p_family !~ '^[0-9a-f]{64}$' or p_pair !~ '^[0-9a-f]{64}$'
     or p_client = p_family or p_client = p_pair or p_family = p_pair then
    raise exception 'Invalid password budget keys';
  end if;

  if p_refund_bucket is not null then
    perform 1 from drewo_private.password_attempts
    where bucket = p_refund_bucket and scope_key = any(scope_keys)
    order by scope_key for update;
    update drewo_private.password_attempts set attempts = greatest(attempts - 1, 0)
    where bucket = p_refund_bucket and scope_key = any(scope_keys);
    return '{}'::jsonb;
  end if;

  delete from drewo_private.password_attempts where (bucket, scope_key) in (
    select bucket, scope_key from drewo_private.password_attempts
    where bucket < current_bucket - 1 order by bucket, scope_key limit 64 for update skip locked
  );

  insert into drewo_private.password_attempts (bucket, scope_key)
  select current_bucket, key from unnest(scope_keys) as scopes(key) order by key
  on conflict do nothing;
  perform 1 from drewo_private.password_attempts
  where bucket = current_bucket and scope_key = any(scope_keys)
  order by scope_key for update;

  if exists (
    select 1 from drewo_private.password_attempts
    where bucket = current_bucket and scope_key = any(scope_keys)
      and attempts >= case scope_key when p_pair then 5 when p_client then 24 else 40 end
  ) then
    return jsonb_build_object('retry_after_sec', (current_bucket + 1) * 900 - now_sec);
  end if;

  update drewo_private.password_attempts set attempts = attempts + 1
  where bucket = current_bucket and scope_key = any(scope_keys);
  return jsonb_build_object('bucket', current_bucket, 'retry_after_sec', 0);
end;
$$;

revoke all on function public.drewo_password_budget(text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.drewo_password_budget(text, text, text, bigint) to service_role;
