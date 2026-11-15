"use client";

import Link from "next/link";
import { LoansList } from "@/components/LoansList";
import { useOfflineWorkspace } from "@/components/OfflineBootstrap";

export default function LoansPage() {
  const { snapshot, loaded, online, syncing, error } = useOfflineWorkspace();
  const loans = snapshot?.loans ?? [];
  const activeCount = loans.filter((loan) => loan.status !== "closed").length;
  const closedCount = loans.length - activeCount;
  const countHint =
    loans.length === 0
      ? "Договоры и графики платежей"
      : closedCount > 0
        ? `${loans.length} · активных ${activeCount} · закрыто ${closedCount}`
        : `${loans.length} ${pluralRassrochki(loans.length)}`;

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

      {!loaded || (!snapshot && syncing) ? (
        <p className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--muted)]">
          Загружаем данные на устройство…
        </p>
      ) : !snapshot ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {online === false
            ? "На этом устройстве ещё нет сохранённых рассрочек. Подключитесь к интернету, чтобы загрузить данные."
            : error || "Пока не удалось сохранить данные на устройстве. Повторите обновление."}
        </div>
      ) : (
        <LoansList loans={loans} />
      )}
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
