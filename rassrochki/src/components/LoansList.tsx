"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useOfflineWorkspace } from "@/components/OfflineBootstrap";
import { EmptyState, StatusBadge } from "@/components/ui";
import { Spinner } from "@/components/Spinner";
import { buildLoanDeleteConfirmation } from "@/lib/loan-delete-confirmation";
import { classifyDebtSchedules } from "@/lib/debtor-filter";
import { createDebtorsExport, createFullLoanExport } from "@/lib/loan-export";
import { deliverExportFile } from "@/lib/file-export";
import { formatDateShort, formatMoney, loanEndDate } from "@/lib/utils";
import type { Client, Investor, LoanWithRelations, LoanGuarantor, Payment, PaymentSchedule } from "@/types/database";

type Filter = "all" | "overdue" | "soon" | "normal";
type Props = {
  loans: LoanWithRelations[];
  clients: Client[];
  investors: Investor[];
  schedules: PaymentSchedule[];
  payments: Payment[];
  guarantors: LoanGuarantor[];
  overdueDays: number;
};

function localDateKey(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

export function LoansList({ loans, clients, investors, schedules, payments, guarantors, overdueDays }: Props) {
  const { operations, enqueueCommand } = useOfflineWorkspace();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deletedLoanIds, setDeletedLoanIds] = useState<string[]>([]);
  const normalized = query.trim().toLowerCase();
  const today = localDateKey(new Date());
  const scheduleByLoan = useMemo(() => {
    const result = new Map<string, PaymentSchedule[]>();
    for (const row of schedules) result.set(row.loan_id, [...(result.get(row.loan_id) ?? []), row]);
    return result;
  }, [schedules]);
  const summaryByLoan = useMemo(() => new Map(loans.map((loan) => [
    loan.id,
    classifyDebtSchedules(scheduleByLoan.get(loan.id) ?? [], overdueDays, today),
  ])), [loans, overdueDays, scheduleByLoan, today]);

  const filtered = useMemo(() => {
    const visible = loans.filter((loan) => !deletedLoanIds.includes(loan.id));
    return visible.filter((loan) => {
      const summary = summaryByLoan.get(loan.id)!;
      const name = loan.clients?.full_name?.toLowerCase() ?? "";
      const title = loan.title?.toLowerCase() ?? "";
      const matchesSearch = !normalized || name.includes(normalized) || title.includes(normalized);
      const matchesFilter = filter === "all" ||
        (filter === "overdue" && summary.overdueAmount > 0) ||
        (filter === "soon" && summary.overdueAmount <= 0 && summary.upcomingAmount > 0) ||
        (filter === "normal" && summary.remainingAmount > 0 && summary.overdueAmount <= 0 && summary.upcomingAmount <= 0);
      return matchesSearch && matchesFilter;
    });
  }, [loans, deletedLoanIds, summaryByLoan, normalized, filter]);

  const exportData = { loans: loans.filter((loan) => !deletedLoanIds.includes(loan.id)), clients, investors, guarantors, schedules, payments };
  const selectedVisible = filtered.filter((loan) => selectedIds.includes(loan.id));
  const allVisibleSelected = filtered.length > 0 && selectedVisible.length === filtered.length;

  function loanTone(loan: LoanWithRelations) {
    const summary = summaryByLoan.get(loan.id)!;
    if (summary.overdueAmount > 0) return "overdue";
    if (summary.remainingAmount > 0 && summary.upcomingAmount > 0) return "soon";
    if (summary.remainingAmount > 0) return "normal";
    return "closed";
  }

  async function exportFile(file: File, message: string) {
    setError(null);
    setInfo(null);
    try {
      const result = await deliverExportFile(file);
      setInfo(result === "cancelled" ? "Экспорт отменён." : message);
    } catch {
      setError("Не удалось подготовить файл. Попробуйте ещё раз.");
    }
  }

  async function exportDebtors(overdueOnly = false) {
    const selected = selectedVisible.length > 0 ? selectedVisible : filtered;
    const rows = overdueOnly ? loans : selected;
    const file = createDebtorsExport(exportData, rows, overdueDays, overdueOnly, today);
    await exportFile(file, overdueOnly
      ? "Список просрочивших выгружен в Excel."
      : selectedVisible.length > 0
        ? "Выбранные должники выгружены в Excel."
        : "Должники из текущего списка выгружены в Excel.");
  }

  async function deleteLoan(loan: LoanWithRelations) {
    const label = [loan.clients?.full_name, loan.title].filter(Boolean).join(" — ") || "эту рассрочку";
    if (!window.confirm(buildLoanDeleteConfirmation(label))) return;
    setBusyId(loan.id);
    setError(null);
    setInfo(null);
    try {
      const dependencies = operations
        .filter((operation) => {
          if (operation.state === "conflict") return false;
          const payload = operation.command.payload;
          return payload.loanId === loan.id ||
            (payload.loan as { id?: string } | undefined)?.id === loan.id ||
            (payload.payment as { loan_id?: string } | undefined)?.loan_id === loan.id;
        })
        .map((operation) => operation.id);
      await enqueueCommand({
        type: "loan.delete",
        payload: { loanId: loan.id, expectedVersion: Number(loan.offline_version ?? 1) },
      }, dependencies);
      setDeletedLoanIds((current) => [...current, loan.id]);
      setSelectedIds((current) => current.filter((id) => id !== loan.id));
    } catch {
      setError("Не удалось сохранить удаление на устройстве. Рассрочка не скрыта.");
    } finally {
      setBusyId(null);
    }
  }

  function toggleSelection(id: string) {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  }

  const filters: Array<{ id: Filter; label: string }> = [
    { id: "all", label: "Все" },
    { id: "overdue", label: "Просрочено" },
    { id: "soon", label: "Скоро срок · 7 дней" },
    { id: "normal", label: "В срок" },
  ];

  return (
    <div className="space-y-3">
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p> : null}
      {info ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">{info}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={() => void exportFile(
          createFullLoanExport(exportData), "Полная выгрузка рассрочек подготовлена в Excel."
        )}>Выгрузить все рассрочки · Excel</button>
        <button type="button" className="btn-secondary" onClick={() => void exportDebtors(false)}>
          {selectedVisible.length ? "Выгрузить выбранных · " + selectedVisible.length : "Выгрузить должников"}
        </button>
        <button type="button" className="btn-secondary border-red-200 text-red-700 hover:bg-red-50" onClick={() => void exportDebtors(true)}>
          Выгрузить просрочивших отдельно
        </button>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Фильтр рассрочек">
        {filters.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            className={["rounded-full border px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600",
              filter === id ? "border-teal-700 bg-teal-700 text-white" : "border-[var(--border)] bg-white text-slate-700 hover:bg-slate-50"].join(" ")}
          >{label}</button>
        ))}
      </div>

      <div>
        <label className="label" htmlFor="loan-search">Поиск по имени</label>
        <input id="loan-search" className="input" type="search" value={query}
          onChange={(e) => setQuery(e.target.value)} placeholder="Имя клиента или название" autoComplete="off" />
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
          <span>Найдено: {filtered.length} из {loans.length}</span>
          {filtered.length > 0 ? (
            <label className="inline-flex cursor-pointer items-center gap-2 py-1">
              <input type="checkbox" checked={allVisibleSelected}
                onChange={() => setSelectedIds((current) => allVisibleSelected
                  ? current.filter((id) => !filtered.some((loan) => loan.id === id))
                  : Array.from(new Set([...current, ...filtered.map((loan) => loan.id)])))} />
              Выбрать все найденные
            </label>
          ) : null}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={normalized || filter !== "all" ? "Ничего не найдено" : "Рассрочек пока нет"}
          description={normalized || filter !== "all" ? "Измените фильтр или очистите поиск." : "Создайте первую рассрочку."} />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-[var(--border)] bg-white md:block">
            <table className="min-w-full text-sm">
              <thead className="border-b border-[var(--border)] bg-slate-50 text-left">
                <tr>
                  <th className="w-10 px-3 py-3"><span className="sr-only">Выбрать</span></th>
                  <th className="px-4 py-3">Клиент</th><th className="px-4 py-3">Сумма</th>
                  <th className="px-4 py-3">Платёж/мес</th><th className="px-4 py-3">До</th>
                  <th className="px-4 py-3">Состояние платежей</th><th className="px-4 py-3">Статус</th><th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((loan) => {
                  const until = loanEndDate(loan.start_date, loan.term_months);
                  const tone = loanTone(loan);
                  const summary = summaryByLoan.get(loan.id)!;
                  const rowTone = tone === "overdue" ? "bg-red-50/70" : tone === "soon" ? "bg-amber-50/80" : tone === "normal" ? "bg-emerald-50/50" : "";
                  return (
                    <tr key={loan.id} className={"border-b border-[var(--border)] " + rowTone}>
                      <td className="px-3 py-3 align-top"><input type="checkbox" aria-label={"Выбрать рассрочку " + (loan.clients?.full_name ?? loan.title ?? "без названия")} checked={selectedIds.includes(loan.id)} onChange={() => toggleSelection(loan.id)} /></td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{loan.clients?.full_name}</p>
                        <p className="text-xs text-[var(--muted)]">{loan.title ?? "Без названия"}</p>
                        {loan.clients?.address ? <p className="mt-1 max-w-xs text-xs text-[var(--muted)]">{loan.clients.address}</p> : null}
                      </td>
                      <td className="px-4 py-3">{formatMoney(Number(loan.principal))}</td>
                      <td className="px-4 py-3">{formatMoney(Number(loan.monthly_payment))}</td>
                      <td className="whitespace-nowrap px-4 py-3">{until ? formatDateShort(until) : "—"}</td>
                      <td className="px-4 py-3"><DebtStatus tone={tone} summary={summary} /></td>
                      <td className="px-4 py-3"><StatusBadge status={loan.status} /></td>
                      <td className="px-4 py-3"><LoanActions loan={loan} busy={busyId === loan.id} onDelete={() => void deleteLoan(loan)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 md:hidden">
            {filtered.map((loan) => {
              const until = loanEndDate(loan.start_date, loan.term_months);
              const tone = loanTone(loan);
              const summary = summaryByLoan.get(loan.id)!;
              const cardTone = tone === "overdue" ? "border-l-red-500 bg-red-50/60" : tone === "soon" ? "border-l-amber-400 bg-amber-50/70" : tone === "normal" ? "border-l-emerald-500 bg-emerald-50/50" : "border-l-slate-300";
              return (
                <div key={loan.id} className={"card border-l-4 " + cardTone}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" aria-label={"Выбрать рассрочку " + (loan.clients?.full_name ?? loan.title ?? "без названия")} checked={selectedIds.includes(loan.id)} onChange={() => toggleSelection(loan.id)} className="mt-1" />
                    <Link href={"/loans/" + loan.id} className="min-w-0 flex-1">
                      <p className="font-semibold">{loan.clients?.full_name}</p>
                      <p className="text-sm text-[var(--muted)]">{formatMoney(Number(loan.principal))} · {formatMoney(Number(loan.monthly_payment))} / мес</p>
                      <p className="text-xs text-[var(--muted)]">с {formatDateShort(loan.start_date)}{until ? " · до " + formatDateShort(until) : ""}</p>
                      {loan.clients?.address ? <p className="mt-1 text-xs text-[var(--muted)]">{loan.clients.address}</p> : null}
                      <div className="mt-2"><DebtStatus tone={tone} summary={summary} /></div>
                    </Link>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <StatusBadge status={loan.status} />
                      <LoanActions loan={loan} busy={busyId === loan.id} onDelete={() => void deleteLoan(loan)} compact />
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

function DebtStatus({ tone, summary }: { tone: string; summary: ReturnType<typeof classifyDebtSchedules> }) {
  if (tone === "overdue") return <span className="font-medium text-red-800">Просрочено · {formatMoney(summary.overdueAmount)}</span>;
  if (tone === "soon") return <span className="font-medium text-amber-800">Скоро срок · {summary.upcomingDate ? formatDateShort(summary.upcomingDate) : "7 дней"}</span>;
  if (tone === "normal") return <span className="font-medium text-emerald-800">В срок · остаток {formatMoney(summary.remainingAmount)}</span>;
  return <span className="text-[var(--muted)]">Платежей к оплате нет</span>;
}

function LoanActions({ loan, busy, onDelete, compact = false }: {
  loan: LoanWithRelations;
  busy: boolean;
  onDelete: () => void;
  compact?: boolean;
}) {
  return (
    <div className={"flex items-center " + (compact ? "gap-1" : "justify-end gap-2")}>
      {!compact ? <Link className="text-teal-700 underline" href={"/loans/" + loan.id}>Открыть</Link> : null}
      <Link className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:bg-white hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600" href={"/loans/" + loan.id + "/edit"} aria-label={"Изменить рассрочку: " + (loan.clients?.full_name ?? loan.title ?? "без названия")} title="Изменить"><PencilIcon /></Link>
      <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:cursor-not-allowed disabled:opacity-50" onClick={onDelete} disabled={busy} aria-label={"Удалить рассрочку: " + (loan.clients?.full_name ?? loan.title ?? "без названия")} title={busy ? "Удаляем…" : "Удалить"}>{busy ? <Spinner className="h-4 w-4" /> : <TrashIcon />}</button>
    </div>
  );
}

function PencilIcon() {
  return <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m16 5 3 3M4 20l4.5-1 10.7-10.7a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z" /><path d="M13.5 7.5 16.5 10.5" /></svg>;
}

function TrashIcon() {
  return <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6" /></svg>;
}
