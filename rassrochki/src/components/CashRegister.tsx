"use client";

import { useState, type FormEvent } from "react";
import { useOfflineWorkspace } from "@/components/OfflineBootstrap";
import { EmptyState } from "@/components/ui";
import { buildCashRegisterSummary, cashTransactionLabel } from "@/lib/cash-register";
import { formatDateShort, formatMoney } from "@/lib/utils";
import type { CashTransactionType } from "@/types/database";

type ManualType = Exclude<CashTransactionType, "opening_balance">;

const ACTIONS: Array<{ type: ManualType; label: string; tone: string }> = [
  { type: "deposit", label: "Пополнить", tone: "border-teal-200 bg-teal-50 text-teal-900 hover:bg-teal-100" },
  { type: "investor_contribution", label: "Вклад инвестора", tone: "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100" },
  { type: "owner_withdrawal", label: "Забрал с кассы", tone: "border-slate-200 bg-white text-slate-800 hover:bg-slate-50" },
  { type: "expense", label: "Расход", tone: "border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100" },
  { type: "investor_return", label: "Возврат инвестору", tone: "border-amber-200 bg-white text-amber-900 hover:bg-amber-50" },
];

export function CashRegister() {
  const { snapshot, loaded, online, syncing, error, operations, enqueueCommand } = useOfflineWorkspace();
  const [activeType, setActiveType] = useState<CashTransactionType | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const loans = snapshot?.loans ?? [];
  const payments = snapshot?.payments ?? [];
  const transactions = snapshot?.cash_transactions ?? [];
  const currency = snapshot?.settings?.currency || "RUB";
  const money = (amount: number) => formatMoney(amount, currency);
  const summary = buildCashRegisterSummary({
    loans,
    payments,
    transactions,
    investors: snapshot?.investors ?? [],
  });

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeType || !snapshot) return;
    setFormError(null);
    setSaving(true);
    try {
      const values = new FormData(event.currentTarget);
      const amountText = String(values.get("amount") ?? "").trim();
      const amount = Number(amountText);
      const investorId = String(values.get("investor_id") ?? "").trim() || null;
      const notes = String(values.get("notes") ?? "").trim() || null;
      if (!amountText || !Number.isFinite(amount) || amount < 0 || (activeType !== "opening_balance" && amount <= 0)) {
        throw new Error(activeType === "opening_balance" ? "Введите остаток не меньше нуля." : "Введите сумму больше нуля.");
      }
      if (["investor_contribution", "investor_return"].includes(activeType) && !investorId) {
        throw new Error("Выберите инвестора.");
      }
      if (notes && notes.length > 1000) throw new Error("Заметка не должна быть длиннее 1000 символов.");
      if (activeType === "opening_balance" && !window.confirm(`Установить начальный остаток ${money(amount)}? Его нельзя будет задать повторно.`)) {
        setSaving(false);
        return;
      }

      await enqueueCommand({
        type: "cash.transaction.create",
        payload: {
          transaction: {
            id: crypto.randomUUID(),
            transaction_type: activeType,
            amount: Math.round(amount * 100) / 100,
            occurred_at: new Date().toISOString(),
            investor_id: investorId,
            notes,
          },
        },
      });
      setActiveType(null);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Не удалось сохранить операцию.");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded || (!snapshot && syncing)) {
    return <p className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--muted)]">Загружаем кассу на устройство…</p>;
  }
  if (!snapshot) {
    return <EmptyState title="Касса пока недоступна" description={online === false ? "Подключитесь к интернету, чтобы сохранить данные кассы на этом устройстве." : error || "Обновите данные и попробуйте снова."} />;
  }

  const queuedIds = new Set(
    operations
      .filter((operation) => operation.command.type === "cash.transaction.create")
      .map((operation) => String((operation.command.payload.transaction as { id?: string } | undefined)?.id ?? ""))
  );
  const monthNet = summary.monthInflow - summary.monthOutflow;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Касса</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Общий учёт наличных и переводов. Оплаты по рассрочкам добавляются автоматически.</p>
      </div>

      {!summary.initialized ? (
        <section className="card max-w-2xl border-t-4 border-t-teal-700">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-800">Начало учёта</p>
          <h2 className="mt-2 text-xl font-bold">Сколько денег уже есть?</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
            Укажите общий остаток наличных и на счетах. Старые оплаты уже входят в него и повторно не прибавятся. Новые оплаты и взносы клиентов будут записываться автоматически.
          </p>
          {activeType === "opening_balance" ? (
            <EntryForm
              type="opening_balance"
              investors={snapshot.investors}
              currency={currency}
              saving={saving}
              error={formError}
              onCancel={() => { setActiveType(null); setFormError(null); }}
              onSubmit={saveEntry}
            />
          ) : (
            <button type="button" className="btn-primary mt-4" onClick={() => setActiveType("opening_balance")}>
              Указать остаток
            </button>
          )}
        </section>
      ) : (
        <>
          <section className="relative overflow-hidden rounded-3xl bg-slate-950 px-5 py-6 text-white shadow-md sm:px-7">
            <div className="absolute -right-14 -top-24 h-64 w-64 rounded-full bg-teal-600/20 blur-3xl" aria-hidden="true" />
            <div className="relative">
              <p className="text-sm font-medium text-teal-100">Деньги в кассе и на счетах</p>
              <p className="mt-2 break-words text-3xl font-bold tracking-tight sm:text-4xl">{money(summary.balance)}</p>
              <p className="mt-3 text-xs text-slate-300">
                За месяц поступило {money(summary.monthInflow)} · снятия и расходы {money(summary.monthOutflow)}
              </p>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="card border-l-4 border-l-emerald-600">
              <p className="text-sm text-[var(--muted)]">Поступления за месяц</p>
              <p className="mt-1 text-xl font-bold text-emerald-800">{money(summary.monthInflow)}</p>
            </div>
            <div className="card border-l-4 border-l-rose-500">
              <p className="text-sm text-[var(--muted)]">Расходы и изъятия за месяц</p>
              <p className="mt-1 text-xl font-bold text-rose-800">{money(summary.monthOutflow)}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">Чистое движение: {money(monthNet)}</p>
            </div>
          </section>

          <section className="card">
            <div className="mb-3">
              <h2 className="text-lg font-semibold">Добавить движение</h2>
              <p className="text-xs text-[var(--muted)]">Вклад инвестора и возврат не влияют на показатель прибыли.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {ACTIONS.map((action) => (
                <button
                  key={action.type}
                  type="button"
                  className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 ${action.tone}`}
                  onClick={() => { setActiveType(action.type); setFormError(null); }}
                >
                  {action.label}
                </button>
              ))}
            </div>
            {activeType && activeType !== "opening_balance" && (
              <EntryForm
                type={activeType}
                investors={snapshot.investors}
                currency={currency}
                saving={saving}
                error={formError}
                onCancel={() => { setActiveType(null); setFormError(null); }}
                onSubmit={saveEntry}
              />
            )}
          </section>

          <section className="card">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">История кассы</h2>
                <p className="text-xs text-[var(--muted)]">Учёт начат {summary.startedAt ? formatDateShort(summary.startedAt) : "—"}</p>
              </div>
              <span className="text-sm text-[var(--muted)]">{summary.entries.length} операций</span>
            </div>
            {summary.entries.length ? (
              <div className="divide-y divide-[var(--border)]">
                {summary.entries.map((entry) => {
                  const pending = queuedIds.has(entry.id);
                  const signed = entry.direction === "in" ? "+" : entry.direction === "out" ? "−" : "";
                  const amountClass = entry.direction === "in" ? "text-emerald-800" : entry.direction === "out" ? "text-rose-800" : "text-slate-900";
                  return (
                    <article key={entry.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-medium">{entry.label}</h3>
                          {pending && <span className="badge-yellow">Ожидает отправки</span>}
                        </div>
                        <p className="mt-0.5 text-sm text-[var(--muted)]">{entry.details}</p>
                        {entry.notes && <p className="mt-0.5 break-words text-sm">{entry.notes}</p>}
                        <time className="mt-1 block text-xs text-[var(--muted)]">{formatDateShort(entry.occurredAt)}</time>
                      </div>
                      <strong className={`whitespace-nowrap text-base ${amountClass}`}>
                        {entry.direction === "opening" ? money(entry.amount) : `${signed}${money(entry.amount)}`}
                      </strong>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="py-4 text-sm text-[var(--muted)]">Операций пока нет.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function EntryForm({
  type,
  investors,
  currency,
  saving,
  error,
  onCancel,
  onSubmit,
}: {
  type: CashTransactionType;
  investors: Array<{ id: string; name: string }>;
  currency: string;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isOpening = type === "opening_balance";
  const needsInvestor = type === "investor_contribution" || type === "investor_return";

  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-3 rounded-2xl border border-[var(--border)] bg-slate-50 p-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <h3 className="font-semibold">{cashTransactionLabel(type)}</h3>
        {isOpening && <p className="mt-1 text-xs text-[var(--muted)]">Этот остаток нельзя будет задать повторно.</p>}
      </div>
      <label className="label">
        Сумма, {currency}
        <input className="input mt-1" name="amount" type="number" min={isOpening ? "0" : "0.01"} step="0.01" required autoFocus />
      </label>
      {needsInvestor && (
        <label className="label">
          Инвестор
          <select className="input mt-1" name="investor_id" required defaultValue="">
            <option value="" disabled>Выберите инвестора</option>
            {investors.map((investor) => <option key={investor.id} value={investor.id}>{investor.name}</option>)}
          </select>
        </label>
      )}
      <label className="label sm:col-span-2">
        Комментарий <span className="font-normal text-[var(--muted)]">(необязательно)</span>
        <textarea className="input mt-1 min-h-20 resize-y" name="notes" maxLength={1000} placeholder={type === "expense" ? "На что потрачено" : type === "owner_withdrawal" ? "Зачем забрали" : ""} />
      </label>
      {error && <p className="sm:col-span-2 text-sm text-rose-700" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить"}</button>
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>Отмена</button>
      </div>
    </form>
  );
}
