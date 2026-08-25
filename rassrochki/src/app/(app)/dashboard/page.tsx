import Link from "next/link";
import { addDays, format, startOfMonth, endOfMonth } from "date-fns";
import { BackupReminder } from "@/components/BackupReminder";
import { EmptyState, StatusBadge } from "@/components/ui";
import { getSessionProfile, createClient } from "@/lib/supabase/server";
import { formatDateShort, formatMoney, splitIncome } from "@/lib/utils";
import {
  projectedRemaining,
  profitFromPaymentForLoan,
  resolveProfitShares,
  type LoanFinanceInput,
} from "@/lib/finance";

function ShareBar({
  owner,
  investor,
  labelOwner = "Вы",
  labelInvestor = "Инвестор",
}: {
  owner: number;
  investor: number;
  labelOwner?: string;
  labelInvestor?: string;
}) {
  const total = owner + investor;
  const ownerPct = total > 0 ? (owner / total) * 100 : 100;
  const invPct = total > 0 ? (investor / total) * 100 : 0;

  return (
    <div className="space-y-2">
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
        <div className="bg-teal-700 transition-all" style={{ width: `${ownerPct}%` }} />
        <div className="bg-amber-400 transition-all" style={{ width: `${invPct}%` }} />
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--muted)]">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-teal-700" />
          {labelOwner}: {formatMoney(owner)}
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />
          {labelInvestor}: {formatMoney(investor)}
        </span>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "danger" | "accent";
}) {
  const valueClass =
    tone === "danger"
      ? "text-red-600"
      : tone === "accent"
        ? "text-teal-800"
        : "text-slate-900";

  return (
    <div className="card relative overflow-hidden">
      <div
        className={`absolute inset-x-0 top-0 h-1 ${
          tone === "danger" ? "bg-red-500" : tone === "accent" ? "bg-teal-600" : "bg-slate-200"
        }`}
      />
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${valueClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

export default async function DashboardPage() {
  const { organization, settings } = await getSessionProfile();
  const supabase = await createClient();
  const orgId = organization!.id;
  const today = format(new Date(), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const monthEndDate = format(endOfMonth(new Date()), "yyyy-MM-dd");
  const next30 = format(addDays(new Date(), 30), "yyyy-MM-dd");

  await supabase
    .from("payment_schedules")
    .update({ status: "overdue" })
    .eq("organization_id", orgId)
    .eq("status", "pending")
    .lt("due_date", today);

  const [
    { data: dueSoon },
    { data: overdue },
    { data: loans },
    { data: schedules },
    { data: recentPayments },
    { data: monthPayments },
  ] = await Promise.all([
    supabase
      .from("payment_schedules")
      .select("*, loans(title, clients(full_name))")
      .eq("organization_id", orgId)
      .in("status", ["pending", "overdue"])
      .gte("due_date", today)
      .lte("due_date", next30)
      .order("due_date"),
    supabase
      .from("payment_schedules")
      .select("*, loans(title, clients(full_name))")
      .eq("organization_id", orgId)
      .eq("status", "overdue")
      .order("due_date"),
    supabase
      .from("loans")
      .select(
        "id, status, cost_amount, markup_percent, principal, down_payment, investor_amount, income_share_manager, income_share_investor, investor_id, investors(name), clients(full_name)"
      )
      .eq("organization_id", orgId),
    supabase
      .from("payment_schedules")
      .select("loan_id, amount, paid_amount, status")
      .eq("organization_id", orgId),
    supabase
      .from("payments")
      .select(
        "amount, paid_at, loan_id, loans(markup_percent, cost_amount, principal, investor_amount, income_share_manager, income_share_investor)"
      )
      .eq("organization_id", orgId)
      .gte("paid_at", format(addDays(new Date(), -30), "yyyy-MM-dd'T00:00:00")),
    supabase
      .from("payments")
      .select("amount, paid_at")
      .eq("organization_id", orgId)
      .gte("paid_at", `${monthStart}T00:00:00`)
      .lte("paid_at", `${monthEndDate}T23:59:59`),
  ]);

  const paidByLoan = new Map<string, number>();
  for (const s of schedules ?? []) {
    if (s.status !== "paid") continue;
    paidByLoan.set(
      s.loan_id,
      (paidByLoan.get(s.loan_id) ?? 0) + Number(s.paid_amount ?? s.amount)
    );
  }

  const activeLoans = (loans ?? []).filter((l) => l.status === "active");
  let expectedOwnerProfit = 0;
  let expectedInvestorProfit = 0;
  let expectedInvestorCapital = 0;
  let remainingOwner = 0;
  let remainingInvestor = 0;
  let portfolioProfit = 0;

  for (const loan of activeLoans) {
    const input = loan as LoanFinanceInput;
    const proj = projectedRemaining(input, paidByLoan.get(loan.id) ?? 0);
    expectedOwnerProfit += proj.ownerProfit;
    expectedInvestorProfit += proj.investorProfit;
    expectedInvestorCapital += proj.investorCapital;
    remainingOwner += proj.ownerStillToReceive;
    remainingInvestor += proj.investorStillToReceive;
    portfolioProfit += proj.profit;
  }

  let profit30d = 0;
  let ownerProfit30d = 0;
  let investorProfit30d = 0;
  for (const p of recentPayments ?? []) {
    const raw = p.loans as LoanFinanceInput | LoanFinanceInput[] | null;
    const loan = Array.isArray(raw) ? raw[0] : raw;
    if (!loan) continue;
    const profit = profitFromPaymentForLoan(Number(p.amount), loan);
    const shares = resolveProfitShares(loan);
    const parts = splitIncome(profit, shares.manager, shares.investor);
    profit30d += profit;
    ownerProfit30d += parts.manager;
    investorProfit30d += parts.investor;
  }

  const cashThisMonth = (monthPayments ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const dueSoonAmount = (dueSoon ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const overdueAmount = (overdue ?? []).reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="space-y-4">
      <BackupReminder />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Главная</h1>
          <p className="text-sm text-[var(--muted)]">Аналитика и предполагаемый доход</p>
        </div>
        <Link href="/loans/new" className="btn-primary">
          + Рассрочка
        </Link>
      </div>

      <section className="card bg-gradient-to-br from-teal-800 to-teal-600 text-white border-0">
        <p className="text-sm text-teal-100">Предполагаемая прибыль по активным сделкам</p>
        <p className="mt-1 text-3xl font-bold">{formatMoney(portfolioProfit)}</p>
        <p className="mt-1 text-sm text-teal-100">
          Ещё получить: вам {formatMoney(remainingOwner)}
          {expectedInvestorProfit > 0 || expectedInvestorCapital > 0
            ? ` · инвесторам ${formatMoney(remainingInvestor)}`
            : ""}
        </p>
        <div className="mt-4 rounded-xl bg-white/10 p-3 backdrop-blur">
          <ShareBar owner={remainingOwner} investor={remainingInvestor} labelInvestor="Инвесторам ещё" />
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Активных рассрочек"
          value={String(activeLoans.length)}
          hint={`всего в базе: ${(loans ?? []).length}`}
        />
        <StatCard
          label="Просрочено"
          value={String((overdue ?? []).length)}
          hint={overdueAmount > 0 ? formatMoney(overdueAmount) : "сумм нет"}
          tone={(overdue ?? []).length > 0 ? "danger" : "default"}
        />
        <StatCard
          label="Ждём за 30 дней"
          value={formatMoney(dueSoonAmount)}
          hint={`${(dueSoon ?? []).length} платежей`}
          tone="accent"
        />
        <StatCard
          label="Касса в этом месяце"
          value={formatMoney(cashThisMonth)}
          hint="фактические оплаты"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="font-semibold">Прибыль за 30 дней (факт)</h2>
          <p className="text-2xl font-bold">{formatMoney(profit30d)}</p>
          <ShareBar owner={ownerProfit30d} investor={investorProfit30d} />
          <p className="text-xs text-[var(--muted)]">
            Доля инвестора считается по вкладу (вложил / цена товара), если указаны вложения.
          </p>
        </section>

        <section className="card space-y-3">
          <h2 className="font-semibold">Портфель: ожидания</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-[var(--muted)]">Ваша прибыль (всего по активным)</span>
              <span className="font-medium">{formatMoney(expectedOwnerProfit)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[var(--muted)]">Прибыль инвесторов</span>
              <span className="font-medium">{formatMoney(expectedInvestorProfit)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[var(--muted)]">Вернуть капитал инвесторам</span>
              <span className="font-medium">{formatMoney(expectedInvestorCapital)}</span>
            </div>
            <div className="flex justify-between gap-2 border-t border-[var(--border)] pt-2">
              <span className="text-[var(--muted)]">Инвесторам всего (капитал + прибыль)</span>
              <span className="font-semibold">
                {formatMoney(expectedInvestorCapital + expectedInvestorProfit)}
              </span>
            </div>
          </div>
          <ShareBar
            owner={expectedOwnerProfit}
            investor={expectedInvestorProfit}
            labelOwner="Ваша прибыль"
            labelInvestor="Их прибыль"
          />
        </section>
      </div>

      {(overdue ?? []).length > 0 && (
        <section className="card border-red-200 bg-red-50/40">
          <h2 className="mb-3 font-semibold text-red-800">Просрочки</h2>
          <div className="space-y-2">
            {(overdue ?? []).map((item) => {
              const loan = item.loans as {
                title: string | null;
                clients: { full_name: string } | null;
              } | null;
              return (
                <Link
                  key={item.id}
                  href={`/loans/${item.loan_id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-white p-3"
                >
                  <div>
                    <p className="font-medium">{loan?.clients?.full_name}</p>
                    <p className="text-sm text-red-700">{formatDateShort(item.due_date)}</p>
                  </div>
                  <span className="font-semibold">{formatMoney(Number(item.amount))}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="card">
        <h2 className="mb-3 font-semibold">Платежи в ближайшие 30 дней</h2>
        {(dueSoon ?? []).length === 0 ? (
          <EmptyState title="Нет ожидаемых платежей" description="На ближайший месяц всё чисто." />
        ) : (
          <div className="space-y-2">
            {(dueSoon ?? []).slice(0, 12).map((item) => {
              const loan = item.loans as {
                title: string | null;
                clients: { full_name: string } | null;
              } | null;
              return (
                <Link
                  key={item.id}
                  href={`/loans/${item.loan_id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] p-3 hover:bg-slate-50"
                >
                  <div>
                    <p className="font-medium">
                      {loan?.clients?.full_name ?? "Клиент"} — {loan?.title ?? "Рассрочка"}
                    </p>
                    <p className="text-sm text-[var(--muted)]">{formatDateShort(item.due_date)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{formatMoney(Number(item.amount))}</span>
                    <StatusBadge status={item.status} />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {activeLoans.length > 0 && (
        <section className="card">
          <h2 className="mb-3 font-semibold">Активные сделки — кратко</h2>
          <div className="space-y-2">
            {activeLoans.slice(0, 8).map((loan) => {
              const proj = projectedRemaining(loan as LoanFinanceInput, paidByLoan.get(loan.id) ?? 0);
              const rawClient = loan.clients as
                | { full_name: string }
                | { full_name: string }[]
                | null;
              const client = Array.isArray(rawClient) ? rawClient[0] : rawClient;
              return (
                <Link
                  key={loan.id}
                  href={`/loans/${loan.id}`}
                  className="block rounded-xl border border-[var(--border)] p-3 hover:bg-slate-50"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{client?.full_name ?? "Клиент"}</p>
                      <p className="text-xs text-[var(--muted)]">
                        прогресс {Math.round(proj.progress * 100)}% · прибыль{" "}
                        {formatMoney(proj.profit)}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-semibold text-teal-800">
                        вам ещё {formatMoney(proj.ownerStillToReceive)}
                      </p>
                      {proj.investorStillToReceive > 0 && (
                        <p className="text-xs text-[var(--muted)]">
                          инвестору ещё {formatMoney(proj.investorStillToReceive)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-teal-600"
                      style={{ width: `${Math.round(proj.progress * 100)}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
