"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState, StatusBadge } from "@/components/ui";
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
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!normalized) return loans;
    return loans.filter((loan) => {
      const name = loan.clients?.full_name?.toLowerCase() ?? "";
      const title = loan.title?.toLowerCase() ?? "";
      return name.includes(normalized) || title.includes(normalized);
    });
  }, [loans, normalized]);

  return (
    <div className="space-y-3">
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
            {filtered.map((loan) => {
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
      )}
    </div>
  );
}
