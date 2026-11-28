-- This counter is maintained by server-side code; clients must not mutate it.
-- Revoke explicit grants as well as the default PUBLIC grant.
do $$
begin
  if to_regprocedure('public.drewo_increment_visit(text)') is not null then
    execute 'revoke execute on function public.drewo_increment_visit(text) from public, anon, authenticated';
    execute 'grant execute on function public.drewo_increment_visit(text) to service_role';
  end if;
end;
$$;
