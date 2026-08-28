"use client";

import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PaymentSchedule } from "@/types/database";
import { formatMoney } from "@/lib/utils";
import { friendlyError } from "@/lib/friendly";
import { Spinner } from "@/components/Spinner";
import { NumericInput } from "@/components/NumericInput";
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
  loanRemaining,
  onClose,
  onConfirm,
}: {
  schedule: PaymentSchedule;
  /** Общий остаток всей рассрочки (не только текущей строки). */
  loanRemaining: number;
  onClose: () => void;
  onConfirm: (values: PaymentConfirmValues) => Promise<void>;
}) {
  const dueRemaining = scheduleDueRemaining(schedule);
  const maxAllowed = Math.round(Math.max(0, loanRemaining) * 100) / 100;
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(String(dueRemaining));
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Блокируем скролл страницы под оверлеем (иначе «кривой» скролл при открытии).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    const num = Number(amount);
    if (!paidAt || !num || num <= 0) {
      setError("Укажите дату и сумму оплаты");
      return;
    }
    if (num > maxAllowed + 0.009) {
      setError(
        `Сумма превышает остаток рассрочки. Максимум: ${formatMoney(maxAllowed)}`
      );
      return;
    }
    const expected = dueRemaining;
    if (num + 0.009 < expected) {
      const ok = window.confirm(
        `Сумма меньше остатка по этому платежу (${formatMoney(expected)}). Сохранить частичную оплату?`
      );
      if (!ok) return;
    } else if (num > expected + 0.009) {
      const ok = window.confirm(
        `Сумма больше текущего платежа (${formatMoney(expected)}). Лишнее будет зачтено на следующие платежи графика (не больше общего остатка ${formatMoney(maxAllowed)}). Продолжить?`
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

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <form
        onSubmit={submit}
        className="card my-auto w-full max-w-md shrink-0 space-y-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-confirm-title"
      >
        <div>
          <h2 id="payment-confirm-title" className="text-lg font-bold">
            Подтверждение оплаты
          </h2>
          <p className="text-sm text-[var(--muted)]">
            Платёж {schedule.sequence_number} · по строке {formatMoney(dueRemaining)}
          </p>
          <p className="text-xs text-[var(--muted)]">
            Остаток всей рассрочки: {formatMoney(maxAllowed)}
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
          <NumericInput
            mode="decimal"
            value={amount}
            onChange={setAmount}
            placeholder="0"
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
    </div>,
    document.body
  );
}
