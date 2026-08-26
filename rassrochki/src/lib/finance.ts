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

const EPS = 0.009;

function shareOrNull(v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(Number(v))) return null;
  return Number(v);
}

function money(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Доли прибыли: сохранённые на рассрочке `income_share_*` — источник истины
 * (в т.ч. ручной ввод). Если долей нет — считаем по вложениям / цене товара.
 */
export function resolveProfitShares(loan: LoanFinanceInput) {
  const cost = Number(loan.cost_amount) || 0;
  const invested = Number(loan.investor_amount) || 0;
  const storedInvestor = shareOrNull(loan.income_share_investor);
  const storedManager = shareOrNull(loan.income_share_manager);

  if (storedInvestor != null || storedManager != null) {
    const investor = storedInvestor ?? 0;
    const manager =
      storedManager != null
        ? storedManager
        : investor > 0
          ? Math.max(0, 100 - investor)
          : 100;

    return {
      manager,
      investor,
      mode: "manual" as const,
    };
  }

  if (invested > 0 && cost > 0) {
    const investor = calcInvestorShareByCapital(invested, cost);
    return {
      manager: Math.round((100 - investor) * 100) / 100,
      investor,
      mode: "by_capital" as const,
    };
  }

  return { manager: 100, investor: 0, mode: "manual" as const };
}

export function dealTotals(loan: LoanFinanceInput) {
  const cost = Number(loan.cost_amount) || 0;
  const markup = Number(loan.markup_percent) || 0;
  const principal = Number(loan.principal) || 0;
  const down = Number(loan.down_payment) || 0;
  // Одна база прибыли: principal − cost (как в profitFromPaid), до копеек
  const profit =
    cost > 0 && principal > 0
      ? money(Math.max(principal - cost, 0))
      : cost > 0
        ? calcProfit(cost, markup)
        : 0;
  const financed = calcFinancedAmount(principal || cost + profit, down);
  const shares = resolveProfitShares(loan);
  const profitSplit = splitIncome(profit, shares.manager, shares.investor);
  const invested = Number(loan.investor_amount) || 0;

  return {
    cost,
    profit,
    profitTotal: profit,
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

/** Получено от клиента: взнос + оплаты по графику. */
export function collectedAmount(loan: LoanFinanceInput, paidScheduleTotal: number) {
  const down = Number(loan.down_payment) || 0;
  return money(Math.max(0, down) + Math.max(0, paidScheduleTotal));
}

/**
 * Прогресс сбора полной суммы (взнос + платежи по графику) / principal.
 * Используется для признания заработанной прибыли.
 */
export function collectionProgress(
  loan: LoanFinanceInput,
  paidScheduleTotal: number
) {
  const principal = Number(loan.principal) || 0;
  if (principal <= 0) return 0;
  const collected = collectedAmount(loan, paidScheduleTotal);
  return Math.min(1, Math.max(0, collected / principal));
}

/**
 * Прогресс возврата капитала инвестора.
 * Считается ТОЛЬКО по оплатам графика; down_payment не входит.
 */
export function capitalProgress(
  loan: LoanFinanceInput,
  paidScheduleTotal: number
) {
  const totals = dealTotals(loan);
  if (totals.financed <= EPS) return 0;
  return Math.min(1, Math.max(0, paidScheduleTotal / totals.financed));
}

/** Фактически полученные деньги: взнос + сумма payments (без двойного учёта взноса). */
export function cashReceived(loan: LoanFinanceInput, paymentsSum: number) {
  const down = Number(loan.down_payment) || 0;
  return money(Math.max(0, down) + Math.max(0, paymentsSum));
}

export function projectedRemaining(loan: LoanFinanceInput, paidScheduleTotal: number) {
  const totals = dealTotals(loan);
  const progress = collectionProgress(loan, paidScheduleTotal);
  const progressCapital = capitalProgress(loan, paidScheduleTotal);
  const collected = collectedAmount(loan, paidScheduleTotal);

  const earnedProfit = Math.min(
    totals.profit,
    money(totals.profit * progress)
  );
  const earnedSplit = splitIncome(
    earnedProfit,
    totals.shares.manager,
    totals.shares.investor
  );

  const capitalReturned = Math.min(
    totals.investorCapital,
    money(totals.investorCapital * progressCapital)
  );
  const capitalLeft = money(Math.max(0, totals.investorCapital - capitalReturned));

  return {
    ...totals,
    collected,
    progress,
    progressCapital,
    earnedProfit,
    earnedOwnerProfit: earnedSplit.manager,
    earnedInvestorProfit: earnedSplit.investor,
    remainingOwnerProfit: Math.max(0, money(totals.ownerProfit - earnedSplit.manager)),
    remainingInvestorProfit: Math.max(0, money(totals.investorProfit - earnedSplit.investor)),
    capitalReturned,
    capitalLeft,
    /** Ещё получить инвестору ≈ оставшийся капитал + оставшаяся прибыль */
    investorStillToReceive: money(
      capitalLeft + Math.max(0, totals.investorProfit - earnedSplit.investor)
    ),
    ownerStillToReceive: Math.max(0, money(totals.ownerProfit - earnedSplit.manager)),
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
