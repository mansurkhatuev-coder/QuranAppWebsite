import { describe, expect, it } from "vitest";
import { calculateLoanTerms, markupFromTotal } from "@/lib/rounded-loan";
import { buildSchedule } from "@/lib/utils";

describe("loan terms without automatic ruble rounding", () => {
  it("preserves a 270 ruble payment", () => {
    expect(calculateLoanTerms(270, 0, 0, 1)).toEqual({
      principal: 270, schedulePrincipal: 270, monthlyPayment: 270, effectiveMarkupPercent: 0,
    });
  });
  it("preserves the requested total and adjusts only the final payment for cents", () => {
    const result = calculateLoanTerms(1000, 30, 0, 12);
    expect(result).toEqual({ principal: 1300, schedulePrincipal: 1300, monthlyPayment: 108.33, effectiveMarkupPercent: 30 });
    const rows = buildSchedule(result.schedulePrincipal, 12, "2026-01-01", result.monthlyPayment);
    expect(rows.at(-1)?.amount).toBe(108.37);
    expect(Math.round(rows.reduce((sum, row) => sum + row.amount, 0) * 100)).toBe(130000);
  });
  it("honors an explicit total instead of re-deriving it from a rounded percentage", () => {
    const r = calculateLoanTerms(12345, 20, 1000, 7, 15000);
    expect(r.principal).toBe(15000);
    expect(r.schedulePrincipal).toBe(14000);
    expect(r.monthlyPayment).toBe(2000);
    expect(r.effectiveMarkupPercent).toBe(21.51);
    expect(calculateLoanTerms(12345, r.effectiveMarkupPercent, 1000, 7, 15000).principal).toBe(15000);
  });
  it("handles manually chosen payments and includes the down payment in the total", () => {
    expect(calculateLoanTerms(10000, 30, 1000, 3, 14000.2, 4333.4)).toEqual({
      principal: 14000.2, schedulePrincipal: 13000.2, monthlyPayment: 4333.4, effectiveMarkupPercent: 40,
    });
    expect(calculateLoanTerms(10000, 30, 1000, 3, undefined, 4333.4).principal).toBe(14000.2);
  });
  it("keeps the total when months or down payment changes", () => {
    expect(calculateLoanTerms(50000, 30, 5000, 10, 65000).monthlyPayment).toBe(6000);
    expect(calculateLoanTerms(50000, 30, 5000, 12, 65000).monthlyPayment).toBe(5000);
    expect(markupFromTotal(50000, 65000)).toBe(30);
  });
  it("does not create a payment when the down payment covers the total", () => {
    expect(calculateLoanTerms(1000, 20, 1200, 12)).toEqual({
      principal: 1200, schedulePrincipal: 0, monthlyPayment: 0, effectiveMarkupPercent: 20,
    });
  });
});
