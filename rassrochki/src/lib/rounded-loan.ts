import { calcTotalWithMarkup } from "@/lib/utils";

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function percent(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Keeps every scheduled payment at a whole ruble and reports the resulting contract rate. */
export function calculateRoundedLoanTerms(
  cost: number,
  requestedMarkupPercent: number,
  downPayment: number,
  termMonths: number,
  monthlyOverride?: number
) {
  const targetPrincipal = calcTotalWithMarkup(cost, requestedMarkupPercent);
  const targetSchedulePrincipal = money(Math.max(0, targetPrincipal - downPayment));
  const monthlyPayment = termMonths > 0 && targetSchedulePrincipal > 0
    ? Math.max(1, Math.round(monthlyOverride && monthlyOverride > 0
        ? monthlyOverride
        : targetSchedulePrincipal / termMonths))
    : 0;
  const schedulePrincipal = money(monthlyPayment * Math.max(0, termMonths));
  const principal = money(schedulePrincipal + downPayment);
  const effectiveMarkupPercent = cost > 0
    ? percent(((principal - cost) / cost) * 100)
    : percent(requestedMarkupPercent);

  return {
    targetPrincipal,
    targetSchedulePrincipal,
    monthlyPayment,
    schedulePrincipal,
    principal,
    effectiveMarkupPercent,
    markupChangePercent: percent(effectiveMarkupPercent - requestedMarkupPercent),
    totalChange: money(principal - targetPrincipal),
  };
}
