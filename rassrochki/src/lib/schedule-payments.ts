import type { PaymentSchedule } from "@/types/database";

const EPS = 0.009;

export function scheduleDueRemaining(schedule: PaymentSchedule): number {
  if (schedule.status === "paid") return 0;
  const paid = Number(schedule.paid_amount ?? 0);
  return Math.max(0, Number(schedule.amount) - paid);
}

export function isScheduleFullyPaid(schedule: Pick<PaymentSchedule, "status" | "amount" | "paid_amount">): boolean {
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

/** Сумма уже зачтённая по графику (включая частичные и переплаты). */
export function sumSchedulePaid(schedules: SchedulePaidRow[]): number {
  return schedules.reduce((sum, s) => {
    if (s.status === "paid") return sum + Number(s.paid_amount ?? s.amount);
    return sum + Number(s.paid_amount ?? 0);
  }, 0);
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

  let surplus = totalAmount;
  const updates: SchedulePaymentUpdate[] = [];

  for (let i = startIdx; i < sorted.length && surplus > EPS; i++) {
    const row = sorted[i];
    const due = scheduleDueRemaining(row);
    if (due <= EPS) continue;

    const apply = Math.round(Math.min(surplus, due) * 100) / 100;
    const prevPaid = row.status === "paid" ? Number(row.paid_amount ?? row.amount) : Number(row.paid_amount ?? 0);
    const newPaid = Math.round((prevPaid + apply) * 100) / 100;
    const fullyPaid = newPaid + EPS >= Number(row.amount);

    updates.push({
      id: row.id,
      paid_amount: newPaid,
      status: fullyPaid ? "paid" : row.status === "overdue" ? "overdue" : "pending",
      paid_at: paidAtIso,
      receipt_path: row.id === startScheduleId ? receiptPath : row.receipt_path,
    });

    surplus = Math.round((surplus - apply) * 100) / 100;
  }

  return { updates, surplus: Math.max(0, surplus) };
}
