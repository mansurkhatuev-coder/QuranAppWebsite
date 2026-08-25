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
  calcFinancedAmount,
  downloadCsv,
  formatDateShort,
  formatMoney,
} from "@/lib/utils";
import { projectedRemaining, resolveProfitShares } from "@/lib/finance";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { defaultPaymentReminderText } from "@/lib/whatsapp";
import { friendlyError, statusLabelRu } from "@/lib/friendly";
import {
  allocatePaymentToSchedules,
  scheduleDueRemaining,
  sumSchedulePaid,
} from "@/lib/schedule-payments";

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
  const [info, setInfo] = useState<string | null>(null);
  const [openingReceipt, setOpeningReceipt] = useState<string | null>(null);

  const downPayment = Number(loan.down_payment ?? 0);
  const financed = calcFinancedAmount(Number(loan.principal), downPayment);
  const paidTotal = sumSchedulePaid(schedules);
  const remaining = financed - paidTotal;
  const projection = projectedRemaining(loan, paidTotal);
  const shares = resolveProfitShares(loan);
  const hasInvestor = Boolean(
    loan.investor_id && (Number(loan.investor_amount) > 0 || shares.investor > 0)
  );
  const nextUnpaid = [...schedules]
    .filter((s) => s.status !== "paid")
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const whatsappReminder = nextUnpaid
    ? defaultPaymentReminderText({
        clientName: loan.clients?.full_name,
        productName: loan.title,
        amount: Number(nextUnpaid.amount),
        dueDate: formatDateShort(nextUnpaid.due_date),
      })
    : undefined;

  async function confirmPayment(values: PaymentConfirmValues) {
    if (!pendingSchedule) return;
    const schedule = pendingSchedule;
    setError(null);
    setInfo(null);
    const supabase = createClient();
    const paidAtIso = new Date(`${values.paid_at}T12:00:00`).toISOString();
    const amount = Number(values.amount);

    let receiptPath: string | null = null;
    if (values.file) {
      const ext = values.file.name.split(".").pop()?.toLowerCase() || "jpg";
      const safeExt = ["jpg", "jpeg", "png", "webp", "heic", "pdf"].includes(ext) ? ext : "jpg";
      if (values.file.size > 8 * 1024 * 1024) {
        throw new Error("Чек слишком большой (макс. 8 МБ)");
      }
      const mime =
        values.file.type && values.file.type.startsWith("image/")
          ? values.file.type
          : values.file.type === "application/pdf"
            ? "application/pdf"
            : safeExt === "pdf"
              ? "application/pdf"
              : "image/jpeg";
      receiptPath = `${loan.organization_id}/${loan.id}/${schedule.id}-${Date.now()}.${safeExt}`;
      const { error: uploadError } = await supabase.storage
        .from("payment-receipts")
        .upload(receiptPath, values.file, { upsert: false, contentType: mime });
      if (uploadError) throw new Error("Не удалось загрузить чек");
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

    if (paymentError) throw new Error("Не удалось сохранить оплату");

    const { updates, surplus } = allocatePaymentToSchedules(
      schedules,
      schedule.id,
      amount,
      paidAtIso,
      receiptPath
    );

    if (updates.length === 0) {
      throw new Error("Не удалось распределить оплату по графику");
    }

    for (const row of updates) {
      const { error: scheduleError } = await supabase
        .from("payment_schedules")
        .update({
          status: row.status,
          paid_at: row.paid_at,
          paid_amount: row.paid_amount,
          receipt_path: row.receipt_path,
        })
        .eq("id", row.id);

      if (scheduleError) throw new Error("Не удалось сохранить оплату");
    }

    const paidTotalAfter = paidTotal + amount;
    if (paidTotalAfter + 0.009 >= financed) {
      const { error: closeError } = await supabase
        .from("loans")
        .update({ status: "closed" })
        .eq("id", loan.id);
      if (closeError) {
        setError("Оплата сохранена, но не удалось закрыть рассрочку — обновите страницу");
      }
    } else if (surplus > 0.009) {
      setInfo(`Зачислено с переплатой: ${formatMoney(surplus)} сверх суммы по графику`);
    } else if (updates.length > 1) {
      setInfo("Переплата зачтена на следующие платежи по графику");
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
      setError(friendlyError("Не удалось открыть чек", signError));
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
        statusLabelRu(s.status),
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
      amount: formatMoney(Number(loan.principal)),
      down_payment: formatMoney(Number(loan.down_payment ?? 0)),
      financed: formatMoney(financed),
      term_months: String(loan.term_months),
      monthly_payment: formatMoney(Number(loan.monthly_payment)),
      start_date: formatDateShort(loan.start_date),
      schedule: scheduleText,
      manager_share: String(shares.manager),
      investor_share: String(shares.investor),
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
          {loan.clients?.phone ? (
            <p className="mt-1 text-sm text-[var(--muted)]">{loan.clients.phone}</p>
          ) : null}
          <div className="mt-2">
            <StatusBadge status={loan.status} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {loan.clients?.phone ? (
            <WhatsAppButton
              phone={loan.clients.phone}
              text={whatsappReminder}
              label="Написать в WhatsApp"
              className="btn-secondary"
            />
          ) : null}
          <button type="button" className="btn-secondary" onClick={exportSchedule}>
            Скачать график
          </button>
          <button type="button" className="btn-primary" onClick={printContract}>
            Печать договора
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {info && !error && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{info}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <p className="text-sm text-[var(--muted)]">К возврату всего</p>
          <p className="text-xl font-bold">{formatMoney(Number(loan.principal))}</p>
          {loan.cost_amount != null && (
            <p className="mt-1 text-xs text-[var(--muted)]">
              товар {formatMoney(Number(loan.cost_amount))} + {loan.markup_percent}%
            </p>
          )}
        </div>
        <div className="card">
          <p className="text-sm text-[var(--muted)]">Взнос</p>
          <p className="text-xl font-bold">{formatMoney(downPayment)}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            в рассрочку {formatMoney(financed)}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--muted)]">Остаток по графику</p>
          <p className="text-xl font-bold">{formatMoney(Math.max(remaining, 0))}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            платёж / мес {formatMoney(Number(loan.monthly_payment))}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--muted)]">Прибыль по сделке</p>
          <p className="text-xl font-bold">{formatMoney(projection.profit)}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            собрано прибыли: {formatMoney(projection.earnedProfit)} ·{" "}
            {Math.round(projection.progress * 100)}%
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card space-y-2">
          <p className="text-sm font-semibold">Вам (предполагаемо)</p>
          <div className="flex justify-between text-sm">
            <span className="text-[var(--muted)]">Прибыль всего</span>
            <span className="font-medium">{formatMoney(projection.ownerProfit)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[var(--muted)]">Уже «заработано»</span>
            <span>{formatMoney(projection.earnedOwnerProfit)}</span>
          </div>
          <div className="flex justify-between text-sm border-t border-[var(--border)] pt-2">
            <span className="text-[var(--muted)]">Ещё ожидать</span>
            <span className="font-semibold text-teal-800">
              {formatMoney(projection.ownerStillToReceive)}
            </span>
          </div>
        </div>

        <div className="card space-y-2">
          <p className="text-sm font-semibold">
            {hasInvestor ? `Инвестор${loan.investors?.name ? `: ${loan.investors.name}` : ""}` : "Инвестор"}
          </p>
          {hasInvestor ? (
            <>
              <p className="text-xs text-[var(--muted)]">
                Доля {shares.investor}% от прибыли
                {shares.mode === "by_capital" ? " (по вкладу)" : ""}
                {projection.investorCapital > 0
                  ? ` · вложил ${formatMoney(projection.investorCapital)}`
                  : ""}
              </p>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--muted)]">Вернуть капитал</span>
                <span>{formatMoney(projection.investorCapital)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--muted)]">Его прибыль</span>
                <span>{formatMoney(projection.investorProfit)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--muted)]">Всего ожидает</span>
                <span className="font-medium">
                  {formatMoney(projection.investorExpectedTotal)}
                </span>
              </div>
              <div className="flex justify-between text-sm border-t border-[var(--border)] pt-2">
                <span className="text-[var(--muted)]">Ещё получить</span>
                <span className="font-semibold text-teal-800">
                  {formatMoney(projection.investorStillToReceive)}
                </span>
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">Без инвестора — вся прибыль вам</p>
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
          {schedules.map((schedule) => {
            const dueLeft = scheduleDueRemaining(schedule);
            const paid = Number(schedule.paid_amount ?? 0);
            const expected = Number(schedule.amount);
            return (
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
                {schedule.status === "paid" && paid > 0 && (
                  <p className="text-sm font-medium text-teal-800">
                    получено {formatMoney(paid)}
                    {paid > expected + 0.009 ? ` · переплата ${formatMoney(paid - expected)}` : ""}
                  </p>
                )}
                {schedule.status !== "paid" && paid > 0 && (
                  <p className="text-sm font-medium text-amber-800">
                    внесено {formatMoney(paid)} · осталось {formatMoney(dueLeft)}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{formatMoney(expected)}</span>
                <StatusBadge status={schedule.status} />
                {schedule.receipt_path && (
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
            );
          })}
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
