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
  collectionProgress,
  dealTotals,
  projectedRemaining,
  resolveProfitShares,
} from "@/lib/finance";
import {
  allocatePaymentToSchedules,
  scheduleDueRemaining,
  sumSchedulePaid,
} from "@/lib/schedule-payments";
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
  const cost = 100_000;
  const markup = 10;
  const down = 0;
  const months = 10;

  it("цена + наценка = к возврату; график = задолженность", () => {
    const principal = calcTotalWithMarkup(cost, markup);
    const profit = calcProfit(cost, markup);
    const financed = calcFinancedAmount(principal, down);
    const schedule = buildSchedule(financed, months, "2024-01-15");

    moneyEq(principal, 110_000);
    moneyEq(profit, 10_000);
    moneyEq(financed, 110_000);
    moneyEq(scheduleSum(schedule), financed);
    expect(schedule).toHaveLength(10);
    expect(schedule.every((s) => s.amount === 11_000)).toBe(true);
  });
});

describe("Тест 2: 100 000 ₽ / 30% / взнос 20 000 / 12 мес", () => {
  it("взнос вычитается один раз; сумма графика + взнос = principal", () => {
    const cost = 100_000;
    const markup = 30;
    const down = 20_000;
    const months = 12;

    const principal = calcTotalWithMarkup(cost, markup);
    const financed = calcFinancedAmount(principal, down);
    const schedule = buildSchedule(financed, months, "2024-01-15");

    moneyEq(principal, 130_000);
    moneyEq(financed, 110_000);
    moneyEq(scheduleSum(schedule), financed);
    moneyEq(scheduleSum(schedule) + down, principal);
    // остаток копеек уходит в последний платёж
    expect(schedule[0].amount).toBe(9166.67);
    expect(schedule[11].amount).toBe(9166.63);
  });
});

