"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LoanWithRelations, OrganizationSettings, PaymentSchedule } from "@/types/database";
import { fillContractTemplate, generateContractPdf } from "@/lib/contract";
import { StatusBadge } from "@/components/ui";
import {
  downloadCsv,
  formatDateShort,
  formatMoney,
  splitIncome,
} from "@/lib/utils";

export function LoanDetail({
  loan,
  schedules,
  settings,
  orgName,
}: {
  loan: LoanWithRelations;
  schedules: PaymentSchedule[];
  settings: OrganizationSettings;
  orgName: string;
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const paidTotal = schedules
    .filter((s) => s.status === "paid")
    .reduce((sum, s) => sum + Number(s.paid_amount ?? s.amount), 0);
  const remaining = Number(loan.principal) - paidTotal;
  const split = splitIncome(
    paidTotal,
    Number(loan.income_share_manager),
    Number(loan.income_share_investor)
  );

  async function markPaid(schedule: PaymentSchedule) {
    setLoadingId(schedule.id);
    setError(null);
    const supabase = createClient();
    const now = new Date().toISOString();

    const { error: paymentError } = await supabase.from("payments").insert({
      loan_id: loan.id,
      organization_id: loan.organization_id,
      schedule_id: schedule.id,
      amount: schedule.amount,
      paid_at: now,
      method: "cash",
    });

    if (paymentError) {
      setError(paymentError.message);
      setLoadingId(null);
      return;
    }

    const { error: scheduleError } = await supabase
      .from("payment_schedules")
      .update({
        status: "paid",
        paid_at: now,
        paid_amount: schedule.amount,
      })
      .eq("id", schedule.id);

    setLoadingId(null);
    if (scheduleError) {
      setError(scheduleError.message);
      return;
    }

    const allPaid = schedules.every((s) => s.id === schedule.id || s.status === "paid");
    if (allPaid) {
      await supabase.from("loans").update({ status: "closed" }).eq("id", loan.id);
    }

    router.refresh();
  }

  function exportSchedule() {
    downloadCsv(`rassrochka_${loan.id.slice(0, 8)}.csv`, [
      ["Клиент", "Рассрочка", "Дата", "Сумма", "Статус"],
      ...schedules.map((s) => [
        loan.clients?.full_name ?? "",
        loan.title ?? "",
        formatDateShort(s.due_date),
        String(s.amount),
        s.status,
      ]),
    ]);
  }

  function printContract() {
    const scheduleText = schedules
      .map(
        (s) =>
          `${s.sequence_number}. ${formatDateShort(s.due_date)} — ${formatMoney(Number(s.amount))}`
      )
      .join("\n");

    const body = fillContractTemplate(settings.contract_template, {
      organization: orgName,
      client: loan.clients?.full_name ?? "",
      phone: loan.clients?.phone ?? "",
      amount: String(loan.principal),
      term_months: String(loan.term_months),
      monthly_payment: String(loan.monthly_payment),
      start_date: formatDateShort(loan.start_date),
      schedule: scheduleText,
      manager_share: String(loan.income_share_manager),
      investor_share: String(loan.income_share_investor),
      investor: loan.investors?.name ?? "—",
    });

    generateContractPdf(`Договор_${loan.clients?.full_name ?? "client"}`, body);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{loan.clients?.full_name}</h1>
          <p className="text-sm text-[var(--muted)]">{loan.title ?? "Рассрочка"}</p>
          <div className="mt-2">
            <StatusBadge status={loan.status} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={exportSchedule}>
            Экспорт CSV
          </button>
          <button type="button" className="btn-primary" onClick={printContract}>
            Договор PDF
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <p className="text-sm text-[var(--muted)]">Сумма</p>
          <p className="text-xl font-bold">{formatMoney(Number(loan.principal))}</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--muted)]">Остаток</p>
          <p className="text-xl font-bold">{formatMoney(Math.max(remaining, 0))}</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--muted)]">Платёж / мес</p>
          <p className="text-xl font-bold">{formatMoney(Number(loan.monthly_payment))}</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--muted)]">30/70 от оплат</p>
          <p className="text-sm font-semibold">
            {formatMoney(split.manager)} / {formatMoney(split.investor)}
          </p>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">График платежей</h2>
        <div className="space-y-2">
          {schedules.map((schedule) => (
            <div
              key={schedule.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] p-3"
            >
              <div>
                <p className="font-medium">Платёж #{schedule.sequence_number}</p>
                <p className="text-sm text-[var(--muted)]">{formatDateShort(schedule.due_date)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{formatMoney(Number(schedule.amount))}</span>
                <StatusBadge status={schedule.status} />
                {schedule.status !== "paid" && (
                  <button
                    type="button"
                    className="btn-primary text-xs"
                    disabled={loadingId === schedule.id}
                    onClick={() => markPaid(schedule)}
                  >
                    {loadingId === schedule.id ? "…" : "Оплачен"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
