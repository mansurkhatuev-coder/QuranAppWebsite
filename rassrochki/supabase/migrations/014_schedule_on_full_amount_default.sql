-- Новые рассрочки: график на полную сумму к возврату по умолчанию.
alter table public.loans
  alter column schedule_on_full_amount set default true;

comment on column public.loans.schedule_on_full_amount is
  'true (по умолчанию): график от всей суммы (principal), взнос учитывается отдельно; false: график от principal - down_payment';
