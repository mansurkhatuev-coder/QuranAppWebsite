import { describe, expect, it } from "vitest";
import {
  buildSchedule,
  calcFinancedAmount,
  calcInvestorShareByCapital,
  calcMonthlyPayment,
  calcProfit,
  calcTotalWithMarkup,
  formatMoney,
  profitFromPaid,
  splitIncome,
} from "@/lib/utils";
import {
  capitalProgress,
  cashReceived,
  collectedAmount,
  collectionProgress,
  dealTotals,
  projectedRemaining,
  resolveProfitShares,
} from "@/lib/finance";
import {
  allocatePaymentToSchedules,
  assertPaymentWithinLoanRemaining,
  assertStartScheduleCanAcceptPayment,
  loanScheduleRemaining,
  scheduleDueRemaining,
  sumSchedulePaid,
} from "@/lib/schedule-payments";
import { calculateOverdueCutoff, calculateOverdueStatus } from "@/lib/overdue";
import type { PaymentSchedule } from "@/types/database";

const EPS = 0.009;

function moneyEq(a: number, b: number) {
  expect(Math.abs(a - b)).toBeLessThanOrEqual(EPS);
}

function scheduleSum(items: { amount: number }[]) {
  return Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
}

function makeScheduleRow(
  partial: Partial<PaymentSchedule> & Pick<PaymentSchedule, "id" | "sequence_number" | "amount">
): PaymentSchedule {
  return {
    loan_id: "loan",
    organization_id: "org",
    due_date: "2024-02-01",
    status: "pending",
    paid_at: null,
    paid_amount: null,
    receipt_path: null,
    ...partial,
  };
}

describe("Тест 1: 100 000 ₽ / 10% / взнос 0 / 10 мес", () => {
  it("цена + наценка = к возврату; график = задолженность", () => {
    const principal = calcTotalWithMarkup(100_000, 10);
    const profit = calcProfit(100_000, 10);
    const financed = calcFinancedAmount(principal, 0);
    const schedule = buildSchedule(financed, 10, "2024-01-15");

    moneyEq(principal, 110_000);
    moneyEq(profit, 10_000);
    moneyEq(financed, 110_000);
    moneyEq(scheduleSum(schedule), financed);
    expect(schedule).toHaveLength(10);
  });
});

describe("Тест 2: 100 000 ₽ / 30% / взнос 20 000 / 12 мес", () => {
  it("взнос вычитается один раз; сумма графика + взнос = principal", () => {
    const principal = calcTotalWithMarkup(100_000, 30);
    const financed = calcFinancedAmount(principal, 20_000);
    const schedule = buildSchedule(financed, 12, "2024-01-15");

    moneyEq(principal, 130_000);
    moneyEq(financed, 110_000);
    moneyEq(scheduleSum(schedule), financed);
    moneyEq(scheduleSum(schedule) + 20_000, principal);
  });
});

describe("Тест 3: 2 000 000 ₽ / 25% / взнос 500 000 / 6 мес", () => {
  it("компенсирует округление в последнем платеже", () => {
    const principal = calcTotalWithMarkup(2_000_000, 25);
    const financed = calcFinancedAmount(principal, 500_000);
    const schedule = buildSchedule(financed, 6, "2024-01-15");

    moneyEq(principal, 2_500_000);
    moneyEq(financed, 2_000_000);
    moneyEq(calcMonthlyPayment(financed, 6), 333_333.33);
    expect(schedule.slice(0, 5).every((s) => s.amount === 333_333.33)).toBe(true);
    expect(schedule[5].amount).toBe(333_333.35);
    moneyEq(scheduleSum(schedule), financed);
  });
});

describe("Округление / график = financed", () => {
  it.each([
    [100_000, 3],
    [100.01, 6],
    [1_999_999.98, 6],
    [99_999.99, 7],
  ])("financed=%s / %s мес → SUM(schedule) == financed", (financed, months) => {
    const schedule = buildSchedule(financed, months, "2024-01-15");
    moneyEq(scheduleSum(schedule), financed);
  });
});

