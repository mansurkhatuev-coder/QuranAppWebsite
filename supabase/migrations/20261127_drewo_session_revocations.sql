create schema if not exists drewo_private;
revoke all on schema drewo_private from public, anon, authenticated;

create table if not exists drewo_private.revoked_family_sessions (
  session_key text primary key,
  expires_at bigint not null
);
revoke all on drewo_private.revoked_family_sessions from public, anon, authenticated;
create index if not exists revoked_family_sessions_expiry
  on drewo_private.revoked_family_sessions (expires_at);

-- An omitted expiry only checks the session. The Edge Function supplies
-- the signed expiry when it records a logout.
create or replace function public.drewo_family_session(
  p_session_key text, p_revoke_until bigint default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000);
begin
  if p_session_key is null or p_session_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid family session key';
  end if;

  if p_revoke_until is not null then
    delete from drewo_private.revoked_family_sessions where session_key in (
      select session_key from drewo_private.revoked_family_sessions
      where expires_at <= now_ms order by expires_at limit 64 for update skip locked
    );
    if p_revoke_until > now_ms then
      insert into drewo_private.revoked_family_sessions as revoked (session_key, expires_at)
      values (p_session_key, p_revoke_until)
      on conflict (session_key) do update
      set expires_at = greatest(revoked.expires_at, excluded.expires_at);
    end if;
    return true;
  end if;

  return exists (
    select 1 from drewo_private.revoked_family_sessions
    where session_key = p_session_key and expires_at > now_ms
  );
end;
$$;

revoke all on function public.drewo_family_session(text, bigint) from public, anon, authenticated;
grant execute on function public.drewo_family_session(text, bigint) to service_role;
