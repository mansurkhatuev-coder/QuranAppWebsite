import Link from "next/link";
import { EmptyState, StatusBadge } from "@/components/ui";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { formatDateShort, formatMoney, loanEndDate } from "@/lib/utils";
import { syncOverdueSchedules } from "@/lib/overdue";

export default async function LoansPage() {
  const { organization, settings } = await getSessionProfile();
  const supabase = await createClient();
  if (organization && settings) {
    await syncOverdueSchedules(supabase, organization.id, settings.overdue_days, new Date());
  }
  const { data: loans, error } = await supabase
    .from("loans")
    .select("*, clients(full_name), investors(name)")
    .eq("organization_id", organization!.id)
    .order("created_at", { ascending: false });

  const list = loans ?? [];
  const activeCount = list.filter((l) => l.status !== "closed").length;
  const closedCount = list.length - activeCount;
  const countHint =
    list.length === 0
      ? "Договоры и графики платежей"
      : closedCount > 0
        ? `${list.length} · активных ${activeCount} · закрыто ${closedCount}`
        : `${list.length} ${pluralRassrochki(list.length)}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Рассрочки</h1>
          <p className="text-sm text-[var(--muted)]">{countHint}</p>
        </div>
        <Link href="/loans/new" className="btn-primary">
          + Рассрочка
        </Link>
      </div>

      {error && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Не удалось загрузить рассрочки. Обновите страницу.
        </div>
      )}

      {!error && list.length === 0 ? (
        <EmptyState title="Рассрочек пока нет" description="Создайте первую рассрочку." />
      ) : !error ? (
        <>
          <div className="hidden md:block card overflow-x-auto p-0">
            <table className="min-w-full text-sm">
              <thead className="border-b border-[var(--border)] bg-slate-50 text-left">
                <tr>
                  <th className="px-4 py-3">Клиент</th>
                  <th className="px-4 py-3">Сумма</th>
                  <th className="px-4 py-3">Платёж/мес</th>
                  <th className="px-4 py-3">До</th>
                  <th className="px-4 py-3">Инвестор</th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((loan) => {
                  const until = loanEndDate(loan.start_date, loan.term_months);
                  return (
                    <tr key={loan.id} className="border-b border-[var(--border)]">
                      <td className="px-4 py-3">
                        <p className="font-medium">{loan.clients?.full_name}</p>
                        <p className="text-xs text-[var(--muted)]">{loan.title ?? "Без названия"}</p>
                      </td>
                      <td className="px-4 py-3">{formatMoney(Number(loan.principal))}</td>
                      <td className="px-4 py-3">{formatMoney(Number(loan.monthly_payment))}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {until ? formatDateShort(until) : "—"}
                      </td>
                      <td className="px-4 py-3">{loan.investors?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={loan.status} />
                      </td>
                      <td className="px-4 py-3">
                        <Link className="text-teal-700 underline" href={`/loans/${loan.id}`}>
                          Открыть
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 md:hidden">
            {list.map((loan) => {
              const until = loanEndDate(loan.start_date, loan.term_months);
              return (
                <Link key={loan.id} href={`/loans/${loan.id}`} className="card block">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{loan.clients?.full_name}</p>
                      <p className="text-sm text-[var(--muted)]">
                        {formatMoney(Number(loan.principal))} ·{" "}
                        {formatMoney(Number(loan.monthly_payment))} / мес
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        с {formatDateShort(loan.start_date)}
                        {until ? ` · до ${formatDateShort(until)}` : ""}
                      </p>
                    </div>
                    <StatusBadge status={loan.status} />
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

function pluralRassrochki(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "рассрочка";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "рассрочки";
  return "рассрочек";
}
