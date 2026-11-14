"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { EmptyState, StatusBadge } from "@/components/ui";
import { Spinner } from "@/components/Spinner";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/friendly";
import { formatDateShort, formatMoney, loanEndDate } from "@/lib/utils";

export type LoanListRow = {
  id: string;
  title: string | null;
  principal: number;
  monthly_payment: number;
  start_date: string;
  term_months: number;
  status: string;
  clients?: { full_name: string } | null;
  investors?: { name: string } | null;
};

export function LoansList({ loans }: { loans: LoanListRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deletedLoanIds, setDeletedLoanIds] = useState<string[]>([]);
  const normalized = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    const visible = loans.filter((loan) => !deletedLoanIds.includes(loan.id));
    if (!normalized) return visible;
    return visible.filter((loan) => {
      const name = loan.clients?.full_name?.toLowerCase() ?? "";
      const title = loan.title?.toLowerCase() ?? "";
      return name.includes(normalized) || title.includes(normalized);
    });
  }, [loans, normalized, deletedLoanIds]);

  async function deleteLoan(loan: LoanListRow) {
    const label = [loan.clients?.full_name, loan.title].filter(Boolean).join(" — ") || "эту рассрочку";
    const confirmed = window.confirm(
      `Удалить рассрочку «${label}»?\n\nУдалить можно только рассрочку без оплат и чеков. Историю платежей с чеками удалить нельзя.`
    );
    if (!confirmed) return;

    setBusyId(loan.id);
    setError(null);
    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase.rpc("delete_loan_without_payments", {
        p_loan_id: loan.id,
      });

      if (deleteError) {
        const message = deleteError.message?.includes("Нельзя удалить рассрочку")
          ? deleteError.message
          : friendlyError("Не удалось удалить рассрочку", deleteError);
        setError(message);
        return;
      }

      setDeletedLoanIds((current) => [...current, loan.id]);
      router.refresh();
    } catch (deleteError) {
      setError(friendlyError("Не удалось удалить рассрочку", deleteError));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <div>
        <label className="label" htmlFor="loan-search">
          Поиск по имени
        </label>
        <input
          id="loan-search"
          className="input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Имя клиента или название"
          autoComplete="off"
        />
        {normalized ? (
          <p className="mt-1 text-xs text-[var(--muted)]">
            Найдено: {filtered.length} из {loans.length}
          </p>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={normalized ? "Ничего не найдено" : "Рассрочек пока нет"}
          description={
            normalized
              ? "Попробуйте другое имя или очистите поиск."
              : "Создайте первую рассрочку."
          }
        />
      ) : (
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
                {filtered.map((loan) => {
                  const until = loanEndDate(loan.start_date, loan.term_months);
                  return (
                    <tr key={loan.id} className="border-b border-[var(--border)]">
                      <td className="px-4 py-3">
                        <p className="font-medium">{loan.clients?.full_name}</p>
                        <p className="text-xs text-[var(--muted)]">
                          {loan.title ?? "Без названия"}
                        </p>
                      </td>
                      <td className="px-4 py-3">{formatMoney(Number(loan.principal))}</td>
                      <td className="px-4 py-3">
                        {formatMoney(Number(loan.monthly_payment))}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {until ? formatDateShort(until) : "—"}
                      </td>
                      <td className="px-4 py-3">{loan.investors?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={loan.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Link className="text-teal-700 underline" href={`/loans/${loan.id}`}>
                            Открыть
                          </Link>
                          <Link
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:bg-slate-50 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                            href={`/loans/${loan.id}/edit`}
                            aria-label={`Изменить рассрочку: ${loan.clients?.full_name ?? loan.title ?? "без названия"}`}
                            title="Изменить"
                          >
                            <PencilIcon />
                          </Link>
                          <button
                            type="button"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => deleteLoan(loan)}
                            disabled={busyId === loan.id}
                            aria-label={`Удалить рассрочку: ${loan.clients?.full_name ?? loan.title ?? "без названия"}`}
                            title={busyId === loan.id ? "Удаляем…" : "Удалить"}
                          >
                            {busyId === loan.id ? <Spinner className="h-4 w-4" /> : <TrashIcon />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 md:hidden">
            {filtered.map((loan) => {
              const until = loanEndDate(loan.start_date, loan.term_months);
              return (
                <div key={loan.id} className="card">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/loans/${loan.id}`} className="min-w-0 flex-1">
                      <p className="font-semibold">{loan.clients?.full_name}</p>
                      <p className="text-sm text-[var(--muted)]">
                        {formatMoney(Number(loan.principal))} ·{" "}
                        {formatMoney(Number(loan.monthly_payment))} / мес
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        с {formatDateShort(loan.start_date)}
                        {until ? ` · до ${formatDateShort(until)}` : ""}
                      </p>
                    </Link>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <StatusBadge status={loan.status} />
                      <div className="flex items-center gap-1">
                        <Link
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:bg-slate-50 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                          href={`/loans/${loan.id}/edit`}
                          aria-label={`Изменить рассрочку: ${loan.clients?.full_name ?? loan.title ?? "без названия"}`}
                          title="Изменить"
                        >
                          <PencilIcon />
                        </Link>
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => deleteLoan(loan)}
                          disabled={busyId === loan.id}
                          aria-label={`Удалить рассрочку: ${loan.clients?.full_name ?? loan.title ?? "без названия"}`}
                          title={busyId === loan.id ? "Удаляем…" : "Удалить"}
                        >
                          {busyId === loan.id ? <Spinner className="h-4 w-4" /> : <TrashIcon />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m16 5 3 3M4 20l4.5-1 10.7-10.7a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z" />
      <path d="M13.5 7.5 16.5 10.5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6" />
    </svg>
  );
}
