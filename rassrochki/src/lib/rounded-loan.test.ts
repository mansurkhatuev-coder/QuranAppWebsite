import { describe, expect, it } from "vitest";
import { calculateRoundedLoanTerms, PAYMENT_ROUNDING_STEP } from "@/lib/rounded-loan";

describe("fixed payment rounding", () => {
  it("always rounds a 270 ruble payment to 300 by default", () => {
    expect(PAYMENT_ROUNDING_STEP).toBe(100);

    const result = calculateRoundedLoanTerms(270, 0, 0, 1);

    expect(result.monthlyPayment).toBe(300);
    expect(result.principal).toBe(300);
    expect(result.effectiveMarkupPercent).toBe(11.11);
    expect(result.markupChangePercent).toBe(11.11);
    expect(result.totalChange).toBe(30);
  });
});

describe("calculateRoundedLoanTerms", () => {
  it("rounds monthly payments to hundreds of rubles and reports the actual markup", () => {
    expect(calculateRoundedLoanTerms(1_000, 30, 0, 12)).toEqual({
      targetPrincipal: 1_300,
      targetSchedulePrincipal: 1_300,
      monthlyPayment: 100,
      schedulePrincipal: 1_200,
      principal: 1_200,
      effectiveMarkupPercent: 20,
      markupChangePercent: -10,
      totalChange: -100,
    });
  });

  it("includes the down payment in the effective rate and rounds a manual payment to hundreds", () => {
    const result = calculateRoundedLoanTerms(10_000, 30, 1_000, 3, 4_333.4);
    expect(result.monthlyPayment).toBe(4_300);
    expect(result.schedulePrincipal).toBe(12_900);
    expect(result.principal).toBe(13_900);
    expect(result.effectiveMarkupPercent).toBe(39);
  });

  it("does not add monthly payments when the down payment covers the total", () => {
    const result = calculateRoundedLoanTerms(1_000, 20, 1_200, 12);

    expect(result.monthlyPayment).toBe(0);
    expect(result.schedulePrincipal).toBe(0);
    expect(result.principal).toBe(1_200);
  });
});
