import { describe, expect, it } from "vitest";
import { buildLoanDeleteConfirmation } from "@/lib/loan-delete-confirmation";

describe("buildLoanDeleteConfirmation", () => {
  it("names the loan and clearly warns about deleting payments, receipts, and dashboard totals", () => {
    const message = buildLoanDeleteConfirmation("Иванов — Холодильник");

    expect(message).toContain("Иванов — Холодильник");
    expect(message).toContain("все оплаты и чеки");
    expect(message).toContain("исчезнут из дашбордов и отчётов");
    expect(message).toContain("необратимо");
  });
});
