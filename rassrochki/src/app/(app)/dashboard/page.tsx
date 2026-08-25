import Link from "next/link";
import { addDays, format } from "date-fns";
import { EmptyState, StatusBadge } from "@/components/ui";
import { getSessionProfile, createClient } from "@/lib/supabase/server";
import { formatDateShort, formatMoney, profitFromPaid, splitIncome } from "@/lib/utils";

export default async function DashboardPage() {
  const { organization, settings } = await getSessionProfile();
  const supabase = await createClient();
  const orgId = organization!.id;
  const today = format(new Date(), "yyyy-MM-dd");
  const monthEnd = format(addDays(new Date(), 30), "yyyy-MM-dd");

  await supabase
    .from("payment_schedules")
    .update({ status: "overdue" })
    .eq("organization_id", orgId)
    .eq("status", "pending")
    .lt("due_date", today);

  const [{ data: dueSoon }, { data: overdue }, { data: activeLoans }, { data: recentPayments }] =
    await Promise.all([
      supabase
        .from("payment_schedules")
        .select("*, loans(title, clients(full_name))")
        .eq("organization_id", orgId)
        .in("status", ["pending", "overdue"])
        .gte("due_date", today)
        .lte("due_date", monthEnd)
        .order("due_date"),
      supabase
        .from("payment_schedules")
        .select("*, loans(title, clients(full_name))")
        .eq("organization_id", orgId)
        .eq("status", "overdue")
        .order("due_date"),
      supabase.from("loans").select("id, status").eq("organization_id", orgId),
      supabase
        .from("payments")
        .select("amount, paid_at, loans(markup_percent, cost_amount, principal)")
        .eq("organization_id", orgId)
        .gte("paid_at", format(addDays(new Date(), -30), "yyyy-MM-dd'T00:00:00")),
    ]);

  const income30d = (recentPayments ?? []).reduce((sum, p) => {
    const raw = p.loans as
      | {
          markup_percent: number | null;
          cost_amount: number | null;
          principal: number | null;
        }
      | {
          markup_percent: number | null;
          cost_amount: number | null;
          principal: number | null;
        }[]
      | null;
    const loan = Array.isArray(raw) ? raw[0] : raw;
    const profit = profitFromPaid(
      Number(p.amount),
      Number(loan?.markup_percent ?? settings?.default_markup_percent ?? 30),
      loan?.cost_amount,
      loan?.principal
    );
    return sum + profit;
  }, 0);
  const split = splitIncome(
    income30d,
    Number(settings?.income_share_manager ?? 30),
    Number(settings?.income_share_investor ?? 70)
  );

  const activeCount = (activeLoans ?? []).filter((l) => l.status === "active").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Главная</h1>
          <p className="text-sm text-[var(--muted)]">Сводка по рассрочкам</p>
        </div>
        <Link href="/loans/new" className="btn-primary">
          + Рассрочка
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <p className="text-sm text-[var(--muted)]">Активных рассрочек</p>
          <p className="mt-1 text-2xl font-bold">{activeCount}</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--muted)]">Просрочено</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{(overdue ?? []).length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--muted)]">Прибыль за 30 дней</p>
          <p className="mt-1 text-2xl font-bold">{formatMoney(income30d)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--muted)]">Прибыль: вы / инвестор</p>
          <p className="mt-1 text-sm font-semibold">
            {formatMoney(split.manager)} / {formatMoney(split.investor)}
          </p>
        </div>
      </div>

      <section className="card">
        <h2 className="mb-3 font-semibold">Платежи в ближайший месяц</h2>
        {(dueSoon ?? []).length === 0 ? (
          <EmptyState title="Нет ожидаемых платежей" description="На ближайший месяц всё чисто." />
        ) : (
          <div className="space-y-2">
            {(dueSoon ?? []).map((item) => {
              const loan = item.loans as { title: string | null; clients: { full_name: string } | null } | null;
              return (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] p-3"
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
                </div>
              );
            })}
          </div>
        )}
      </section>

      {(overdue ?? []).length > 0 && (
        <section className="card border-red-200 bg-red-50/40">
          <h2 className="mb-3 font-semibold text-red-800">Просрочки</h2>
          <div className="space-y-2">
            {(overdue ?? []).map((item) => {
              const loan = item.loans as { title: string | null; clients: { full_name: string } | null } | null;
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
    </div>
  );
}
