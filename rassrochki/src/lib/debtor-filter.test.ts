import { describe, expect, it } from "vitest";
import { classifyDebtSchedules } from "@/lib/debtor-filter";

describe("classifyDebtSchedules", () => {
  const schedule = (due_date: string, amount: number, paid_amount = 0) => ({
    due_date,
    amount,
    paid_amount,
    status: "pending" as const,
  });

  it("separates overdue, upcoming, and already covered schedules", () => {
    const result = classifyDebtSchedules([
      schedule("2026-11-01", 1_000, 200),
      schedule("2026-11-20", 800),
      schedule("2026-11-22", 500, 500),
    ], 3, "2026-11-15");

    expect(result.overdueAmount).toBe(800);
    expect(result.upcomingAmount).toBe(800);
    expect(result.remainingAmount).toBe(1_600);
  });

  it("uses the configured overdue grace days", () => {
    const result = classifyDebtSchedules([schedule("2026-11-12", 500)], 3, "2026-11-15");
    expect(result.overdueAmount).toBe(0);
    expect(result.upcomingAmount).toBe(0);
    expect(result.remainingAmount).toBe(500);
  });

  it("shows the upcoming date instead of a payment still in its grace period", () => {
    const result = classifyDebtSchedules([
      schedule("2026-11-14", 500),
      schedule("2026-11-18", 700),
    ], 3, "2026-11-15");

    expect(result.upcomingDate).toBe("2026-11-18");
    expect(result.nextDueDate).toBe("2026-11-14");
  });
});
