-- Keep the legacy column for old clients and backups, but disable the mode in
-- all stored loans without changing existing payment schedule rows.
update public.loans
set schedule_on_full_amount = false
where schedule_on_full_amount;

alter table public.loans
  alter column schedule_on_full_amount set default false;

comment on column public.loans.schedule_on_full_amount is
  'Legacy compatibility only. The application always deducts down_payment from new and recalculated schedules.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'loans_schedule_on_full_amount_disabled'
      and conrelid = 'public.loans'::regclass
  ) then
    alter table public.loans
      add constraint loans_schedule_on_full_amount_disabled
      check (schedule_on_full_amount = false);
  end if;
end;
$$;
