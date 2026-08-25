import {
  calcFinancedAmount,
  calcInvestorShareByCapital,
  calcProfit,
  profitFromPaid,
  splitIncome,
} from "@/lib/utils";

export type LoanFinanceInput = {
  cost_amount: number | null;
  markup_percent: number | null;
  principal: number;
  down_payment?: number | null;
  investor_amount?: number | null;
  income_share_manager?: number | null;
  income_share_investor?: number | null;
  status?: string;
};

/**
 * Вариант А: доля от прибыли = вложения / цена товара.
 * Если вложений нет — вся прибыль владельцу.
 */
export function resolveProfitShares(loan: LoanFinanceInput) {
  const cost = Number(loan.cost_amount) || 0;
  const invested = Number(loan.investor_amount) || 0;

  if (invested > 0 && cost > 0) {
    const investor = calcInvestorShareByCapital(invested, cost);
    return {
      manager: Math.round((100 - investor) * 100) / 100,
      investor,
      mode: "by_capital" as const,
    };
  }

  const investor = Number(loan.income_share_investor) || 0;
  const manager =
    Number(loan.income_share_manager) || (investor > 0 ? Math.max(0, 100 - investor) : 100);

  return {
    manager,
    investor: invested > 0 ? investor : 0,
    mode: "manual" as const,
  };
}

export function dealTotals(loan: LoanFinanceInput) {
  const cost = Number(loan.cost_amount) || 0;
  const markup = Number(loan.markup_percent) || 0;
  const principal = Number(loan.principal) || 0;
  const down = Number(loan.down_payment) || 0;
  const profit = cost > 0 ? calcProfit(cost, markup) : Math.max(principal - cost, 0);
  const financed = calcFinancedAmount(principal || cost + profit, down);
  const shares = resolveProfitShares(loan);
  const profitSplit = splitIncome(profit, shares.manager, shares.investor);
  const invested = Number(loan.investor_amount) || 0;

  return {
    cost,
    profit,
    principal: principal || cost + profit,
    down,
    financed,
    shares,
    ownerProfit: profitSplit.manager,
    investorProfit: profitSplit.investor,
    investorCapital: invested,
    /** Что инвестор ожидает получить всего: капитал + доля прибыли */
    investorExpectedTotal: invested + profitSplit.investor,
    ownerExpectedTotal: profitSplit.manager,
  };
}

/**
 * Прогресс сбора полной суммы (взнос + платежи по графику) / principal.
 */
export function collectionProgress(
  loan: LoanFinanceInput,
  paidScheduleTotal: number
) {
  const principal = Number(loan.principal) || 0;
  if (principal <= 0) return 0;
  const down = Number(loan.down_payment) || 0;
  const collected = down + paidScheduleTotal;
  return Math.min(1, Math.max(0, collected / principal));
}

export function projectedRemaining(loan: LoanFinanceInput, paidScheduleTotal: number) {
  const totals = dealTotals(loan);
  const progress = collectionProgress(loan, paidScheduleTotal);
  const earnedProfit = Math.round(totals.profit * progress * 100) / 100;
  const earnedSplit = splitIncome(
    earnedProfit,
    totals.shares.manager,
    totals.shares.investor
  );
  const capitalReturned = Math.round(totals.investorCapital * progress * 100) / 100;

  return {
    ...totals,
    progress,
    earnedProfit,
    earnedOwnerProfit: earnedSplit.manager,
    earnedInvestorProfit: earnedSplit.investor,
    remainingOwnerProfit: Math.max(0, totals.ownerProfit - earnedSplit.manager),
    remainingInvestorProfit: Math.max(0, totals.investorProfit - earnedSplit.investor),
    capitalReturned,
    capitalLeft: Math.max(0, totals.investorCapital - capitalReturned),
    /** Ещё получить инвестору ≈ оставшийся капитал + оставшаяся прибыль */
    investorStillToReceive:
      Math.max(0, totals.investorCapital - capitalReturned) +
      Math.max(0, totals.investorProfit - earnedSplit.investor),
    ownerStillToReceive: Math.max(0, totals.ownerProfit - earnedSplit.manager),
  };
}

export function profitFromPaymentForLoan(
  paidAmount: number,
  loan: LoanFinanceInput
) {
  return profitFromPaid(
    paidAmount,
    Number(loan.markup_percent) || 0,
    loan.cost_amount,
    loan.principal
  );
}
