import { describe, expect, it } from "vitest";
import type { Loan, PaymentSchedule } from "@/types/database";
import { buildLoanEditSchedulePlan, hasLoanFinancialChanges } from "@/lib/loan-edit";

function schedule(id: string, sequence_number: number, amount: number): PaymentSchedule {
  return {
    id,
    loan_id: "loan-1",
    organization_id: "org-1",
    sequence_number,
    due_date: `2026-0${sequence_number}-01`,
    amount,
    status: "pending",
    paid_at: null,
    paid_amount: null,
    receipt_path: null,
  };
}

const loanTerms = (overrides: Partial<Loan> = {}): Pick<
  Loan,
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
  | "income_share_investor"
> => ({
  cost_amount: 1000,
  markup_percent: 20,
  principal: 1200,
  down_payment: 0,
  schedule_on_full_amount: true,
  term_months: 3,
  start_date: "2026-01-01",
  monthly_payment: 400,
  investor_id: null,
  investor_amount: null,
  income_share_manager: 100,
  income_share_investor: 0,
  ...overrides,
});

describe("loan edit", () => {
  it("rebuilds the whole schedule when no payment exists", () => {
    const result = buildLoanEditSchedulePlan({
      schedulePrincipal: 1200,
      termMonths: 3,
      startDate: "2026-01-01",
      monthlyPayment: 400,
      schedules: [schedule("old-1", 1, 400), schedule("old-2", 2, 400)],
      payments: [],
    });

    expect(result.preserveScheduleIds).toEqual([]);
    expect(result.deleteScheduleIds).toEqual(["old-1", "old-2"]);
    expect(result.insertSchedules).toHaveLength(3);
    expect(result.loanStatus).toBe("active");
  });

  it("keeps paid rows and distributes only the remaining principal", () => {
    const result = buildLoanEditSchedulePlan({
      schedulePrincipal: 1200,
      termMonths: 4,
      startDate: "2026-01-01",
      monthlyPayment: 0,
      schedules: [
        { ...schedule("paid-1", 1, 300), status: "paid", paid_amount: 300 },
        schedule("old-2", 2, 300),
        schedule("old-3", 3, 300),
        schedule("old-4", 4, 300),
      ],
      payments: [{ schedule_id: "paid-1", amount: 300 }],
    });

    expect(result.preserveScheduleIds).toEqual(["paid-1"]);
    expect(result.deleteScheduleIds).toEqual(["old-2", "old-3", "old-4"]);
    expect(result.insertSchedules.reduce((sum, row) => sum + row.amount, 0)).toBe(900);
  });

  it("keeps a partial row ID and carries its paid amount into the revised row", () => {
    const result = buildLoanEditSchedulePlan({
      schedulePrincipal: 1200,
      termMonths: 4,
      startDate: "2026-01-01",
      monthlyPayment: 0,
      schedules: [
        { ...schedule("paid-1", 1, 300), status: "paid", paid_amount: 300 },
        { ...schedule("partial-2", 2, 400), paid_amount: 100 },
        schedule("old-3", 3, 300),
        schedule("old-4", 4, 300),
      ],
      payments: [
        { schedule_id: "paid-1", amount: 300 },
        { schedule_id: "partial-2", amount: 100 },
      ],
    });

    expect(result.preserveScheduleIds).toEqual(["paid-1", "partial-2"]);
    expect(result.updatePartialSchedule?.id).toBe("partial-2");
    expect(result.updatePartialSchedule?.amount).toBeGreaterThan(100);
    expect(Math.round((result.insertSchedules.reduce((sum, row) => sum + row.amount, 0) +
      (result.updatePartialSchedule?.amount ?? 0) - 100) * 100) / 100).toBe(800);
  });

  it("uses linked payments when the schedule aggregate is missing", () => {
    const result = buildLoanEditSchedulePlan({
      schedulePrincipal: 1200,
      termMonths: 3,
      startDate: "2026-01-01",
      monthlyPayment: 0,
      schedules: [schedule("linked-1", 1, 400), schedule("old-2", 2, 400), schedule("old-3", 3, 400)],
      payments: [{ schedule_id: "linked-1", amount: 400 }],
    });

    expect(result.preserveScheduleIds).toContain("linked-1");
    expect(result.insertSchedules.reduce((sum, row) => sum + row.amount, 0)).toBe(800);
  });

  it("counts unlinked payments against the remaining schedule amount", () => {
    const result = buildLoanEditSchedulePlan({
      schedulePrincipal: 1200,
      termMonths: 3,
      startDate: "2026-01-01",
      monthlyPayment: 0,
      schedules: [schedule("old-1", 1, 400), schedule("old-2", 2, 400), schedule("old-3", 3, 400)],
      payments: [{ schedule_id: null, amount: 200 }],
    });

    expect(result.insertSchedules.reduce((sum, row) => sum + row.amount, 0)).toBe(1000);
  });

  it("preserves a receipt-only partial row when the revised balance is fully paid", () => {
    const receiptRow = {
      ...schedule("receipt-1", 1, 400),
      paid_amount: 100,
      receipt_path: "org-1/loan-1/receipt.jpg",
    };
    const result = buildLoanEditSchedulePlan({
      schedulePrincipal: 400,
      termMonths: 3,
      startDate: "2026-01-01",
      monthlyPayment: 0,
      schedules: [receiptRow, schedule("old-2", 2, 400), schedule("old-3", 3, 400)],
      payments: [{ schedule_id: null, amount: 300 }],
    });

    expect(result.preserveScheduleIds).toContain("receipt-1");
    expect(result.updatePartialSchedule?.amount).toBe(100);
    expect(result.insertSchedules).toEqual([]);
    expect(result.loanStatus).toBe("closed");
  });

  it("rejects a total below collected payments and a term before paid rows", () => {
    const paid = { ...schedule("paid-2", 2, 400), status: "paid" as const, paid_amount: 400 };
    expect(() => buildLoanEditSchedulePlan({
      schedulePrincipal: 399,
      termMonths: 3,
      startDate: "2026-01-01",
      monthlyPayment: 0,
      schedules: [paid],
      payments: [{ schedule_id: "paid-2", amount: 400 }],
    })).toThrow();

    expect(() => buildLoanEditSchedulePlan({
      schedulePrincipal: 1200,
      termMonths: 1,
      startDate: "2026-01-01",
      monthlyPayment: 0,
      schedules: [paid],
      payments: [{ schedule_id: "paid-2", amount: 400 }],
    })).toThrow();
  });

  it("reopens a closed loan if an edited amount creates a future balance", () => {
    const schedules = [1, 2, 3].map((sequence) => ({
      ...schedule(`paid-${sequence}`, sequence, 400),
      status: "paid" as const,
      paid_amount: 400,
    }));
    const result = buildLoanEditSchedulePlan({
      schedulePrincipal: 1500,
      termMonths: 4,
      startDate: "2026-01-01",
      monthlyPayment: 300,
      schedules,
      payments: schedules.map((row) => ({ schedule_id: row.id, amount: 400 })),
    });

    expect(result.loanStatus).toBe("active");
    expect(result.insertSchedules).toHaveLength(1);
    expect(result.insertSchedules[0].amount).toBe(300);
  });

  it("detects changes to financial terms", () => {
    expect(hasLoanFinancialChanges(loanTerms(), loanTerms())).toBe(false);
    expect(hasLoanFinancialChanges(loanTerms(), loanTerms({ markup_percent: 25 }))).toBe(true);
  });
});