describe("Down payment правила", () => {
  const loan = {
    cost_amount: 100_000,
    markup_percent: 30,
    principal: 130_000,
    down_payment: 30_000,
    investor_amount: 100_000,
    income_share_manager: 0,
    income_share_investor: 100,
  };

  it("1. уменьшает financed", () => {
    moneyEq(calcFinancedAmount(130_000, 30_000), 100_000);
    moneyEq(dealTotals(loan).financed, 100_000);
  });

  it("2. увеличивает collected", () => {
    moneyEq(collectedAmount(loan, 0), 30_000);
    moneyEq(collectedAmount(loan, 10_000), 40_000);
  });

  it("3. увеличивает earnedProfit пропорционально", () => {
    const proj = projectedRemaining(loan, 0);
    // 30000 * (30000/130000) ≈ 6923.08
    moneyEq(proj.earnedProfit, Math.round((30_000 * (30_000 / 130_000)) * 100) / 100);
    expect(proj.earnedProfit).toBeLessThanOrEqual(proj.profit + EPS);
  });

  it("4. НЕ увеличивает capitalReturned", () => {
    const proj = projectedRemaining(loan, 0);
    moneyEq(proj.capitalReturned, 0);
    moneyEq(capitalProgress(loan, 0), 0);
  });

  it("5. платёж по графику увеличивает capitalReturned", () => {
    const proj = projectedRemaining(loan, 50_000);
    // financed=100000, schedulePaid=50000 → 50% капитала
    moneyEq(proj.capitalReturned, 50_000);
    moneyEq(proj.capitalLeft, 50_000);
  });

  it("16. cash учитывает взнос ровно один раз", () => {
    moneyEq(cashReceived(loan, 0), 30_000);
    moneyEq(cashReceived(loan, 20_000), 50_000);
  });
});

describe("Прибыль / инвестор разделение", () => {
  const loan = {
    cost_amount: 2_000_000,
    markup_percent: 25,
    principal: 2_500_000,
    down_payment: 500_000,
    investor_amount: 2_000_000,
    income_share_manager: 0,
    income_share_investor: 100,
  };

  it("сразу после взноса: capitalReturned=0, earnedProfit>0", () => {
    const proj = projectedRemaining(loan, 0);
    moneyEq(proj.financed, 2_000_000);
    moneyEq(proj.capitalReturned, 0);
    moneyEq(proj.earnedProfit, Math.round((500_000 * (500_000 / 2_500_000)) * 100) / 100);
    moneyEq(proj.earnedInvestorProfit, proj.earnedProfit);
  });

  it("после 500k по графику: capitalReturned=500k", () => {
    const proj = projectedRemaining(loan, 500_000);
    moneyEq(proj.capitalReturned, 500_000);
    moneyEq(proj.capitalLeft, 1_500_000);
  });

  it("6. earnedProfit никогда не превышает profitTotal", () => {
    const over = projectedRemaining(loan, 9_999_999);
    expect(over.earnedProfit).toBeLessThanOrEqual(over.profit + EPS);
    moneyEq(over.earnedProfit, over.profit);
  });

  it("7. capitalReturned никогда не превышает investorAmount", () => {
    const over = projectedRemaining(loan, 9_999_999);
    expect(over.capitalReturned).toBeLessThanOrEqual(over.investorCapital + EPS);
    moneyEq(over.capitalReturned, 2_000_000);
  });
});

