import { addDays, format, parseISO } from "date-fns";
import type { PaymentSchedule } from "@/types/database";

type DebtSchedule = Pick<PaymentSchedule, "due_date" | "amount" | "paid_amount" | "status">;

export type DebtScheduleSummary = {
  remainingAmount: number;
  overdueAmount: number;
  upcomingAmount: number;
  upcomingDate: string | null;
  nextDueDate: string | null;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function classifyDebtSchedules(
  schedules: DebtSchedule[],
  overdueDays: number,
  currentDate: Date | string = new Date(),
  upcomingDays = 7
): DebtScheduleSummary {
  const now = typeof currentDate === "string" ? parseISO(currentDate) : currentDate;
  const today = format(now, "yyyy-MM-dd");
  const overdueCutoff = format(addDays(now, -Math.max(0, overdueDays)), "yyyy-MM-dd");
  const upcomingThrough = format(addDays(now, Math.max(0, upcomingDays)), "yyyy-MM-dd");
  let remainingAmount = 0;
  let overdueAmount = 0;
  let upcomingAmount = 0;
  const unpaid: DebtSchedule[] = [];
  const upcomingDates: string[] = [];

  for (const schedule of schedules) {
    const remaining = schedule.status === "paid"
      ? 0
      : Math.max(0, Number(schedule.amount) - Number(schedule.paid_amount ?? 0));
    if (remaining <= 0.009) continue;
    remainingAmount += remaining;
    unpaid.push(schedule);
    if (schedule.due_date < overdueCutoff) overdueAmount += remaining;
    else if (schedule.due_date >= today && schedule.due_date <= upcomingThrough) {
      upcomingAmount += remaining;
      upcomingDates.push(schedule.due_date);
    }
  }

  return {
    remainingAmount: roundMoney(remainingAmount),
    overdueAmount: roundMoney(overdueAmount),
    upcomingAmount: roundMoney(upcomingAmount),
    upcomingDate: upcomingDates.sort()[0] ?? null,
    nextDueDate: unpaid.map((row) => row.due_date).sort()[0] ?? null,
  };
}
