import { addMonths, format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

export function formatMoney(value: number, currency = "RUB") {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(value: string) {
  return format(parseISO(value), "d MMM yyyy", { locale: ru });
}

export function formatDateShort(value: string) {
  return format(parseISO(value), "dd.MM.yyyy");
}

export function calcMonthlyPayment(principal: number, termMonths: number) {
  return Math.round((principal / termMonths) * 100) / 100;
}

/** Сумма к возврату: цена товара + наценка % */
export function calcTotalWithMarkup(costAmount: number, markupPercent: number) {
  return Math.round(costAmount * (1 + markupPercent / 100) * 100) / 100;
}

export function calcProfit(costAmount: number, markupPercent: number) {
  return Math.round(costAmount * (markupPercent / 100) * 100) / 100;
}

/**
 * Прибыль в уже оплаченной сумме.
 * Пример: товар 10000 + 30% → к возврату 13000; из 1300 оплаты прибыль ≈ 300.
 */
export function profitFromPaid(
  paidAmount: number,
  markupPercent: number,
  costAmount?: number | null,
  principal?: number | null
) {
  if (costAmount != null && principal != null && principal > 0) {
    const profit = Math.max(Number(principal) - Number(costAmount), 0);
    return Math.round(((paidAmount * profit) / Number(principal)) * 100) / 100;
  }
  if (!markupPercent || markupPercent <= 0) return 0;
  return Math.round(((paidAmount * markupPercent) / (100 + markupPercent)) * 100) / 100;
}

export const MARKUP_PRESETS = [20, 25, 30, 35, 40, 50] as const;

export function buildSchedule(
  principal: number,
  termMonths: number,
  startDate: string,
  monthlyOverride?: number
) {
  const base = monthlyOverride && monthlyOverride > 0
    ? monthlyOverride
    : calcMonthlyPayment(principal, termMonths);

  const items: { sequence_number: number; due_date: string; amount: number }[] = [];
  let remaining = principal;

  for (let i = 1; i <= termMonths; i += 1) {
    const amount =
      i === termMonths
        ? Math.round(remaining * 100) / 100
        : Math.min(base, Math.round(remaining * 100) / 100);
    remaining = Math.round((remaining - amount) * 100) / 100;

    items.push({
      sequence_number: i,
      due_date: format(addMonths(parseISO(startDate), i), "yyyy-MM-dd"),
      amount,
    });
  }

  return items;
}

export function splitIncome(amount: number, managerShare: number, investorShare: number) {
  const total = managerShare + investorShare || 100;
  const manager = Math.round(((amount * managerShare) / total) * 100) / 100;
  const investor = Math.round((amount - manager) * 100) / 100;
  return { manager, investor };
}

export function downloadCsv(filename: string, rows: string[][]) {
  const bom = "\uFEFF";
  const content =
    bom +
    rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")
      )
      .join("\n");

  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
