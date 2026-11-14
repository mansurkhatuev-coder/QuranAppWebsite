import { addMonths, format, parseISO } from "date-fns";
import type { Loan, Payment, PaymentSchedule } from "@/types/database";
import { buildSchedule } from "@/lib/utils";

const CENT = 0.01;

export type LoanFinancialField =
  | "cost_amount"
  | "markup_percent"
  | "principal"
  | "down_payment"
  | "schedule_on_full_amount"
  | "term_months"
  | "start_date"
  | "monthly_payment"
  | "investor_id"
  | "investor_amount"
  | "income_share_manager"
  | "income_share_investor";

export type LoanEditSchedulePlan = {
  preserveScheduleIds: string[];
  deleteScheduleIds: string[];
  updatePartialSchedule: {
    id: string;
    sequence_number: number;
    due_date: string;
    amount: number;
  } | null;
  insertSchedules: Array<{
    sequence_number: number;
    due_date: string;
    amount: number;
  }>;
  loanStatus: "active" | "closed";
};

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function paidOnSchedule(
  schedule: PaymentSchedule,
  paymentsBySchedule: Map<string, number>
): number {
  const schedulePaid = schedule.status === "paid"
    ? Number(schedule.paid_amount ?? schedule.amount)
    : Number(schedule.paid_amount ?? 0);
  return money(Math.max(schedulePaid, paymentsBySchedule.get(schedule.id) ?? 0));
}

function isFullyPaid(schedule: PaymentSchedule, paid: number): boolean {
  return schedule.status === "paid" || paid + CENT / 10 >= Number(schedule.amount);
}

export function buildLoanEditSchedulePlan(input: {
  schedulePrincipal: number;
  termMonths: number;
  startDate: string;
  monthlyPayment: number;
  schedules: PaymentSchedule[];
  payments: Array<Pick<Payment, "schedule_id" | "amount">>;
}): LoanEditSchedulePlan {
  const { schedulePrincipal, termMonths, startDate, monthlyPayment, schedules, payments } = input;
  if (!Number.isFinite(schedulePrincipal) || schedulePrincipal <= 0) {
    throw new Error("Сумма графика должна быть больше нуля");
  }
  if (!Number.isInteger(termMonths) || termMonths <= 0) {
    throw new Error("Срок рассрочки должен быть больше нуля");
  }
  if (!startDate || Number.isNaN(parseISO(startDate).getTime())) {
    throw new Error("Укажите корректную дату начала рассрочки");
  }

  const paymentsBySchedule = new Map<string, number>();
  for (const payment of payments) {
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error("В истории есть некорректная сумма оплаты");
    }
    if (payment.schedule_id) {
      paymentsBySchedule.set(
        payment.schedule_id,
        money((paymentsBySchedule.get(payment.schedule_id) ?? 0) + amount)
      );
    }
  }

  const sorted = [...schedules].sort(
    (a, b) => a.sequence_number - b.sequence_number || a.id.localeCompare(b.id)
  );
  const paidById = new Map(
    sorted.map((row) => [row.id, paidOnSchedule(row, paymentsBySchedule)])
  );
  const knownScheduleIds = new Set(sorted.map((row) => row.id));
  const scheduledCollected = sorted.reduce(
    (sum, row) => sum + (paidById.get(row.id) ?? 0),
    0
  );
  const unallocatedPayments = payments.reduce((sum, payment) => {
    return payment.schedule_id && knownScheduleIds.has(payment.schedule_id)
      ? sum
      : sum + Number(payment.amount);
  }, 0);
  const totalCollected = money(scheduledCollected + unallocatedPayments);
  if (totalCollected > schedulePrincipal + CENT / 10) {
    throw new Error("Новая сумма графика меньше уже полученных оплат");
  }

  let fullyPaidCount = 0;
  while (fullyPaidCount < sorted.length) {
    const row = sorted[fullyPaidCount];
    const paid = paidById.get(row.id) ?? 0;
    if (row.sequence_number !== fullyPaidCount + 1 || !isFullyPaid(row, paid)) break;
    fullyPaidCount += 1;
  }

  const remainingRows = sorted.slice(fullyPaidCount);
  const protectedRows = remainingRows.filter((row) => {
    const paid = paidById.get(row.id) ?? 0;
    return paid > 0 || Boolean(row.receipt_path) || paymentsBySchedule.has(row.id);
  });
  if (protectedRows.length > 1) {
    throw new Error("В графике несколько незакрытых платежей с оплатами. Исправьте график перед изменением.");
  }

  const partial = protectedRows[0] ?? null;
  if (partial && partial.sequence_number !== fullyPaidCount + 1) {
    throw new Error("Оплаты в графике идут с пропуском. Исправьте график перед изменением.");
  }
  if (termMonths < fullyPaidCount + (partial ? 1 : 0)) {
    throw new Error("Новый срок не может быть короче уже оплаченной части графика");
  }

  const remainingPrincipal = money(schedulePrincipal - totalCollected);
  const remainingSlotCount = termMonths - fullyPaidCount;
  if (remainingPrincipal > CENT / 10 && remainingSlotCount <= 0) {
    throw new Error("Новый срок не оставляет месяцев для неоплаченного остатка");
  }

  let rebuilt: Array<{ sequence_number: number; due_date: string; amount: number }> = [];
  if (remainingPrincipal > CENT / 10) {
    const shiftedStartDate = format(
      addMonths(parseISO(startDate), fullyPaidCount),
      "yyyy-MM-dd"
    );
    rebuilt = buildSchedule(
      remainingPrincipal,
      remainingSlotCount,
      shiftedStartDate,
      monthlyPayment
    )
      .map((row, index) => ({
        ...row,
        sequence_number: fullyPaidCount + index + 1,
        amount: money(row.amount),
      }))
      .filter((row) => row.amount > CENT / 10);
  }

  const partialPaid = partial ? paidById.get(partial.id) ?? 0 : 0;
  const partialSequence = fullyPaidCount + 1;
  const updatePartialSchedule = partial
    ? {
        id: partial.id,
        sequence_number: partialSequence,
        due_date: rebuilt[0]?.due_date ?? format(
          addMonths(parseISO(startDate), partialSequence),
          "yyyy-MM-dd"
        ),
        amount: money(partialPaid + (rebuilt[0]?.amount ?? 0)),
      }
    : null;
  const insertSchedules = rebuilt.slice(partial ? 1 : 0);
  const preserveScheduleIds = [
    ...sorted.slice(0, fullyPaidCount).map((row) => row.id),
    ...(partial ? [partial.id] : []),
  ];
  const preserveSet = new Set(preserveScheduleIds);

  return {
    preserveScheduleIds,
    deleteScheduleIds: sorted.filter((row) => !preserveSet.has(row.id)).map((row) => row.id),
    updatePartialSchedule,
    insertSchedules,
    loanStatus: remainingPrincipal > CENT / 10 ? "active" : "closed",
  };
}

export function hasLoanFinancialChanges(
  current: Pick<Loan, LoanFinancialField>,
  next: Pick<Loan, LoanFinancialField>
): boolean {
  const fields: LoanFinancialField[] = [
    "cost_amount",
    "markup_percent",
    "principal",
    "down_payment",
    "schedule_on_full_amount",
    "term_months",
    "start_date",
    "monthly_payment",
    "investor_id",
    "investor_amount",
    "income_share_manager",
    "income_share_investor",
  ];
  return fields.some((field) => current[field] !== next[field]);
}
