"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { DraftIndicator } from "@/components/ui";
import { useDraft } from "@/hooks/useDraft";
import { createClient } from "@/lib/supabase/client";
import type { Client, Investor, OrganizationSettings } from "@/types/database";
import {
  buildSchedule,
  calcMonthlyPayment,
  formatDateShort,
  formatMoney,
} from "@/lib/utils";

type LoanDraft = {
  client_id: string;
  investor_id: string;
  title: string;
  principal: string;
  term_months: string;
  start_date: string;
  monthly_payment: string;
  income_share_manager: string;
  income_share_investor: string;
  notes: string;
};

export default function NewLoanPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [settings, setSettings] = useState<OrganizationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const initial: LoanDraft = {
    client_id: "",
    investor_id: "",
    title: "",
    principal: "",
    term_months: String(settings?.default_term_months ?? 12),
    start_date: new Date().toISOString().slice(0, 10),
    monthly_payment: "",
    income_share_manager: String(settings?.income_share_manager ?? 30),
    income_share_investor: String(settings?.income_share_investor ?? 70),
    notes: "",
  };

  const { value, setValue, status, clearDraft } = useDraft<LoanDraft>(
    "draft:new-loan",
    initial
  );

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();
      if (!profile) return;

      const [{ data: clientRows }, { data: investorRows }, { data: settingsRow }] =
        await Promise.all([
          supabase.from("clients").select("*").eq("organization_id", profile.organization_id),
          supabase.from("investors").select("*").eq("organization_id", profile.organization_id),
          supabase
            .from("organization_settings")
            .select("*")
            .eq("organization_id", profile.organization_id)
            .single(),
        ]);

      setClients(clientRows ?? []);
      setInvestors(investorRows ?? []);
      if (settingsRow) {
        setSettings(settingsRow);
        setValue({
          ...value,
          term_months: value.term_months || String(settingsRow.default_term_months),
          income_share_manager:
            value.income_share_manager || String(settingsRow.income_share_manager),
          income_share_investor:
            value.income_share_investor || String(settingsRow.income_share_investor),
        });
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const previewSchedule = useMemo(() => {
    const principal = Number(value.principal);
    const term = Number(value.term_months);
    if (!principal || !term || !value.start_date) return [];
    const monthly =
      Number(value.monthly_payment) || calcMonthlyPayment(principal, term);
    return buildSchedule(principal, term, value.start_date, monthly);
  }, [value]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Нужно войти");
      setLoading(false);
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    if (!profile) {
      setError("Организация не найдена");
      setLoading(false);
      return;
    }

    const principal = Number(value.principal);
    const termMonths = Number(value.term_months);
    const monthlyPayment =
      Number(value.monthly_payment) || calcMonthlyPayment(principal, termMonths);
    const schedule = buildSchedule(principal, termMonths, value.start_date, monthlyPayment);

    const { data: loan, error: loanError } = await supabase
      .from("loans")
      .insert({
        organization_id: profile.organization_id,
        client_id: value.client_id,
        investor_id: value.investor_id || null,
        title: value.title.trim() || null,
        principal,
        term_months: termMonths,
        start_date: value.start_date,
        monthly_payment: monthlyPayment,
        income_share_manager: Number(value.income_share_manager),
        income_share_investor: Number(value.income_share_investor),
        notes: value.notes.trim() || null,
      })
      .select("id")
      .single();

    if (loanError || !loan) {
      setLoading(false);
      setError(loanError?.message ?? "Не удалось создать рассрочку");
      return;
    }

    const { error: scheduleError } = await supabase.from("payment_schedules").insert(
      schedule.map((item) => ({
        loan_id: loan.id,
        organization_id: profile.organization_id,
        sequence_number: item.sequence_number,
        due_date: item.due_date,
        amount: item.amount,
        status: "pending",
      }))
    );

    setLoading(false);
    if (scheduleError) {
      setError(scheduleError.message);
      return;
    }

    clearDraft();
    router.push(`/loans/${loan.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Новая рассрочка</h1>
        <p className="text-sm text-[var(--muted)]">
          Настройки подставлены из раздела «Настройки», можно изменить для этой сделки
        </p>
        <DraftIndicator status={status} />
      </div>

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-4">
          <h2 className="font-semibold">Основное</h2>
          <div>
            <label className="label">Клиент</label>
            <select
              className="input"
              value={value.client_id}
              onChange={(e) => setValue({ ...value, client_id: e.target.value })}
              required
            >
              <option value="">Выберите клиента</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Название / товар</label>
            <input
              className="input"
              value={value.title}
              onChange={(e) => setValue({ ...value, title: e.target.value })}
              placeholder="Например: iPhone 15"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Сумма, ₽</label>
              <input
                className="input"
                type="number"
                min="1"
                step="0.01"
                value={value.principal}
                onChange={(e) => setValue({ ...value, principal: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Срок, мес</label>
              <input
                className="input"
                type="number"
                min="1"
                value={value.term_months}
                onChange={(e) => setValue({ ...value, term_months: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Дата начала</label>
              <input
                className="input"
                type="date"
                value={value.start_date}
                onChange={(e) => setValue({ ...value, start_date: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Платёж в месяц</label>
              <input
                className="input"
                type="number"
                min="1"
                step="0.01"
                value={value.monthly_payment}
                onChange={(e) => setValue({ ...value, monthly_payment: e.target.value })}
                placeholder="Авто"
              />
            </div>
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="font-semibold">Условия сделки</h2>
          <div>
            <label className="label">Инвестор</label>
            <select
              className="input"
              value={value.investor_id}
              onChange={(e) => setValue({ ...value, investor_id: e.target.value })}
            >
              <option value="">Без инвестора</option>
              {investors.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.name} ({inv.share_percent}%)
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Доля менеджера, %</label>
              <input
                className="input"
                type="number"
                min="0"
                max="100"
                value={value.income_share_manager}
                onChange={(e) =>
                  setValue({ ...value, income_share_manager: e.target.value })
                }
              />
            </div>
            <div>
              <label className="label">Доля инвестора, %</label>
              <input
                className="input"
                type="number"
                min="0"
                max="100"
                value={value.income_share_investor}
                onChange={(e) =>
                  setValue({ ...value, income_share_investor: e.target.value })
                }
              />
            </div>
          </div>
          <div>
            <label className="label">Заметки</label>
            <textarea
              className="input min-h-24"
              value={value.notes}
              onChange={(e) => setValue({ ...value, notes: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">График платежей (предпросмотр)</h2>
        {previewSchedule.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Заполните сумму и срок</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {previewSchedule.map((item) => (
              <div
                key={item.sequence_number}
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
              >
                <p className="font-medium">#{item.sequence_number}</p>
                <p>{formatDateShort(item.due_date)}</p>
                <p className="font-semibold">{formatMoney(item.amount)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <button className="btn-primary" type="submit" disabled={loading}>
        {loading ? "Создаём…" : "Создать рассрочку"}
      </button>
    </form>
  );
}
