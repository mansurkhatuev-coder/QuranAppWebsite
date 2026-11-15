import { describe, expect, it } from "vitest";
import { calculateRoundedLoanTerms, PAYMENT_ROUNDING_STEPS } from "@/lib/rounded-loan";

describe("payment rounding choices", () => {
  it("offers whole rubles, ten rubles, and hundred rubles", () => {
    expect(PAYMENT_ROUNDING_STEPS).toEqual([1, 10, 100]);
  });

  it("rounds a 270 ruble payment to 300 at the hundred-ruble step", () => {
    const result = calculateRoundedLoanTerms(270, 0, 0, 1, undefined, 100);

    expect(result.monthlyPayment).toBe(300);
    expect(result.principal).toBe(300);
    expect(result.effectiveMarkupPercent).toBe(11.11);
    expect(result.markupChangePercent).toBe(11.11);
    expect(result.totalChange).toBe(30);
  });
});

describe("calculateRoundedLoanTerms", () => {
  it("rounds monthly payments to whole rubles and reports the actual markup", () => {
    expect(calculateRoundedLoanTerms(1_000, 30, 0, 12)).toEqual({
      targetPrincipal: 1_300,
      targetSchedulePrincipal: 1_300,
      monthlyPayment: 108,
      schedulePrincipal: 1_296,
      principal: 1_296,
      effectiveMarkupPercent: 29.6,
      markupChangePercent: -0.4,
      totalChange: -4,
    });
  });

  it("includes the down payment in the effective rate and rounds a manual payment", () => {
    const result = calculateRoundedLoanTerms(10_000, 30, 1_000, 3, 4_333.4);
    expect(result.monthlyPayment).toBe(4_333);
    expect(result.schedulePrincipal).toBe(12_999);
    expect(result.principal).toBe(13_999);
    expect(result.effectiveMarkupPercent).toBe(39.99);
  });

  it("does not add monthly payments when the down payment covers the total", () => {
    const result = calculateRoundedLoanTerms(1_000, 20, 1_200, 12);

    expect(result.monthlyPayment).toBe(0);
    expect(result.schedulePrincipal).toBe(0);
    expect(result.principal).toBe(1_200);
  });
});
