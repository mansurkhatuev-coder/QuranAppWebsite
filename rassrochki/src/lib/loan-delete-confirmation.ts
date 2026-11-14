export function buildLoanDeleteConfirmation(label: string): string {
  return (
    "Удалить рассрочку «" + label + "»?\n\n" +
    "Будут удалены график, все оплаты и чеки. Суммы по рассрочке исчезнут из дашбордов и отчётов.\n\n" +
    "Действие необратимо. Удалить?"
  );
}