describe("Платежи: allocate / лимит остатка", () => {
  const base = [
    makeScheduleRow({ id: "1", sequence_number: 1, amount: 20_000 }),
    makeScheduleRow({ id: "2", sequence_number: 2, amount: 20_000 }),
    makeScheduleRow({ id: "3", sequence_number: 3, amount: 20_000 }),
  ];

  it("17. частичная оплата 10k из 20k", () => {
    const first = allocatePaymentToSchedules(base, "1", 10_000, "t1", null);
    expect(first.updates[0]).toMatchObject({
      id: "1",
      paid_amount: 10_000,
      status: "pending",
    });
    moneyEq(scheduleDueRemaining({ ...base[0], ...first.updates[0] }), 10_000);
  });

  it("два частичных 10k + 10k", () => {
    const first = allocatePaymentToSchedules(base, "1", 10_000, "t1", null);
    const after = base.map((s) => (s.id === "1" ? { ...s, ...first.updates[0] } : s));
    const second = allocatePaymentToSchedules(after, "1", 10_000, "t2", null);
    expect(second.updates[0]).toMatchObject({
      id: "1",
      paid_amount: 20_000,
      status: "paid",
    });
  });

  it("9. один платёж закрывает несколько schedules", () => {
    const r = allocatePaymentToSchedules(base, "1", 45_000, "t", null);
    expect(r.updates).toHaveLength(3);
    expect(r.updates[0]).toMatchObject({ id: "1", status: "paid", paid_amount: 20_000 });
    expect(r.updates[1]).toMatchObject({ id: "2", status: "paid", paid_amount: 20_000 });
    expect(r.updates[2]).toMatchObject({ id: "3", status: "pending", paid_amount: 5_000 });
    moneyEq(r.surplus, 0);
  });

  it("8/10. платёж больше общего остатка полностью отклоняется", () => {
    expect(() => assertPaymentWithinLoanRemaining(40_001, 40_000)).toThrow(/Максимум/);
    expect(() => allocatePaymentToSchedules(base, "1", 60_001, "t", null)).toThrow(/Максимум/);
  });

  it("разрешены суммы <= общего остатка", () => {
    for (const amount of [10_000, 20_000, 30_000, 40_000, 60_000]) {
      expect(() => assertPaymentWithinLoanRemaining(amount, 60_000)).not.toThrow();
    }
    const full = allocatePaymentToSchedules(base, "1", 60_000, "t", null);
    expect(full.updates.every((u) => u.status === "paid")).toBe(true);
    moneyEq(full.surplus, 0);
  });

  it("15. повторная оплата paid start отклоняется (не переносится)", () => {
    const paidFirst = base.map((s) =>
      s.id === "1" ? { ...s, status: "paid" as const, paid_amount: 20_000 } : s
    );
    expect(() => assertStartScheduleCanAcceptPayment(paidFirst[0])).toThrow(
      "Стартовый платёж уже полностью оплачен"
    );
    expect(() => allocatePaymentToSchedules(paidFirst, "1", 20_000, "t", null)).toThrow(
      "Стартовый платёж уже полностью оплачен"
    );
  });

  it("H1: оплата не с самой ранней неоплаченной строки отклоняется", () => {
    expect(() => allocatePaymentToSchedules(base, "2", 20_000, "t", null)).toThrow(
      /ближайшего платежа #1/
    );
  });

  it("H1: после закрытия #1 можно платить #2", () => {
    const afterFirst = base.map((s) =>
      s.id === "1" ? { ...s, status: "paid" as const, paid_amount: 20_000 } : s
    );
    const r = allocatePaymentToSchedules(afterFirst, "2", 20_000, "t", null);
    expect(r.updates[0]).toMatchObject({ id: "2", status: "paid", paid_amount: 20_000 });
  });

  it("14. двойной параллельный снимок не увеличивает paid_amount выше amount", () => {
    const a = allocatePaymentToSchedules(base, "1", 20_000, "t", null);
    const b = allocatePaymentToSchedules(base, "1", 20_000, "t", null);
    moneyEq(a.updates[0].paid_amount, 20_000);
    moneyEq(b.updates[0].paid_amount, 20_000);
    expect(40_000).not.toBe(a.updates[0].paid_amount);
  });

  it("loanScheduleRemaining считает общий остаток", () => {
    moneyEq(loanScheduleRemaining(base), 60_000);
    const after = allocatePaymentToSchedules(base, "1", 25_000, "t", null);
    const next = base.map((s) => {
      const u = after.updates.find((x) => x.id === s.id);
      return u ? { ...s, ...u } : s;
    });
    moneyEq(loanScheduleRemaining(next), 35_000);
  });
});

