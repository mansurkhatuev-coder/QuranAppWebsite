import { describe, expect, it } from "vitest";
import { previewWriteoff } from "@/lib/writeoff";
import { dealTotals, projectedRemaining } from "@/lib/finance";
const loan = { cost_amount: 10000, markup_percent: 30, principal: 13000, down_payment: 0,
  investor_amount: 7000, income_share_manager: 30, income_share_investor: 70 };
describe("write-offs", () => {
  it("forgives 200 without changing cash in proportional mode", () => {
    expect(previewWriteoff(loan,200,200,"proportional")).toMatchObject({
      ownerProfitLoss:60, investorProfitLoss:140, capitalLoss:0, closes:true,
    });
  });
  it("supports owner-only and partial waiver", () => {
    expect(previewWriteoff(loan,200,1000,"owner")).toMatchObject({
      ownerProfitLoss:200, investorProfitLoss:0, closes:false,
    });
    expect(previewWriteoff(loan,901,1000,"owner")).toHaveProperty("error");
  });
  it("loss beyond all profit affects invested capital", () => {
    expect(previewWriteoff(loan,4000,5000,"proportional")).toMatchObject({
      ownerProfitLoss:900, investorProfitLoss:2100, investorCapitalLoss:700, ownerCapitalLoss:300,
    });
  });
  it("validates limits", () => {
    expect(previewWriteoff(loan,201,200,"proportional")).toHaveProperty("error");
    expect(previewWriteoff(loan,0,200,"owner")).toHaveProperty("error");
    expect(previewWriteoff(loan,0.001,200,"owner")).toHaveProperty("error");
  });
  it("closed deal has actual collected, adjusted profit and no outstanding balance", () => {
    const settled = {...loan, status:"closed", debt_written_off:200,writeoff_owner_profit:60,writeoff_investor_profit:140,schedulePrincipal:12800};
    expect(dealTotals(settled)).toMatchObject({principal:13000,effectivePrincipal:12800,profit:2800});
    expect(projectedRemaining(settled,12800)).toMatchObject({
      collected:12800,earnedOwnerProfit:840,earnedInvestorProfit:1960,ownerStillToReceive:0,investorStillToReceive:0,
    });
  });
  it("supports multiple waivers without deducting the original profit twice", () => {
    expect(previewWriteoff({...loan,debt_written_off:200,writeoff_owner_profit:200},100,200,"proportional")).toMatchObject({
      ownerProfitLoss:25,investorProfitLoss:75,
    });
  });
});
