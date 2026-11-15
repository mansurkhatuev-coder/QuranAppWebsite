"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { EmptyState } from "@/components/ui";
import { useOfflineWorkspace } from "@/components/OfflineBootstrap";
import { LoanDetail } from "@/components/LoanDetail";

export default function LoanPage() {
  const params = useParams<{ id: string }>();
  const loanId = params.id;
  const { snapshot, loaded, online, syncing, error } = useOfflineWorkspace();

  if (!snapshot) {
    return (
      <div className="space-y-3">
        <Link href="/loans" className="text-sm font-medium text-teal-800 hover:underline">
          ← К списку рассрочек
        </Link>
        {!loaded || syncing ? (
          <p className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--muted)]">
            Загружаем данные на устройство…
          </p>
        ) : (
          <EmptyState
            title={online === false ? "Нет сохранённых данных" : "Не удалось загрузить рассрочку"}
            description={
              online === false
                ? "Подключитесь к интернету на этом устройстве, чтобы сохранить рабочую копию."
                : error || "Обновите локальную копию и попробуйте снова."
            }
          />
        )}
      </div>
    );
  }

  const loan = snapshot.loans.find((item) => item.id === loanId);
  if (!loan || !snapshot.settings) {
    return (
      <div className="space-y-3">
        <Link href="/loans" className="text-sm font-medium text-teal-800 hover:underline">
          ← К списку рассрочек
        </Link>
        <EmptyState
          title="Рассрочка не найдена в копии"
          description="Обновите данные, когда интернет будет доступен."
        />
      </div>
    );
  }

  return (
    <LoanDetail
      loan={loan}
      schedules={snapshot.schedules.filter((row) => row.loan_id === loanId)}
      guarantors={snapshot.guarantors.filter((row) => row.loan_id === loanId)}
      settings={snapshot.settings}
      orgName={snapshot.organization?.name ?? "Организация"}
    />
  );
}
