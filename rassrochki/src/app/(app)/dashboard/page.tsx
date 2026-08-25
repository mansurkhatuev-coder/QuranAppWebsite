import Link from "next/link";
import { addDays, format, startOfMonth, endOfMonth } from "date-fns";
import { BackupReminder } from "@/components/BackupReminder";
import { EmptyState, StatusBadge } from "@/components/ui";
import { getSessionProfile, createClient } from "@/lib/supabase/server";
import { formatDateShort, formatMoney, splitIncome } from "@/lib/utils";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { defaultPaymentReminderText } from "@/lib/whatsapp";
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
  variant = "light",
}: {
  owner: number;
  investor: number;
  labelOwner?: string;
  labelInvestor?: string;
  variant?: "light" | "dark";
}) {
  const total = owner + investor;
  const ownerPct = total > 0 ? (owner / total) * 100 : 100;
  const invPct = total > 0 ? (investor / total) * 100 : 0;
  const labelClass = variant === "dark" ? "text-teal-50" : "text-slate-600";

  return (
    <div className="space-y-2">
      <div
        className={`flex h-3 overflow-hidden rounded-full ${
          variant === "dark" ? "bg-white/20" : "bg-slate-100"
        }`}
      >
        <div className="bg-teal-300 transition-all" style={{ width: `${ownerPct}%` }} />
        <div className="bg-amber-300 transition-all" style={{ width: `${invPct}%` }} />
      </div>
      <div className={`flex flex-col gap-1 text-xs sm:flex-row sm:flex-wrap sm:justify-between ${labelClass}`}>
        <span className="min-w-0 break-words">
          <span
            className={`mr-1 inline-block h-2 w-2 rounded-full ${
              variant === "dark" ? "bg-teal-200" : "bg-teal-700"
            }`}
          />
          {labelOwner}: {formatMoney(owner)}
        </span>
        <span className="min-w-0 break-words">
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-300" />
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
    <div className="card relative min-w-0">
      <div
        className={`absolute inset-x-0 top-0 h-1 rounded-t-2xl ${
          tone === "danger" ? "bg-red-500" : tone === "accent" ? "bg-teal-600" : "bg-slate-200"
        }`}
      />
      <p className="pr-1 text-sm text-[var(--muted)]">{label}</p>
      <p className={`mt-1 break-words text-xl font-bold leading-tight sm:text-2xl ${valueClass}`}>
        {value}
      </p>
      {hint && <p className="mt-1 break-words text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

function normalizeLoanRow(loan: Record<string, unknown>): LoanFinanceInput & {
  id: string;
  status: string;
  clients?: { full_name: string } | { full_name: string }[] | null;
  investors?: { name: string } | { name: string }[] | null;
} {
  return {
    id: String(loan.id),
    status: String(loan.status ?? "active"),
    cost_amount: loan.cost_amount == null ? null : Number(loan.cost_amount),
    markup_percent: loan.markup_percent == null ? null : Number(loan.markup_percent),
    principal: Number(loan.principal) || 0,
    down_payment: Number(loan.down_payment ?? 0),
    investor_amount: loan.investor_amount == null ? null : Number(loan.investor_amount),
    income_share_manager:
      loan.income_share_manager == null ? null : Number(loan.income_share_manager),
    income_share_investor:
      loan.income_share_investor == null ? null : Number(loan.income_share_investor),
    clients: (loan.clients as { full_name: string } | { full_name: string }[] | null) ?? null,
    investors: (loan.investors as { name: string } | { name: string }[] | null) ?? null,
  };
}

export default async function DashboardPage() {
  const { organization } = await getSessionProfile();
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
    dueSoonRes,
    overdueRes,
    loansRes,
    schedulesRes,
    recentPaymentsRes,
    monthPaymentsRes,
  ] = await Promise.all([
    supabase
      .from("payment_schedules")
      .select("*, loans(title, clients(full_name, phone))")
      .eq("organization_id", orgId)
      .in("status", ["pending", "overdue"])
      .gte("due_date", today)
      .lte("due_date", next30)
      .order("due_date"),
    supabase
      .from("payment_schedules")
      .select("*, loans(title, clients(full_name, phone))")
      .eq("organization_id", orgId)
      .eq("status", "overdue")
      .order("due_date"),
    // * — не падаем, если какая-то миграция ещё не применена
    supabase
      .from("loans")
      .select("*, clients(full_name), investors(name)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("payment_schedules")
      .select("loan_id, amount, paid_amount, status")
      .eq("organization_id", orgId),
    supabase
      .from("payments")
      .select("amount, paid_at, loan_id, loans(*)")
      .eq("organization_id", orgId)
      .gte("paid_at", format(addDays(new Date(), -30), "yyyy-MM-dd'T00:00:00")),
    supabase
      .from("payments")
      .select("amount, paid_at")
      .eq("organization_id", orgId)
      .gte("paid_at", `${monthStart}T00:00:00`)
      .lte("paid_at", `${monthEndDate}T23:59:59`),
  ]);

  const queryError =
    loansRes.error?.message ||
    dueSoonRes.error?.message ||
    overdueRes.error?.message ||
    schedulesRes.error?.message ||
    recentPaymentsRes.error?.message ||
    monthPaymentsRes.error?.message ||
    null;

  const loans = (loansRes.data ?? []).map((row) =>
    normalizeLoanRow(row as Record<string, unknown>)
  );
  const schedules = schedulesRes.data ?? [];
  const dueSoon = dueSoonRes.data ?? [];
  const overdue = overdueRes.data ?? [];
  const recentPayments = recentPaymentsRes.data ?? [];
  const monthPayments = monthPaymentsRes.data ?? [];

  const paidByLoan = new Map<string, number>();
  for (const s of schedules) {
    if (s.status !== "paid") continue;
    paidByLoan.set(
      s.loan_id,
      (paidByLoan.get(s.loan_id) ?? 0) + Number(s.paid_amount ?? s.amount)
    );
  }

  // active = не закрыта (на случай старых/пустых статусов)
  const activeLoans = loans.filter((l) => l.status !== "closed");
  const closedCount = loans.filter((l) => l.status === "closed").length;

  let expectedOwnerProfit = 0;
  let expectedInvestorProfit = 0;
  let expectedInvestorCapital = 0;
  let remainingOwner = 0;
  let remainingInvestor = 0;
  let portfolioProfit = 0;

  for (const loan of activeLoans) {
    const proj = projectedRemaining(loan, paidByLoan.get(loan.id) ?? 0);
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
  for (const p of recentPayments) {
    const raw = p.loans as Record<string, unknown> | Record<string, unknown>[] | null;
    const row = Array.isArray(raw) ? raw[0] : raw;
    if (!row) continue;
    const loan = normalizeLoanRow(row);
    const profit = profitFromPaymentForLoan(Number(p.amount), loan);
    const shares = resolveProfitShares(loan);
    const parts = splitIncome(profit, shares.manager, shares.investor);
    profit30d += profit;
    ownerProfit30d += parts.manager;
    investorProfit30d += parts.investor;
  }

  const cashThisMonth = monthPayments.reduce((s, p) => s + Number(p.amount), 0);
  const dueSoonAmount = dueSoon.reduce((s, p) => s + Number(p.amount), 0);
  const overdueAmount = overdue.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="space-y-4 overflow-x-hidden">
      <BackupReminder />

      {queryError && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Не удалось загрузить часть данных. Обновите страницу или зайдите позже.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Главная</h1>
          <p className="text-sm text-[var(--muted)]">Аналитика и предполагаемый доход</p>
        </div>
        <Link href="/loans/new" className="btn-primary shrink-0">
          + Рассрочка
        </Link>
      </div>

      <section className="rounded-2xl border-0 bg-gradient-to-br from-teal-800 to-teal-600 p-4 text-white shadow-sm md:p-6">
        <p className="text-sm text-teal-100">Предполагаемая прибыль по активным сделкам</p>
        <p className="mt-1 break-words text-2xl font-bold sm:text-3xl">
          {formatMoney(portfolioProfit)}
        </p>
        <p className="mt-2 break-words text-sm leading-relaxed text-teal-50">
          Ещё получить: вам {formatMoney(remainingOwner)}
          {expectedInvestorProfit > 0 || expectedInvestorCapital > 0
            ? ` · инвесторам ${formatMoney(remainingInvestor)}`
            : ""}
        </p>
        <div className="mt-4 rounded-xl bg-black/15 p-3">
          <ShareBar
            owner={remainingOwner}
            investor={remainingInvestor}
            labelInvestor="Инвесторам ещё"
            variant="dark"
          />
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Активных рассрочек"
          value={String(activeLoans.length)}
          hint={
            closedCount > 0
              ? `всего ${loans.length}, закрыто ${closedCount}`
              : `всего: ${loans.length}`
          }
          tone="accent"
        />
        <StatCard
          label="Просрочено"
          value={String(overdue.length)}
          hint={overdueAmount > 0 ? formatMoney(overdueAmount) : "нет сумм"}
          tone={overdue.length > 0 ? "danger" : "default"}
        />
        <StatCard
          label="Ждём за 30 дней"
          value={formatMoney(dueSoonAmount)}
          hint={`${dueSoon.length} платежей`}
          tone="accent"
        />
        <StatCard
          label="Касса в этом месяце"
          value={formatMoney(cashThisMonth)}
          hint="получено за месяц"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="card min-w-0 space-y-3">
          <h2 className="font-semibold">Прибыль за 30 дней (факт)</h2>
          <p className="break-words text-2xl font-bold">{formatMoney(profit30d)}</p>
          <ShareBar owner={ownerProfit30d} investor={investorProfit30d} />
          <p className="text-xs leading-relaxed text-[var(--muted)]">
            Доля инвестора = вложил / цена товара, если указаны вложения.
          </p>
        </section>

        <section className="card min-w-0 space-y-3">
          <h2 className="font-semibold">Портфель: ожидания</h2>
          <div className="space-y-2 text-sm">
            <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-2">
              <span className="text-[var(--muted)]">Ваша прибыль (активные)</span>
              <span className="font-medium break-words">{formatMoney(expectedOwnerProfit)}</span>
            </div>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-2">
              <span className="text-[var(--muted)]">Прибыль инвесторов</span>
              <span className="font-medium break-words">{formatMoney(expectedInvestorProfit)}</span>
            </div>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-2">
              <span className="text-[var(--muted)]">Вернуть капитал инвесторам</span>
              <span className="font-medium break-words">{formatMoney(expectedInvestorCapital)}</span>
            </div>
            <div className="flex flex-col gap-0.5 border-t border-[var(--border)] pt-2 sm:flex-row sm:justify-between sm:gap-2">
              <span className="text-[var(--muted)]">Инвесторам всего</span>
              <span className="font-semibold break-words">
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

      {overdue.length > 0 && (
        <section className="card border-red-200 bg-red-50/40">
          <h2 className="mb-3 font-semibold text-red-800">Просрочки</h2>
          <div className="space-y-2">
            {overdue.map((item) => {
              const loan = item.loans as {
                title: string | null;
                clients:
                  | { full_name: string; phone: string | null }
                  | { full_name: string; phone: string | null }[]
                  | null;
              } | null;
              const clients = loan?.clients;
              const client = Array.isArray(clients) ? clients[0] : clients;
              const clientName = client?.full_name;
              const phone = client?.phone;
              return (
                <div
                  key={item.id}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-white p-3"
                >
                  <Link href={`/loans/${item.loan_id}`} className="min-w-0 flex-1">
                    <p className="font-medium break-words">{clientName}</p>
                    <p className="text-sm text-red-700">{formatDateShort(item.due_date)}</p>
                  </Link>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-semibold">{formatMoney(Number(item.amount))}</span>
                    {phone ? (
                      <WhatsAppButton
                        phone={phone}
                        label="Написать"
                        text={defaultPaymentReminderText({
                          clientName,
                          productName: loan?.title,
                          amount: Number(item.amount),
                          dueDate: formatDateShort(item.due_date),
                        })}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="card min-w-0">
        <h2 className="mb-3 font-semibold">Платежи в ближайшие 30 дней</h2>
        {dueSoon.length === 0 ? (
          <EmptyState title="Нет ожидаемых платежей" description="На ближайший месяц всё чисто." />
        ) : (
          <div className="space-y-2">
            {dueSoon.slice(0, 12).map((item) => {
              const loan = item.loans as {
                title: string | null;
                clients:
                  | { full_name: string; phone: string | null }
                  | { full_name: string; phone: string | null }[]
                  | null;
              } | null;
              const clients = loan?.clients;
              const client = Array.isArray(clients) ? clients[0] : clients;
              const clientName = client?.full_name;
              const phone = client?.phone;
              return (
                <div
                  key={item.id}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] p-3 hover:bg-slate-50"
                >
                  <Link href={`/loans/${item.loan_id}`} className="min-w-0 flex-1">
                    <p className="font-medium break-words">
                      {clientName ?? "Клиент"} — {loan?.title ?? "Рассрочка"}
                    </p>
                    <p className="text-sm text-[var(--muted)]">{formatDateShort(item.due_date)}</p>
                  </Link>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-semibold">{formatMoney(Number(item.amount))}</span>
                    <StatusBadge status={item.status} />
                    {phone ? (
                      <WhatsAppButton
                        phone={phone}
                        label="Написать"
                        text={defaultPaymentReminderText({
                          clientName,
                          productName: loan?.title,
                          amount: Number(item.amount),
                          dueDate: formatDateShort(item.due_date),
                        })}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card min-w-0">
        <h2 className="mb-3 font-semibold">Активные сделки — кратко</h2>
        {activeLoans.length === 0 ? (
          <EmptyState
            title="Активных рассрочек нет"
            description={
              loans.length === 0
                ? "Создайте первую рассрочку."
                : "Все сделки закрыты. Новые появятся здесь."
            }
          />
        ) : (
          <div className="space-y-2">
            {activeLoans.slice(0, 8).map((loan) => {
              const proj = projectedRemaining(loan, paidByLoan.get(loan.id) ?? 0);
              const rawClient = loan.clients;
              const client = Array.isArray(rawClient) ? rawClient[0] : rawClient;
              return (
                <Link
                  key={loan.id}
                  href={`/loans/${loan.id}`}
                  className="block rounded-xl border border-[var(--border)] p-3 hover:bg-slate-50"
                >
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium break-words">{client?.full_name ?? "Клиент"}</p>
                      <p className="text-xs text-[var(--muted)]">
                        прогресс {Math.round(proj.progress * 100)}% · прибыль{" "}
                        {formatMoney(proj.profit)}
                      </p>
                    </div>
                    <div className="min-w-0 text-right text-sm">
                      <p className="font-semibold break-words text-teal-800">
                        вам ещё {formatMoney(proj.ownerStillToReceive)}
                      </p>
                      {proj.investorStillToReceive > 0 && (
                        <p className="text-xs break-words text-[var(--muted)]">
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
        )}
      </section>
    </div>
  );
}
