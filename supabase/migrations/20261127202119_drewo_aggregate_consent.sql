create schema if not exists drewo_private;
revoke all on schema drewo_private from public, anon, authenticated;

create table if not exists drewo_private.family_aggregate_consent_events (
  id bigint generated always as identity primary key,
  tree_dir text not null check (
    tree_dir ~ '^drewo(-[a-z0-9-]{1,48})?$'
    and tree_dir <> 'drewo-reklama'
  ),
  decision text not null check (decision in ('grant', 'revoke')),
  policy_version text not null check (policy_version = 'drewo-family-aggregate-v1'),
  actor_role text not null check (actor_role = 'editor'),
  session_fingerprint text not null check (session_fingerprint ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz not null default now()
);

create index if not exists family_aggregate_consent_events_current_idx
  on drewo_private.family_aggregate_consent_events (tree_dir, id desc);

alter table drewo_private.family_aggregate_consent_events enable row level security;
revoke all on drewo_private.family_aggregate_consent_events from public, anon, authenticated, service_role;

create or replace function public.drewo_family_aggregate_consent(
  p_tree_dir text default null,
  p_decision text default null,
  p_policy_version text default null,
  p_actor_role text default null,
  p_session_fingerprint text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_decision text;
  v_policy_version text;
  v_recorded_at timestamptz;
begin
  if p_tree_dir is null then
    if p_decision is not null or p_policy_version is not null
       or p_actor_role is not null or p_session_fingerprint is not null then
      raise exception 'Consent list does not accept decision fields';
    end if;
    return coalesce((
      select jsonb_agg(current.tree_dir order by current.tree_dir)
      from (
        select distinct on (event.tree_dir) event.tree_dir, event.decision
        from drewo_private.family_aggregate_consent_events as event
        order by event.tree_dir, event.id desc
      ) as current
      where current.decision = 'grant'
    ), '[]'::jsonb);
  end if;

  if p_tree_dir !~ '^drewo(-[a-z0-9-]{1,48})?$' or p_tree_dir = 'drewo-reklama' then
    raise exception 'Invalid family tree ID';
  end if;

  select event.decision, event.policy_version, event.recorded_at
    into v_decision, v_policy_version, v_recorded_at
  from drewo_private.family_aggregate_consent_events as event
  where event.tree_dir = p_tree_dir
  order by event.id desc
  limit 1;

  if p_decision is not null then
    if p_decision not in ('grant', 'revoke')
       or p_policy_version <> 'drewo-family-aggregate-v1'
       or p_actor_role <> 'editor'
       or p_session_fingerprint !~ '^[0-9a-f]{64}$' then
      raise exception 'Invalid family aggregate consent event';
    end if;

    if v_decision is distinct from p_decision
       or v_policy_version is distinct from p_policy_version then
      insert into drewo_private.family_aggregate_consent_events (
        tree_dir, decision, policy_version, actor_role, session_fingerprint
      ) values (
        p_tree_dir, p_decision, p_policy_version, p_actor_role, p_session_fingerprint
      );
      select event.decision, event.policy_version, event.recorded_at
        into v_decision, v_policy_version, v_recorded_at
      from drewo_private.family_aggregate_consent_events as event
      where event.tree_dir = p_tree_dir
      order by event.id desc
      limit 1;
    end if;
  elsif p_policy_version is not null or p_actor_role is not null or p_session_fingerprint is not null then
    raise exception 'Consent status does not accept event fields';
  end if;

  return jsonb_build_object(
    'consented', coalesce(v_decision = 'grant', false),
    'policyVersion', v_policy_version,
    'updatedAt', v_recorded_at
  );
end;
$$;

revoke all on function public.drewo_family_aggregate_consent(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.drewo_family_aggregate_consent(text, text, text, text, text)
  to service_role;
