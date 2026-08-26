"use client";

import { FormEvent, useState } from "react";
import type { PaymentSchedule } from "@/types/database";
import { formatMoney } from "@/lib/utils";
import { friendlyError } from "@/lib/friendly";
import { Spinner } from "@/components/Spinner";
import { scheduleDueRemaining } from "@/lib/schedule-payments";

export type PaymentConfirmValues = {
  paid_at: string;
  amount: string;
  file: File | null;
  notes: string;
  idempotency_key: string;
};

export function PaymentConfirmModal({
  schedule,
  onClose,
  onConfirm,
}: {
  schedule: PaymentSchedule;
  onClose: () => void;
  onConfirm: (values: PaymentConfirmValues) => Promise<void>;
}) {
  const dueRemaining = scheduleDueRemaining(schedule);
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(String(dueRemaining));
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  async function submit(e: FormEvent) {
    e.preventDefault();
    const num = Number(amount);
    if (!paidAt || !num || num <= 0) {
      setError("Укажите дату и сумму оплаты");
      return;
    }
    const expected = dueRemaining;
    if (num + 0.009 < expected) {
      const ok = window.confirm(
        `Сумма меньше платежа по графику (${formatMoney(expected)}). Сохранить частичную оплату? Остаток останется по этому платежу.`
      );
      if (!ok) return;
    } else if (num > expected + 0.009) {
      const ok = window.confirm(
        `Сумма больше платежа по графику (${formatMoney(expected)}). Лишнее автоматически зачтётся на следующие платежи. Продолжить?`
      );
      if (!ok) return;
    }
    setLoading(true);
    setError(null);
    try {
      await onConfirm({
        paid_at: paidAt,
        amount: String(num),
        file,
        notes,
        idempotency_key: idempotencyKey,
      });
    } catch (err) {
      setError(friendlyError("Не удалось сохранить оплату", err));
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="presentation"
    >
      <form
        onSubmit={submit}
        className="card w-full max-w-md space-y-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-bold">Подтверждение оплаты</h2>
          <p className="text-sm text-[var(--muted)]">
            Платёж {schedule.sequence_number} · остаток к оплате {formatMoney(dueRemaining)}
          </p>
        </div>

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div>
          <label className="label">Дата оплаты</label>
          <input
            className="input"
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="label">Сумма, ₽</label>
          <input
            className="input"
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="label">Чек (фото или файл) — по желанию</label>
          <input
            className="input file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-teal-800"
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="mt-1 text-xs text-[var(--muted)]">
            Можно приложить скрин перевода из банка
          </p>
        </div>

        <div>
          <label className="label">Комментарий</label>
          <input
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Например: перевод на карту"
          />
        </div>

        <div className="flex gap-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose} disabled={loading}>
            Отмена
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={loading}>
            {loading ? <Spinner label="Сохраняем…" /> : "Подтвердить оплату"}
          </button>
        </div>
      </form>
    </div>
  );
}
