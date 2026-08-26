import { addDays, format } from "date-fns";

type OverdueInput = {
  dueDate: string;
  paidAmount?: number | null;
  amount: number;
  overdueDays: number;
  currentDate?: Date;
  status?: "pending" | "paid" | "overdue";
};

export function calculateOverdueStatus({
  dueDate,
  paidAmount,
  amount,
  overdueDays,
  currentDate = new Date(),
  status,
}: OverdueInput): "pending" | "paid" | "overdue" {
  if ((status === "paid") || (Number(paidAmount ?? 0) + 0.009 >= Number(amount))) {
    return "paid";
  }

  const grace = Math.max(0, Number(overdueDays) || 0);
  // ВАЖНО: сохраняем текущую семантику из dashboard (strict < cutoff).
  const cutoff = format(addDays(currentDate, -grace), "yyyy-MM-dd");
  return dueDate < cutoff ? "overdue" : "pending";
}

export function calculateOverdueCutoff(
  overdueDays: number,
  currentDate: Date = new Date()
) {
  const grace = Math.max(0, Number(overdueDays) || 0);
  return format(addDays(currentDate, -grace), "yyyy-MM-dd");
}

export async function syncOverdueSchedules(
  supabase: any,
  organizationId: string,
  overdueDays: number,
  currentDate: Date = new Date()
) {
  const overdueCutoff = calculateOverdueCutoff(overdueDays, currentDate);
  return supabase
    .from("payment_schedules")
    .update({ status: "overdue" })
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .lt("due_date", overdueCutoff);
}
