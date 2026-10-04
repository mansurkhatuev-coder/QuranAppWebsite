-- Remove only the original system-provided template; customized organization templates remain intact.
update public.organization_settings
set contract_template = ''
where replace(
  replace(contract_template, E'\r\n', E'\n'),
  E'\r',
  E'\n'
) = $legacy$
ДОГОВОР РАССРОЧКИ

Организация: {organization}
Клиент: {client}
Телефон: {phone}
Сумма: {amount} ₽
Срок: {term_months} мес.
Ежемесячный платёж: {monthly_payment} ₽
Дата начала: {start_date}

График платежей:
{schedule}

Доли дохода: {manager_share}% / {investor_share}%
Инвестор: {investor}

Подпись клиента: _______________
Подпись организации: _______________$legacy$;

alter table public.organization_settings
  alter column contract_template set default '';
