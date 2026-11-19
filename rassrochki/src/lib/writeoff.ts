import { dealTotals, type LoanFinanceInput } from "@/lib/finance";

export type WriteoffMode = "proportional" | "owner";
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100);
const rub = (n: number) => n / 100;

export type WriteoffPreview = { error: string } | {
  amount: number;
  ownerProfitLoss: number;
  investorProfitLoss: number;
  ownerCapitalLoss: number;
  investorCapitalLoss: number;
  capitalLoss: number;
  closes: boolean;
};

/** Profit is waived before capital. Owner-only never touches investor funds. */
export function previewWriteoff(loan: LoanFinanceInput, amount: number, remaining: number, mode: WriteoffMode): WriteoffPreview {
  if (!Number.isFinite(amount) || Math.abs(amount * 100 - cents(amount)) > 0.000001 ||
      cents(amount) <= 0 || cents(amount) > cents(remaining)) {
    return { error: "Укажите сумму с точностью до копеек, не превышающую остаток." };
  }
  if (!(Number(loan.cost_amount) > 0) || Number(loan.principal) < Number(loan.cost_amount)) {
    return { error: "Для списания необходима корректная первоначальная цена товара." };
  }
  const t = dealTotals(loan);
  const a = cents(amount);
  const ownerProfit = cents(t.ownerProfit);
  const investorProfit = cents(t.investorProfit);
  if (mode === "owner" && a > ownerProfit) {
    return { error: "Прибыли владельца недостаточно. Выберите пропорциональное списание или меньшую сумму." };
  }
  const profitLoss = Math.min(a, ownerProfit + investorProfit);
  const ownerLoss = mode === "owner" ? profitLoss : ownerProfit + investorProfit > 0
    ? Math.min(ownerProfit, Math.max(profitLoss - investorProfit, Math.round(profitLoss * ownerProfit / (ownerProfit + investorProfit))))
    : 0;
  const capitalLoss = a - profitLoss;
  const cost = cents(Number(loan.cost_amount));
  const investorCapital = cents(t.investorCapital);
  const priorCapitalLoss = Math.max(0, cents(t.writtenOff) - cents(Number(loan.writeoff_owner_profit) || 0) - cents(Number(loan.writeoff_investor_profit) || 0));
  const capitalBase = Math.max(investorCapital, cost - cents(t.down) - priorCapitalLoss);
  if (capitalLoss > capitalBase) return { error: "Сумма превышает оставшийся капитал. Проверьте условия сделки." };
  const investorCapitalLoss = capitalBase > 0
    ? Math.min(investorCapital, Math.round(capitalLoss * investorCapital / capitalBase)) : 0;
  return {
    amount: rub(a),
    ownerProfitLoss: rub(ownerLoss),
    investorProfitLoss: rub(profitLoss - ownerLoss),
    ownerCapitalLoss: rub(capitalLoss - investorCapitalLoss),
    investorCapitalLoss: rub(investorCapitalLoss),
    capitalLoss: rub(capitalLoss),
    closes: a === cents(remaining),
  };
}
