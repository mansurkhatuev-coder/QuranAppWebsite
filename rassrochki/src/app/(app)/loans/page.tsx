import Link from "next/link";
import { LoansList } from "@/components/LoansList";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
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

      {!error ? <LoansList loans={list} /> : null}
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
