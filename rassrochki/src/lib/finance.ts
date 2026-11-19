import {
  calcInvestorCapitalBase,
  calcInvestorShareByCapital,
  calcProfit,
  calcSchedulePrincipal,
  profitFromPaid,
  splitIncome,
} from "@/lib/utils";

export type LoanFinanceInput = {
  cost_amount: number | null;
  markup_percent: number | null;
  principal: number;
  down_payment?: number | null;
  /** Total of stored schedule rows; used to preserve existing contracts. */
  schedulePrincipal?: number | null;
  investor_amount?: number | null;
  income_share_manager?: number | null;
  income_share_investor?: number | null;
  status?: string;
  debt_written_off?: number | null;
  writeoff_owner_profit?: number | null;
  writeoff_investor_profit?: number | null;
  writeoff_investor_capital?: number | null;
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
    const down = Number(loan.down_payment) || 0;
    const capitalBase = calcInvestorCapitalBase(cost, down);
    const investor = calcInvestorShareByCapital(invested, capitalBase || cost);
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
  const writtenOff = Math.max(0, Number(loan.debt_written_off) || 0);
  const effectivePrincipal = money(Math.max(0, (principal || cost + profit) - writtenOff));
  const financed = loan.schedulePrincipal == null
    ? calcSchedulePrincipal(effectivePrincipal, down)
    : Math.max(0, Number(loan.schedulePrincipal) || 0);
  const shares = resolveProfitShares(loan);
  const originalSplit = splitIncome(profit, shares.manager, shares.investor);
  const profitSplit = {
    manager: money(Math.max(0, originalSplit.manager - (Number(loan.writeoff_owner_profit) || 0))),
    investor: money(Math.max(0, originalSplit.investor - (Number(loan.writeoff_investor_profit) || 0))),
  };
  const effectiveProfit = money(profitSplit.manager + profitSplit.investor);
  const originalInvestorCapital = Number(loan.investor_amount) || 0;
  const invested = money(Math.max(0, originalInvestorCapital - (Number(loan.writeoff_investor_capital) || 0)));

  return {
    cost,
    profit: effectiveProfit,
    profitTotal: effectiveProfit,
    principal: principal || cost + profit,
    effectivePrincipal,
    writtenOff,
    originalInvestorCapital,
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
  const principal = dealTotals(loan).effectivePrincipal;
  if (principal <= 0) return loan.status === "closed" && Number(loan.debt_written_off) > 0 ? 1 : 0;
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
  if (totals.financed <= EPS) return loan.status === "closed" && Number(loan.debt_written_off) > 0 ? 1 : 0;
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
    totals.writtenOff > 0 ? totals.ownerProfit : totals.shares.manager,
    totals.writtenOff > 0 ? totals.investorProfit : totals.shares.investor
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
  if ((Number(loan.debt_written_off) || 0) > 0) {
    const totals = dealTotals(loan);
    return totals.effectivePrincipal > 0
      ? money(Math.max(0, paidAmount) * totals.profit / totals.effectivePrincipal)
      : 0;
  }
  return profitFromPaid(
    paidAmount,
    Number(loan.markup_percent) || 0,
    loan.cost_amount,
    loan.principal
  );
}
