-- Наценка на товар, чёрный список клиентов

alter table public.clients
  add column if not exists is_blacklisted boolean not null default false;

alter table public.clients
  add column if not exists blacklist_note text;

alter table public.organization_settings
  add column if not exists default_markup_percent numeric(5, 2) not null default 30;

alter table public.loans
  add column if not exists cost_amount numeric(12, 2);

alter table public.loans
  add column if not exists markup_percent numeric(5, 2) not null default 30;

comment on column public.loans.cost_amount is 'Цена товара без наценки';
comment on column public.loans.markup_percent is 'Наценка % сверху (прибыль)';
comment on column public.loans.principal is 'Сумма к возврату клиентом = cost + наценка';
comment on column public.loans.income_share_manager is 'Доля владельца в прибыли, %';
comment on column public.loans.income_share_investor is 'Доля инвестора в прибыли, %';
