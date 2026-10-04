export const DEFAULT_CONTRACT_TEMPLATE = `! РАССРОЧКА
# ДОГОВОР КУПЛИ-ПРОДАЖИ ТОВАРА С ОПЛАТОЙ В РАССРОЧКУ
| г. __________ | № договора: __________ | Дата: {start_date} |
## СТОРОНЫ ДОГОВОРА
| ПРОДАВЕЦ | ПОКУПАТЕЛЬ |
| {organization}<br>Адрес: __________<br>Телефон: __________<br>Реквизиты: __________ | {client}<br>Телефон: {phone}<br>Поручитель: {guarantors} |
## ТОВАР И СТОИМОСТЬ
Товар: {product}
| Цена по договору | Первый взнос | Срок рассрочки |
| {amount} | {down_payment} | {term_months} месяцев |
## ГРАФИК ПЛАТЕЖЕЙ
| № | Дата платежа | Сумма | Подпись |
{payment_schedule}
Покупатель вправе досрочно оплатить оставшуюся сумму.
## УСЛОВИЯ ПРОСРОЧКИ
При просрочке платежей Продавец вправе требовать исполнения обязательств и применять способы защиты в случаях и порядке, предусмотренных законодательством. Возврат товара, взыскание задолженности и ответственность поручителя определяются законом и соглашением о поручительстве.
## ПОДПИСИ СТОРОН
| ПРОДАВЕЦ | ПОКУПАТЕЛЬ | ПОРУЧИТЕЛЬ |
| __________<br>Подпись / ФИО | __________<br>Подпись / ФИО | __________<br>Подпись / ФИО |`;

const LEGACY_DATABASE_DEFAULT_CONTRACT_TEMPLATE = `ДОГОВОР РАССРОЧКИ

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
Подпись организации: _______________`;

export function shouldUseDefaultContractSample(
  template: string | null | undefined
) {
  const normalizedTemplate = template?.replace(/\r\n?/g, "\n") ?? "";
  return (
    normalizedTemplate.trim().length === 0 ||
    normalizedTemplate === LEGACY_DATABASE_DEFAULT_CONTRACT_TEMPLATE
  );
}

export function formatPaymentScheduleForContract(
  schedules: { sequence_number: number; due_date: string; amount: number }[],
  formatDate: (date: string) => string,
  formatMoney: (amount: number) => string
) {
  if (schedules.length === 0) return "| — | — | — | — |";

  return schedules
    .map(
      (schedule) =>
        `| ${schedule.sequence_number} | ${formatDate(schedule.due_date)} | ${formatMoney(Number(schedule.amount))} | __________ |`
    )
    .join("\n");
}
