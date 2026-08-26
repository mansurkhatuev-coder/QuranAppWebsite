-- Режим графика: remaining = от суммы после взноса (по умолчанию), full = вся сумма к возврату.
alter table public.loans
  add column if not exists schedule_on_full_amount boolean not null default false;

comment on column public.loans.schedule_on_full_amount is
  'true: график от всей суммы (principal), взнос учитывается отдельно; false: график от principal - down_payment';
