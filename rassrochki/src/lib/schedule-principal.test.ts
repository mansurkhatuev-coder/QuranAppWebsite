import { describe, expect, it } from "vitest";
import { calcSchedulePrincipal } from "@/lib/utils";

describe("schedule principal", () => {
  it("always deducts the down payment from the repayment schedule", () => {
    expect(calcSchedulePrincipal(13_000, 3_000)).toBe(10_000);
    expect(calcSchedulePrincipal(13_000, 0)).toBe(13_000);
  });

  it("has no full-amount mode parameter", () => {
    expect(calcSchedulePrincipal.length).toBe(2);
  });
});
