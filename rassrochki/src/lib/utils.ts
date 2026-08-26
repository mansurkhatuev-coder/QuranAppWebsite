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

/** Дата последнего платежа по графику: start + termMonths (как в buildSchedule). */
export function loanEndDate(startDate: string, termMonths: number) {
  const months = Math.max(0, Number(termMonths) || 0);
  if (!startDate || months <= 0) return null;
  return format(addMonths(parseISO(startDate), months), "yyyy-MM-dd");
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

/** Сумма в рассрочку после взноса */
export function calcFinancedAmount(totalWithMarkup: number, downPayment: number) {
  const down = Math.max(0, Number(downPayment) || 0);
  const financed = Math.round((totalWithMarkup - down) * 100) / 100;
  return Math.max(0, financed);
}

/**
 * База капитала для доли инвестора: цена товара минус взнос клиента.
 * Пример: товар 20 000, взнос 5 000 → 100% при вложении 15 000 (не 20 000).
 */
export function calcInvestorCapitalBase(costAmount: number, downPayment = 0) {
  const cost = Math.max(0, Number(costAmount) || 0);
  const down = Math.max(0, Number(downPayment) || 0);
  return Math.max(0, Math.round((cost - Math.min(down, cost)) * 100) / 100);
}

/** Вариант А: доля инвестора в прибыли = вложения / база капитала * 100 */
export function calcInvestorShareByCapital(investorAmount: number, capitalBase: number) {
  if (!capitalBase || capitalBase <= 0) return 0;
  const raw = (Number(investorAmount) / Number(capitalBase)) * 100;
  return Math.round(Math.min(100, Math.max(0, raw)) * 100) / 100;
}

/**
 * Сумма, от которой строится график платежей.
 * scheduleOnFullAmount: график на всю сумму к возврату; иначе — после взноса.
 */
export function calcSchedulePrincipal(
  totalWithMarkup: number,
  downPayment: number,
  scheduleOnFullAmount: boolean
) {
  if (scheduleOnFullAmount) return Math.max(0, Number(totalWithMarkup) || 0);
  return calcFinancedAmount(totalWithMarkup, downPayment);
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

/** Частые сроки рассрочки (мес). 12 = 1 год */
export const TERM_PRESETS = [
  { months: 3, label: "3 мес" },
  { months: 6, label: "6 мес" },
  { months: 8, label: "8 мес" },
  { months: 12, label: "1 год" },
] as const;

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
  const managerW = Number(managerShare) || 0;
  const investorW = Number(investorShare) || 0;
  // Оба нуля → вся сумма владельцу (не инвестору через остаток)
  if (managerW <= 0 && investorW <= 0) {
    const manager = Math.round(amount * 100) / 100;
    return { manager, investor: 0 };
  }
  const total = managerW + investorW;
  const manager = Math.round(((amount * managerW) / total) * 100) / 100;
  const investor = Math.round((amount - manager) * 100) / 100;
  return { manager, investor };
}

/**
 * RFC 4180-style CSV field: quote when value has comma, quote, CR/LF;
 * escape " as "". Numbers/dates without specials stay unquoted.
 */
export function escapeCsvField(value: unknown): string {
  const raw = value == null ? "" : String(value);
  if (/[",\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

/** UTF-8 CSV body with BOM once at the start (Excel-friendly). */
export function buildCsvContent(rows: unknown[][]): string {
  const body = rows
    .map((row) => row.map((cell) => escapeCsvField(cell)).join(","))
    .join("\r\n");
  return `\uFEFF${body}`;
}

export function downloadCsv(filename: string, rows: unknown[][]) {
  const content = buildCsvContent(rows);
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
