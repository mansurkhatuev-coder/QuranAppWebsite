import Link from "next/link";
import { EmptyState, StatusBadge } from "@/components/ui";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { formatDateShort, formatMoney } from "@/lib/utils";

export default async function LoansPage() {
  const { organization } = await getSessionProfile();
  const supabase = await createClient();
  const { data: loans } = await supabase
    .from("loans")
    .select("*, clients(full_name), investors(name)")
    .eq("organization_id", organization!.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Рассрочки</h1>
          <p className="text-sm text-[var(--muted)]">Договоры и графики платежей</p>
        </div>
        <Link href="/loans/new" className="btn-primary">
          + Рассрочка
        </Link>
      </div>

      {(loans ?? []).length === 0 ? (
        <EmptyState title="Рассрочек пока нет" description="Создайте первую рассрочку." />
      ) : (
        <>
          <div className="hidden md:block card overflow-x-auto p-0">
            <table className="min-w-full text-sm">
              <thead className="border-b border-[var(--border)] bg-slate-50 text-left">
                <tr>
                  <th className="px-4 py-3">Клиент</th>
                  <th className="px-4 py-3">Сумма</th>
                  <th className="px-4 py-3">Платёж/мес</th>
                  <th className="px-4 py-3">Инвестор</th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {(loans ?? []).map((loan) => (
                  <tr key={loan.id} className="border-b border-[var(--border)]">
                    <td className="px-4 py-3">
                      <p className="font-medium">{loan.clients?.full_name}</p>
                      <p className="text-xs text-[var(--muted)]">{loan.title ?? "Без названия"}</p>
                    </td>
                    <td className="px-4 py-3">{formatMoney(Number(loan.principal))}</td>
                    <td className="px-4 py-3">{formatMoney(Number(loan.monthly_payment))}</td>
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
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 md:hidden">
            {(loans ?? []).map((loan) => (
              <Link key={loan.id} href={`/loans/${loan.id}`} className="card block">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{loan.clients?.full_name}</p>
                    <p className="text-sm text-[var(--muted)]">
                      {formatMoney(Number(loan.monthly_payment))} / мес
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      с {formatDateShort(loan.start_date)}
                    </p>
                  </div>
                  <StatusBadge status={loan.status} />
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