describe("Overdue 0–4 (семантика не менялась)", () => {
  it.each([
    { overdueDays: 0, currentDate: "2024-06-10T12:00:00Z", cutoff: "2024-06-10", overdueFrom: "2024-06-09" },
    { overdueDays: 1, currentDate: "2024-06-10T12:00:00Z", cutoff: "2024-06-09", overdueFrom: "2024-06-08" },
    { overdueDays: 2, currentDate: "2024-06-10T12:00:00Z", cutoff: "2024-06-08", overdueFrom: "2024-06-07" },
    { overdueDays: 3, currentDate: "2024-06-10T12:00:00Z", cutoff: "2024-06-07", overdueFrom: "2024-06-06" },
    { overdueDays: 4, currentDate: "2024-06-10T12:00:00Z", cutoff: "2024-06-06", overdueFrom: "2024-06-05" },
  ])(
    "overdueDays=$overdueDays: cutoff=$cutoff",
    ({ overdueDays, currentDate, cutoff, overdueFrom }) => {
      const now = new Date(currentDate);
      expect(calculateOverdueCutoff(overdueDays, now)).toBe(cutoff);
      expect(
        calculateOverdueStatus({
          dueDate: cutoff,
          paidAmount: 0,
          amount: 20_000,
          overdueDays,
          currentDate: now,
        })
      ).toBe("pending");
      expect(
        calculateOverdueStatus({
          dueDate: overdueFrom,
          paidAmount: 0,
          amount: 20_000,
          overdueDays,
          currentDate: now,
        })
      ).toBe("overdue");
    }
  );

  it("due=25, overdue_days=3 → overdue с 29", () => {
    for (const day of [25, 26, 27, 28]) {
      expect(
        calculateOverdueStatus({
          dueDate: "2024-06-25",
          paidAmount: 0,
          amount: 1,
          overdueDays: 3,
          currentDate: new Date(`2024-06-${day}T12:00:00Z`),
        })
      ).toBe("pending");
    }
    expect(
      calculateOverdueStatus({
        dueDate: "2024-06-25",
        paidAmount: 0,
        amount: 1,
        overdueDays: 3,
        currentDate: new Date("2024-06-29T12:00:00Z"),
      })
    ).toBe("overdue");
  });
});

describe("Инвестор доли / split", () => {
  it("70/30, 100/0, 0/100", () => {
    moneyEq(splitIncome(30_000, 30, 70).investor, 21_000);
    moneyEq(splitIncome(30_000, 0, 100).investor, 30_000);
    moneyEq(splitIncome(30_000, 100, 0).investor, 0);
  });

  it("доля по капиталу = вложил / себестоимость", () => {
    moneyEq(calcInvestorShareByCapital(70_000, 100_000), 70);
  });

  it("сохранённые доли — источник истины", () => {
    const s = resolveProfitShares({
      cost_amount: 100_000,
      markup_percent: 30,
      principal: 130_000,
      investor_amount: 10_000,
      income_share_manager: 40,
      income_share_investor: 60,
    });
    expect(s.mode).toBe("manual");
    expect(s.manager).toBe(40);
    expect(s.investor).toBe(60);
  });
});

describe("formatMoney", () => {
  it("форматирует целые и копейки", () => {
    expect(formatMoney(100_000)).toMatch(/100/);
    expect(formatMoney(100_000.5)).toMatch(/50/);
    expect(formatMoney(100_000.50000001)).not.toMatch(/000001/);
  });
});

describe("даты графика", () => {
  it("25 января → 25 февраля → 25 марта", () => {
    const s = buildSchedule(3_000, 3, "2024-01-25");
    expect(s.map((x) => x.due_date)).toEqual([
      "2024-02-25",
      "2024-03-25",
      "2024-04-25",
    ]);
  });
});

describe("collectionProgress vs capitalProgress", () => {
  it("взнос влияет на collection, но не на capital", () => {
    const loan = {
      cost_amount: 100_000,
      markup_percent: 30,
      principal: 130_000,
      down_payment: 30_000,
      investor_amount: 100_000,
      income_share_manager: 30,
      income_share_investor: 70,
    };
    moneyEq(collectionProgress(loan, 0), 30_000 / 130_000);
    moneyEq(capitalProgress(loan, 0), 0);
    moneyEq(capitalProgress(loan, 50_000), 0.5);
  });
});

describe("profitFromPaid", () => {
  it("пропорционален principal − cost", () => {
    moneyEq(profitFromPaid(13_000, 30, 100_000, 130_000), 3_000);
  });
});
