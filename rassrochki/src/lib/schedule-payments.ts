import type { PaymentSchedule } from "@/types/database";
import { formatMoney } from "@/lib/utils";

const EPS = 0.009;

export function scheduleDueRemaining(
  schedule: Pick<PaymentSchedule, "status" | "amount" | "paid_amount">
): number {
  if (schedule.status === "paid") return 0;
  const paid = Number(schedule.paid_amount ?? 0);
  return Math.max(0, Number(schedule.amount) - paid);
}

export function isScheduleFullyPaid(
  schedule: Pick<PaymentSchedule, "status" | "amount" | "paid_amount">
): boolean {
  if (schedule.status === "paid") return true;
  return Number(schedule.paid_amount ?? 0) + EPS >= Number(schedule.amount);
}

export function assertStartScheduleCanAcceptPayment(
  schedule: Pick<PaymentSchedule, "status" | "amount" | "paid_amount">
) {
  if (isScheduleFullyPaid(schedule)) {
    throw new Error("Стартовый платёж уже полностью оплачен");
  }
}

export type SchedulePaidRow = Pick<PaymentSchedule, "status" | "amount" | "paid_amount">;

/** Сумма уже зачтённая по графику (включая частичные). */
export function sumSchedulePaid(schedules: SchedulePaidRow[]): number {
  return Math.round(
    schedules.reduce((sum, s) => {
      if (s.status === "paid") return sum + Number(s.paid_amount ?? s.amount);
      return sum + Number(s.paid_amount ?? 0);
    }, 0) * 100
  ) / 100;
}

/** Общий остаток всей рассрочки по графику. */
export function loanScheduleRemaining(schedules: SchedulePaidRow[]): number {
  return Math.round(
    schedules.reduce((sum, s) => sum + scheduleDueRemaining(s), 0) * 100
  ) / 100;
}

export function assertPaymentWithinLoanRemaining(amount: number, loanRemaining: number) {
  const max = Math.round(Math.max(0, loanRemaining) * 100) / 100;
  const pay = Math.round(Number(amount) * 100) / 100;
  if (pay > max + EPS) {
    throw new Error(
      `Сумма превышает остаток рассрочки. Максимум: ${formatMoney(max)}`
    );
  }
}

export type SchedulePaymentUpdate = {
  id: string;
  status: PaymentSchedule["status"];
  paid_amount: number;
  paid_at: string;
  receipt_path: string | null;
};

/**
 * Распределяет сумму платежа: сначала закрывает текущую строку, остаток — на следующие.
 * Переплата сверх общего остатка рассрочки запрещена (полная отказ, без обрезки).
 */
export function allocatePaymentToSchedules(
  schedules: PaymentSchedule[],
  startScheduleId: string,
  totalAmount: number,
  paidAtIso: string,
  receiptPath: string | null
): { updates: SchedulePaymentUpdate[]; surplus: number } {
  const sorted = [...schedules].sort((a, b) => a.sequence_number - b.sequence_number);
  const startIdx = sorted.findIndex((s) => s.id === startScheduleId);
  if (startIdx < 0) {
    return { updates: [], surplus: totalAmount };
  }

  const start = sorted[startIdx];
  assertStartScheduleCanAcceptPayment(start);

  const loanRemaining = loanScheduleRemaining(sorted);
  assertPaymentWithinLoanRemaining(totalAmount, loanRemaining);

  let left = Math.round(totalAmount * 100) / 100;
  const updates: SchedulePaymentUpdate[] = [];

  for (let i = startIdx; i < sorted.length && left > EPS; i++) {
    const row = sorted[i];
    const due = scheduleDueRemaining(row);
    if (due <= EPS) continue;

    const apply = Math.round(Math.min(left, due) * 100) / 100;
    const prevPaid =
      row.status === "paid"
        ? Number(row.paid_amount ?? row.amount)
        : Number(row.paid_amount ?? 0);
    const newPaid = Math.round((prevPaid + apply) * 100) / 100;
    const fullyPaid = newPaid + EPS >= Number(row.amount);

    updates.push({
      id: row.id,
      paid_amount: newPaid,
      status: fullyPaid ? "paid" : row.status === "overdue" ? "overdue" : "pending",
      paid_at: paidAtIso,
      receipt_path: row.id === startScheduleId ? receiptPath : row.receipt_path,
    });

    left = Math.round((left - apply) * 100) / 100;
  }

  if (updates.length === 0) {
    throw new Error("Не удалось распределить оплату по графику");
  }

  // После проверки общего остатка хвоста быть не должно.
  if (left > EPS) {
    throw new Error("Не удалось распределить оплату по графику");
  }

  return { updates, surplus: 0 };
}