describe("Тест 3: 2 000 000 ₽ / 25% / взнос 500 000 / 6 мес", () => {
  it("компенсирует округление в последнем платеже (333333.33 × 6)", () => {
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

describe("Тест 4: сумма плохо делится на месяцы", () => {
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

describe("down_payment границы", () => {
  const principal = 110_000;

  it("down_payment = 0 → financed = principal", () => {
    moneyEq(calcFinancedAmount(principal, 0), principal);
  });

  it("down_payment < total → положительная задолженность", () => {
    moneyEq(calcFinancedAmount(principal, 20_000), 90_000);
  });

  it("down_payment = total → financed = 0 (создание рассрочки должно быть отклонено UI)", () => {
    moneyEq(calcFinancedAmount(principal, principal), 0);
  });

  it("down_payment > total → financed = 0, без отрицательной задолженности", () => {
    moneyEq(calcFinancedAmount(principal, principal + 10_000), 0);
    expect(calcFinancedAmount(principal, principal + 10_000)).toBeGreaterThanOrEqual(0);
  });
});

describe("Тест 5–8: частичная / полная / переплата / повтор", () => {
  const base = [
    makeScheduleRow({ id: "1", sequence_number: 1, amount: 20_000 }),
    makeScheduleRow({ id: "2", sequence_number: 2, amount: 20_000 }),
    makeScheduleRow({ id: "3", sequence_number: 3, amount: 20_000 }),
  ];

  it("Тест 5: 10 000 + 10 000 закрывают платёж 20 000", () => {
    const first = allocatePaymentToSchedules(base, "1", 10_000, "t1", null);
    expect(first.updates[0]).toMatchObject({
      id: "1",
      paid_amount: 10_000,
      status: "pending",
    });
    moneyEq(scheduleDueRemaining({ ...base[0], ...first.updates[0] }), 10_000);

    const after = base.map((s) =>
      s.id === "1" ? { ...s, ...first.updates[0] } : s
    );
    const second = allocatePaymentToSchedules(after, "1", 10_000, "t2", null);
    expect(second.updates[0]).toMatchObject({
      id: "1",
      paid_amount: 20_000,
      status: "paid",
    });
    moneyEq(sumSchedulePaid([{ ...after[0], ...second.updates[0] }, after[1], after[2]]), 20_000);
  });

  it("Тест 6: полная оплата одной строки", () => {
    const r = allocatePaymentToSchedules(base, "1", 20_000, "t", null);
    expect(r.updates).toHaveLength(1);
    expect(r.updates[0].status).toBe("paid");
    moneyEq(r.surplus, 0);
  });

  it("Тест 7: переплата 25 000 на платёж 20 000 зачитывается на следующий", () => {
    const r = allocatePaymentToSchedules(base, "1", 25_000, "t", null);
    expect(r.updates).toHaveLength(2);
    expect(r.updates[0]).toMatchObject({ id: "1", paid_amount: 20_000, status: "paid" });
    expect(r.updates[1]).toMatchObject({ id: "2", paid_amount: 5_000, status: "pending" });
    moneyEq(r.surplus, 0);
  });

  it("Тест 8a: повторное allocate с одного снимка (race) не увеличивает paid_amount выше amount", () => {
    const a = allocatePaymentToSchedules(base, "1", 20_000, "t", null);
    const b = allocatePaymentToSchedules(base, "1", 20_000, "t", null);
    moneyEq(a.updates[0].paid_amount, 20_000);
    moneyEq(b.updates[0].paid_amount, 20_000);
    // Инвариант UI/API должен гарантировать: 2× insert payments ≠ 2× учёт в графике.
    // Сейчас клиент записывает оба payment, а schedule overwrite → расхождение.
    const fakePaymentsTotal = 20_000 + 20_000;
    const schedulePaid = a.updates[0].paid_amount;
    expect(fakePaymentsTotal).not.toBe(schedulePaid);
  });

  it("Тест 8b: оплата уже закрытой строки со stale-состоянием переносит сумму на СЛЕДУЮЩИЙ платёж", () => {
    const paidFirst = base.map((s) =>
      s.id === "1" ? { ...s, status: "paid" as const, paid_amount: 20_000 } : s
    );
    const r = allocatePaymentToSchedules(paidFirst, "1", 20_000, "t", null);
    expect(r.updates[0]?.id).toBe("2");
    expect(r.updates[0]?.status).toBe("paid");
  });

  it("сверх всех строк → surplus сохраняется (деньги в payments, не в графике)", () => {
    const r = allocatePaymentToSchedules(base, "1", 70_000, "t", null);
    moneyEq(r.surplus, 10_000);
    moneyEq(
      sumSchedulePaid(
        base.map((s) => {
          const u = r.updates.find((x) => x.id === s.id);
          return u ? { ...s, ...u } : s;
        })
      ),
      60_000
    );
  });
});

describe("Тест 9: просрочка — семантика cutoff (как на dashboard)", () => {
  function isOverdue(dueDate: string, today: string, graceDays: number) {
    // dashboard: .lt("due_date", format(addDays(today, -grace)))
    const t = new Date(`${today}T12:00:00Z`);
    const cutoff = new Date(t);
    cutoff.setUTCDate(cutoff.getUTCDate() - graceDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return dueDate < cutoffStr;
  }

  it("grace=3: на 3-й день после due ещё НЕ overdue; на 4-й — да", () => {
    // due 2024-06-12, today 2024-06-15 → days past = 3
    expect(isOverdue("2024-06-12", "2024-06-15", 3)).toBe(false);
    expect(isOverdue("2024-06-11", "2024-06-15", 3)).toBe(true);
  });

  it.each([0, 1, 2, 3, 4])("grace=%s: due == cutoff не overdue (строгое <)", (grace) => {
    const due = "2024-06-10";
    const todayDate = new Date(`${due}T12:00:00Z`);
    todayDate.setUTCDate(todayDate.getUTCDate() + grace);
    const today = todayDate.toISOString().slice(0, 10);
    expect(isOverdue(due, today, grace)).toBe(false);
  });
});

describe("Тест 10–12: инвестор 70% / 100% / 0%", () => {
  const profit = 30_000;

  it("70/30 split от прибыли", () => {
    const s = splitIncome(profit, 30, 70);
    moneyEq(s.manager, 9_000);
    moneyEq(s.investor, 21_000);
  });

  it("инвестор 100%", () => {
    const s = splitIncome(profit, 0, 100);
    moneyEq(s.manager, 0);
    moneyEq(s.investor, 30_000);
  });

  it("инвестор 0%", () => {
    const s = splitIncome(profit, 100, 0);
    moneyEq(s.manager, 30_000);
    moneyEq(s.investor, 0);
  });

  it("доля по капиталу = вложил / себестоимость", () => {
    moneyEq(calcInvestorShareByCapital(70_000, 100_000), 70);
    moneyEq(calcInvestorShareByCapital(100_000, 100_000), 100);
    moneyEq(calcInvestorShareByCapital(0, 100_000), 0);
  });

  it("dealTotals: прибыль = principal − cost; доли от прибыли, не от всей суммы", () => {
    const totals = dealTotals({
      cost_amount: 100_000,
      markup_percent: 30,
      principal: 130_000,
      down_payment: 20_000,
      investor_amount: 70_000,
      income_share_manager: 30,
      income_share_investor: 70,
    });
    moneyEq(totals.profit, 30_000);
    moneyEq(totals.financed, 110_000);
    moneyEq(totals.ownerProfit, 9_000);
    moneyEq(totals.investorProfit, 21_000);
    moneyEq(totals.investorExpectedTotal, 70_000 + 21_000);
  });
});

describe("даты графика (addMonths)", () => {
  it("25 января → 25 февраля → 25 марта", () => {
    const s = buildSchedule(3_000, 3, "2024-01-25");
    expect(s.map((x) => x.due_date)).toEqual([
      "2024-02-25",
      "2024-03-25",
      "2024-04-25",
    ]);
  });

  it("31 января → февраль (конец месяца)", () => {
    const s = buildSchedule(3_000, 3, "2024-01-31");
    expect(s.map((x) => x.due_date)).toEqual([
      "2024-02-29",
      "2024-03-31",
      "2024-04-30",
    ]);
  });

  it("29 января (невисокосный) → 28 февраля", () => {
    const s = buildSchedule(3_000, 2, "2023-01-29");
    expect(s[0].due_date).toBe("2023-02-28");
    expect(s[1].due_date).toBe("2023-03-29");
  });
});

describe("прогресс / прибыль с взносом", () => {
  it("взнос учитывается в collectionProgress сразу", () => {
    const loan = {
      cost_amount: 100_000,
      markup_percent: 30,
      principal: 130_000,
      down_payment: 20_000,
      income_share_manager: 30,
      income_share_investor: 70,
      investor_amount: 100_000,
    };
    const p0 = collectionProgress(loan, 0);
    moneyEq(p0, 20_000 / 130_000);

    const proj = projectedRemaining(loan, 0);
    // капитал инвестора «возвращён» пропорционально взносу — даже без платежа по графику
    expect(proj.capitalReturned).toBeGreaterThan(0);
    moneyEq(proj.capitalReturned, Math.round(100_000 * p0 * 100) / 100);
  });

  it("profitFromPaid пропорционален principal − cost", () => {
    moneyEq(profitFromPaid(13_000, 30, 100_000, 130_000), 3_000);
    moneyEq(profitFromPaid(1_300, 30, 100_000, 130_000), 300);
  });
});

describe("formatMoney", () => {
  it("форматирует целые и копейки", () => {
    expect(formatMoney(100_000)).toMatch(/100/);
    expect(formatMoney(100_000.5)).toMatch(/50/);
    expect(formatMoney(100_000.50000001)).not.toMatch(/000001/);
  });

  it("NaN / undefined дают «не число» — потенциальный баг UI", () => {
    expect(formatMoney(Number.NaN)).toMatch(/не/i);
    expect(formatMoney(Number(undefined))).toMatch(/не/i);
  });

  it("null → 0 через Number(null)", () => {
    expect(formatMoney(Number(null))).toMatch(/0/);
  });
});

describe("resolveProfitShares", () => {
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
