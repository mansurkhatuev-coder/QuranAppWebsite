import { calcTotalWithMarkup } from "@/lib/utils";

/** Currency precision only; never round the contract to a multiple of rubles. */
export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function totalFromMonthly(downPayment: number, monthlyPayment: number, termMonths: number) {
  return roundMoney(downPayment + roundMoney(monthlyPayment) * termMonths);
}

export function markupFromTotal(cost: number, total: number) {
  return cost > 0 ? roundMoney((total - cost) / cost * 100) : 0;
}

/** Explicit total is authoritative; monthly override is a schedule preference.
 * For old drafts without a total, a manual payment establishes the total.
 */
export function calculateLoanTerms(
  cost: number,
  requestedMarkupPercent: number,
  downPayment: number,
  termMonths: number,
  explicitTotal?: number,
  monthlyOverride?: number
) {
  const validTerm = Number.isInteger(termMonths) && termMonths > 0;
  const manual = monthlyOverride !== undefined && Number.isFinite(monthlyOverride) && monthlyOverride > 0
    ? roundMoney(monthlyOverride) : 0;
  const principal = roundMoney(explicitTotal ?? (
    validTerm && manual > 0 ? totalFromMonthly(downPayment, manual, termMonths)
      : cost > 0 ? calcTotalWithMarkup(cost, requestedMarkupPercent) : 0
  ));
  const schedulePrincipal = roundMoney(Math.max(0, principal - downPayment));
  const monthlyPayment = validTerm && schedulePrincipal > 0
    ? manual || Math.max(0.01, roundMoney(schedulePrincipal / termMonths)) : 0;
  return {
    principal, schedulePrincipal, monthlyPayment,
    effectiveMarkupPercent: cost > 0 ? markupFromTotal(cost, principal) : roundMoney(requestedMarkupPercent),
  };
}
