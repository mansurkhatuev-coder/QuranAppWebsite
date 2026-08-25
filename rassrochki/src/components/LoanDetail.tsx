"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  LoanGuarantor,
  LoanWithRelations,
  OrganizationSettings,
  PaymentSchedule,
} from "@/types/database";
import { fillContractTemplate, generateContractPdf } from "@/lib/contract";
import {
  PaymentConfirmModal,
  type PaymentConfirmValues,
} from "@/components/PaymentConfirmModal";
import { StatusBadge } from "@/components/ui";
import {
  downloadCsv,
  formatDateShort,
  formatMoney,
  profitFromPaid,
  splitIncome,
} from "@/lib/utils";

export function LoanDetail({
  loan,
  schedules,
  guarantors,
  settings,
  orgName,
}: {
  loan: LoanWithRelations;
  schedules: PaymentSchedule[];
  guarantors: LoanGuarantor[];
  settings: OrganizationSettings;
  orgName: string;
}) {
  const router = useRouter();
  const [pendingSchedule, setPendingSchedule] = useState<PaymentSchedule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openingReceipt, setOpeningReceipt] = useState<string | null>(null);

  const paidTotal = schedules
    .filter((s) => s.status === "paid")
    .reduce((sum, s) => sum + Number(s.paid_amount ?? s.amount), 0);
  const remaining = Number(loan.principal) - paidTotal;
  const totalProfit =
    loan.cost_amount != null
      ? Math.max(Number(loan.principal) - Number(loan.cost_amount), 0)
      : profitFromPaid(
          Number(loan.principal),
          Number(loan.markup_percent ?? 0),
          loan.cost_amount,
          loan.principal
        );
  const earnedProfit = profitFromPaid(
    paidTotal,
    Number(loan.markup_percent ?? 0),
    loan.cost_amount,
    loan.principal
  );
  const split = splitIncome(
    earnedProfit,
    Number(loan.income_share_manager),
    Number(loan.income_share_investor)
  );
  const hasInvestor = Boolean(loan.investor_id && Number(loan.income_share_investor) > 0);

  async function confirmPayment(values: PaymentConfirmValues) {
    if (!pendingSchedule) return;
    const schedule = pendingSchedule;
    setError(null);
    const supabase = createClient();
    const paidAtIso = new Date(`${values.paid_at}T12:00:00`).toISOString();
    const amount = Number(values.amount);

    let receiptPath: string | null = null;
    if (values.file) {
      const ext = values.file.name.split(".").pop()?.toLowerCase() || "jpg";
      const safeExt = ["jpg", "jpeg", "png", "webp", "heic", "pdf"].includes(ext) ? ext : "jpg";
      receiptPath = `${loan.organization_id}/${loan.id}/${schedule.id}-${Date.now()}.${safeExt}`;
      const { error: uploadError } = await supabase.storage
        .from("payment-receipts")
        .upload(receiptPath, values.file, { upsert: false, contentType: values.file.type });
      if (uploadError) throw new Error(uploadError.message);
    }

    const { error: paymentError } = await supabase.from("payments").insert({
      loan_id: loan.id,
      organization_id: loan.organization_id,
      schedule_id: schedule.id,
      amount,
      paid_at: paidAtIso,
      method: values.file ? "transfer_with_receipt" : "manual",
      notes: values.notes.trim() || null,
      receipt_path: receiptPath,
    });

    if (paymentError) throw new Error(paymentError.message);

    const { error: scheduleError } = await supabase
      .from("payment_schedules")
      .update({
        status: "paid",
        paid_at: paidAtIso,
        paid_amount: amount,
        receipt_path: receiptPath,
      })
      .eq("id", schedule.id);

    if (scheduleError) throw new Error(scheduleError.message);

    const allPaid = schedules.every((s) => s.id === schedule.id || s.status === "paid");
    if (allPaid) {
      await supabase.from("loans").update({ status: "closed" }).eq("id", loan.id);
    }

    setPendingSchedule(null);
    router.refresh();
  }

  async function openReceipt(path: string) {
    setOpeningReceipt(path);
    setError(null);
    const supabase = createClient();
    const { data, error: signError } = await supabase.storage
      .from("payment-receipts")
      .createSignedUrl(path, 60 * 10);
    setOpeningReceipt(null);
    if (signError || !data?.signedUrl) {
      setError(signError?.message ?? "Не удалось открыть чек");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  function exportSchedule() {
    downloadCsv(`rassrochka_${loan.id.slice(0, 8)}.csv`, [
      ["Клиент", "Рассрочка", "Дата", "Сумма", "Статус", "Оплачено", "Чек"],
      ...schedules.map((s) => [
        loan.clients?.full_name ?? "",
        loan.title ?? "",
        formatDateShort(s.due_date),
        String(s.amount),
        s.status,
        s.paid_amount != null ? String(s.paid_amount) : "",
        s.receipt_path ? "да" : "",
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

    const guarantorsText =
      guarantors.length === 0
        ? "—"
        : guarantors
            .map(
              (g, i) =>
                `${i + 1}. ${g.full_name}${g.phone ? `, тел. ${g.phone}` : ""}${
                  g.notes ? ` (${g.notes})` : ""
                }`
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
      guarantors: guarantorsText,
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
          <p className="text-sm text-[var(--muted)]">К возврату</p>
          <p className="text-xl font-bold">{formatMoney(Number(loan.principal))}</p>
          {loan.cost_amount != null && (
            <p className="mt-1 text-xs text-[var(--muted)]">
              товар {formatMoney(Number(loan.cost_amount))} + {loan.markup_percent}%
            </p>
          )}
        </div>
        <div className="card">
          <p className="text-sm text-[var(--muted)]">Остаток</p>
          <p className="text-xl font-bold">{formatMoney(Math.max(remaining, 0))}</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--muted)]">Прибыль по сделке</p>
          <p className="text-xl font-bold">{formatMoney(totalProfit)}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            из оплат: {formatMoney(earnedProfit)}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--muted)]">
            {hasInvestor ? "Прибыль: вы / инвестор" : "Прибыль вам"}
          </p>
          <p className="text-sm font-semibold">
            {hasInvestor
              ? `${formatMoney(split.manager)} / ${formatMoney(split.investor)}`
              : formatMoney(earnedProfit)}
          </p>
          {hasInvestor && loan.investors?.name && (
            <p className="mt-1 text-xs text-[var(--muted)]">
              {loan.investors.name}
              {loan.investor_amount != null
                ? ` · вложил ${formatMoney(Number(loan.investor_amount))}`
                : ""}
            </p>
          )}
        </div>
      </div>

      {guarantors.length > 0 && (
        <div className="card">
          <h2 className="mb-3 font-semibold">Поручители</h2>
          <ul className="space-y-2">
            {guarantors.map((g) => (
              <li
                key={g.id}
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
              >
                <p className="font-medium">{g.full_name}</p>
                <p className="text-[var(--muted)]">{g.phone ?? "Телефон не указан"}</p>
                {g.notes && <p className="text-xs text-[var(--muted)]">{g.notes}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

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
                <p className="text-sm text-[var(--muted)]">
                  по графику {formatDateShort(schedule.due_date)}
                  {schedule.status === "paid" && schedule.paid_at
                    ? ` · оплачен ${formatDateShort(schedule.paid_at.slice(0, 10))}`
                    : ""}
                </p>
                {schedule.status === "paid" && schedule.paid_amount != null && (
                  <p className="text-sm font-medium">
                    получено {formatMoney(Number(schedule.paid_amount))}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{formatMoney(Number(schedule.amount))}</span>
                <StatusBadge status={schedule.status} />
                {schedule.status === "paid" && schedule.receipt_path && (
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    disabled={openingReceipt === schedule.receipt_path}
                    onClick={() => openReceipt(schedule.receipt_path!)}
                  >
                    {openingReceipt === schedule.receipt_path ? "…" : "Чек"}
                  </button>
                )}
                {schedule.status !== "paid" && (
                  <button
                    type="button"
                    className="btn-primary text-xs"
                    onClick={() => setPendingSchedule(schedule)}
                  >
                    Внести оплату
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {pendingSchedule && (
        <PaymentConfirmModal
          schedule={pendingSchedule}
          onClose={() => setPendingSchedule(null)}
          onConfirm={confirmPayment}
        />
      )}
    </div>
  );
}
