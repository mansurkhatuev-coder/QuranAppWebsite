/**
 * Контрольная сверка рассрочек из backup JSON (без изменения данных).
 *
 * Использование:
 *   npx tsx scripts/reconcile-loans.ts path/to/rassrochki-kopiya-YYYY-MM-DD.json
 *
 * Для каждой рассрочки проверяет:
 *   principal − down_payment = задолженность
 *   SUM(график) = задолженность
 *   SUM(фактические payments) vs SUM(paid по графику)
 *   задолженность − оплачено по графику = остаток
 */
import { readFileSync } from "node:fs";

type Loan = {
  id: string;
  title: string | null;
  principal: number;
  down_payment?: number | null;
  cost_amount?: number | null;
  markup_percent?: number | null;
  status: string;
};

type Schedule = {
  loan_id: string;
  amount: number;
  status: string;
  paid_amount?: number | null;
  sequence_number: number;
};

type Payment = {
  loan_id: string;
  amount: number;
  schedule_id?: string | null;
};

type Backup = {
  loans?: Loan[];
  payment_schedules?: Schedule[];
  payments?: Payment[];
};

const EPS = 0.009;

function money(n: number) {
  return Math.round(n * 100) / 100;
}

function sumSchedulePaid(rows: Schedule[]) {
  return money(
    rows.reduce((sum, s) => {
      if (s.status === "paid") return sum + Number(s.paid_amount ?? s.amount);
      return sum + Number(s.paid_amount ?? 0);
    }, 0)
  );
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: npx tsx scripts/reconcile-loans.ts <backup.json>");
    process.exit(2);
  }

  const backup = JSON.parse(readFileSync(path, "utf8")) as Backup;
  const loans = backup.loans ?? [];
  const schedules = backup.payment_schedules ?? [];
  const payments = backup.payments ?? [];

  if (loans.length === 0) {
    console.log("В backup нет рассрочек — нечего сверять.");
    return;
  }

  let issues = 0;

  for (const loan of loans) {
    const principal = Number(loan.principal) || 0;
    const down = Number(loan.down_payment ?? 0) || 0;
    const financed = money(Math.max(0, principal - down));
    const loanSchedules = schedules
      .filter((s) => s.loan_id === loan.id)
      .sort((a, b) => a.sequence_number - b.sequence_number);
    const scheduleTotal = money(loanSchedules.reduce((s, r) => s + Number(r.amount), 0));
    const paidSchedule = sumSchedulePaid(loanSchedules);
    const paidPayments = money(
      payments.filter((p) => p.loan_id === loan.id).reduce((s, p) => s + Number(p.amount), 0)
    );
    const remaining = money(financed - paidSchedule);

    const problems: string[] = [];
    if (Math.abs(scheduleTotal - financed) > EPS) {
      problems.push(
        `SUM(график)=${scheduleTotal} ≠ задолженность=${financed} (principal ${principal} − down ${down})`
      );
    }
    if (Math.abs(paidPayments - paidSchedule) > EPS) {
      problems.push(
        `SUM(payments)=${paidPayments} ≠ SUM(paid по графику)=${paidSchedule} (возможны дубли/переплата/орфан)`
      );
    }
    if (remaining < -EPS) {
      problems.push(`отрицательный остаток по графику: ${remaining}`);
    }

    const label = `${loan.id.slice(0, 8)} ${loan.title ?? ""} [${loan.status}]`;
    if (problems.length) {
      issues += problems.length;
      console.log(`FAIL ${label}`);
      for (const p of problems) console.log(`  - ${p}`);
    } else {
      console.log(
        `OK   ${label}: к возврату ${principal}, взнос ${down}, график ${scheduleTotal}, оплачено(график) ${paidSchedule}, payments ${paidPayments}, остаток ${remaining}`
      );
    }
  }

  console.log(`\nИтого: ${loans.length} рассрочек, проблем: ${issues}`);
  process.exit(issues > 0 ? 1 : 0);
}

main();
