-- Первоначальный взнос: график считается от оставшейся суммы

alter table public.loans
  add column if not exists down_payment numeric(12, 2) not null default 0;

comment on column public.loans.down_payment is 'Первоначальный взнос; график = principal - down_payment';
comment on column public.loans.principal is 'Полная сумма к возврату (цена + наценка), до вычета взноса';
