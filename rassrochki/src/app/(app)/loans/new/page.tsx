"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { DraftIndicator } from "@/components/ui";
import { useDraft } from "@/hooks/useDraft";
import { createClient } from "@/lib/supabase/client";
import type { Client, Investor, OrganizationSettings } from "@/types/database";
import {
  MARKUP_PRESETS,
  buildSchedule,
  calcMonthlyPayment,
  calcProfit,
  calcTotalWithMarkup,
  formatDateShort,
  formatMoney,
  splitIncome,
} from "@/lib/utils";

type LoanDraft = {
  client_id: string;
  investor_id: string;
  title: string;
  cost_amount: string;
  markup_percent: string;
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
  const [orgId, setOrgId] = useState<string | null>(null);
  const [settings, setSettings] = useState<OrganizationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState({ full_name: "", phone: "" });
  const [savingClient, setSavingClient] = useState(false);

  const initial: LoanDraft = {
    client_id: "",
    investor_id: "",
    title: "",
    cost_amount: "",
    markup_percent: "30",
    term_months: "12",
    start_date: new Date().toISOString().slice(0, 10),
    monthly_payment: "",
    income_share_manager: "30",
    income_share_investor: "70",
    notes: "",
  };

  const { value, setValue, status, clearDraft } = useDraft<LoanDraft>(
    "draft:new-loan-v2",
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
      setOrgId(profile.organization_id);

      const [{ data: clientRows }, { data: investorRows }, { data: settingsRow }] =
        await Promise.all([
          supabase
            .from("clients")
            .select("*")
            .eq("organization_id", profile.organization_id)
            .order("full_name"),
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
          markup_percent:
            value.markup_percent ||
            String(settingsRow.default_markup_percent ?? 30),
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

  const hasInvestors = investors.length > 0;
  const selectedClient = clients.find((c) => c.id === value.client_id);

  const cost = Number(value.cost_amount) || 0;
  const markup = Number(value.markup_percent) || 0;
  const principal = cost > 0 ? calcTotalWithMarkup(cost, markup) : 0;
  const profit = cost > 0 ? calcProfit(cost, markup) : 0;
  const profitSplit = splitIncome(
    profit,
    hasInvestors ? Number(value.income_share_manager) : 100,
    hasInvestors ? Number(value.income_share_investor) : 0
  );

  const previewSchedule = useMemo(() => {
    const term = Number(value.term_months);
    if (!principal || !term || !value.start_date) return [];
    const monthly =
      Number(value.monthly_payment) || calcMonthlyPayment(principal, term);
    return buildSchedule(principal, term, value.start_date, monthly);
  }, [principal, value.term_months, value.start_date, value.monthly_payment]);

  async function addClientInline(e: FormEvent) {
    e.preventDefault();
    if (!orgId || !newClient.full_name.trim()) return;
    setSavingClient(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("clients")
      .insert({
        organization_id: orgId,
        full_name: newClient.full_name.trim(),
        phone: newClient.phone.trim() || null,
      })
      .select("*")
      .single();
    setSavingClient(false);
    if (insertError || !data) {
      setError(insertError?.message ?? "Не удалось добавить клиента");
      return;
    }
    setClients((prev) => [...prev, data].sort((a, b) => a.full_name.localeCompare(b.full_name, "ru")));
    setValue({ ...value, client_id: data.id });
    setNewClient({ full_name: "", phone: "" });
    setShowNewClient(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!value.client_id) {
      setError("Выберите или добавьте клиента");
      setLoading(false);
      return;
    }

    if (selectedClient?.is_blacklisted) {
      setError("Клиент в чёрном списке. Снимите пометку или выберите другого.");
      setLoading(false);
      return;
    }

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

    const termMonths = Number(value.term_months);
    const total = calcTotalWithMarkup(cost, markup);
    const monthlyPayment =
      Number(value.monthly_payment) || calcMonthlyPayment(total, termMonths);
    const schedule = buildSchedule(total, termMonths, value.start_date, monthlyPayment);

    const useInvestor = hasInvestors && value.investor_id;
    const managerShare = useInvestor ? Number(value.income_share_manager) : 100;
    const investorShare = useInvestor ? Number(value.income_share_investor) : 0;

    const { data: loan, error: loanError } = await supabase
      .from("loans")
      .insert({
        organization_id: profile.organization_id,
        client_id: value.client_id,
        investor_id: useInvestor ? value.investor_id : null,
        title: value.title.trim() || null,
        cost_amount: cost,
        markup_percent: markup,
        principal: total,
        term_months: termMonths,
        start_date: value.start_date,
        monthly_payment: monthlyPayment,
        income_share_manager: managerShare,
        income_share_investor: investorShare,
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
          Цена товара + наценка = сумма к возврату. Прибыль делят владелец и инвестор.
        </p>
        <DraftIndicator status={status} />
      </div>

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-4">
          <h2 className="font-semibold">Клиент и товар</h2>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="label mb-0">Клиент</label>
              <button
                type="button"
                className="text-sm font-medium text-teal-700"
                onClick={() => setShowNewClient((v) => !v)}
              >
                {showNewClient ? "Отмена" : "+ Новый клиент"}
              </button>
            </div>

            {showNewClient ? (
              <div className="space-y-2 rounded-xl border border-dashed border-teal-300 bg-teal-50/40 p-3">
                <input
                  className="input"
                  placeholder="ФИО"
                  value={newClient.full_name}
                  onChange={(e) => setNewClient({ ...newClient, full_name: e.target.value })}
                  required={showNewClient}
                />
                <input
                  className="input"
                  placeholder="Телефон"
                  value={newClient.phone}
                  onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                />
                <button
                  type="button"
                  className="btn-primary w-full"
                  disabled={savingClient || !newClient.full_name.trim()}
                  onClick={addClientInline}
                >
                  {savingClient ? "Добавляем…" : "Добавить и выбрать"}
                </button>
              </div>
            ) : (
              <select
                className="input"
                value={value.client_id}
                onChange={(e) => setValue({ ...value, client_id: e.target.value })}
                required
              >
                <option value="">Выберите клиента</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.is_blacklisted ? "⛔ " : ""}
                    {c.full_name}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </option>
                ))}
              </select>
            )}

            {selectedClient?.is_blacklisted && (
              <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                Клиент в чёрном списке
                {selectedClient.blacklist_note ? `: ${selectedClient.blacklist_note}` : ""}
              </p>
            )}
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
              <label className="label">Цена товара, ₽</label>
              <input
                className="input"
                type="number"
                min="1"
                step="0.01"
                value={value.cost_amount}
                onChange={(e) => setValue({ ...value, cost_amount: e.target.value })}
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

          <div>
            <label className="label">Наценка (прибыль), %</label>
            <div className="mb-2 flex flex-wrap gap-2">
              {MARKUP_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    Number(value.markup_percent) === p
                      ? "bg-teal-700 text-white"
                      : "border border-[var(--border)] bg-white text-slate-700"
                  }`}
                  onClick={() => setValue({ ...value, markup_percent: String(p) })}
                >
                  {p}%
                </button>
              ))}
            </div>
            <input
              className="input"
              type="number"
              min="0"
              max="500"
              step="0.01"
              value={value.markup_percent}
              onChange={(e) => setValue({ ...value, markup_percent: e.target.value })}
            />
            <p className="mt-1 text-xs text-[var(--muted)]">
              Пример: товар 10 000 ₽ + 30% → к возврату 13 000 ₽, прибыль 3 000 ₽
            </p>
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
          <h2 className="font-semibold">Расчёт и условия</h2>

          <div className="grid gap-2 rounded-xl bg-slate-50 p-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-[var(--muted)]">К возврату</span>
              <span className="font-semibold">{principal ? formatMoney(principal) : "—"}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[var(--muted)]">Прибыль</span>
              <span className="font-semibold text-teal-800">
                {profit ? formatMoney(profit) : "—"}
              </span>
            </div>
            {principal > 0 && Number(value.term_months) > 0 && (
              <div className="flex justify-between gap-2">
                <span className="text-[var(--muted)]">≈ платёж / мес</span>
                <span className="font-semibold">
                  {formatMoney(
                    Number(value.monthly_payment) ||
                      calcMonthlyPayment(principal, Number(value.term_months))
                  )}
                </span>
              </div>
            )}
          </div>

          {hasInvestors ? (
            <>
              <div>
                <label className="label">Инвестор</label>
                <select
                  className="input"
                  value={value.investor_id}
                  onChange={(e) => {
                    const inv = investors.find((i) => i.id === e.target.value);
                    setValue({
                      ...value,
                      investor_id: e.target.value,
                      income_share_investor: inv
                        ? String(inv.share_percent)
                        : value.income_share_investor,
                      income_share_manager: inv
                        ? String(100 - Number(inv.share_percent))
                        : value.income_share_manager,
                    });
                  }}
                >
                  <option value="">Без инвестора (вся прибыль вам)</option>
                  {investors.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.name} ({inv.share_percent}%)
                    </option>
                  ))}
                </select>
              </div>

              {value.investor_id && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label">Доля владельца, %</label>
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
                  {profit > 0 && (
                    <p className="text-sm text-[var(--muted)]">
                      Из прибыли {formatMoney(profit)}: вам {formatMoney(profitSplit.manager)},
                      инвестору {formatMoney(profitSplit.investor)}
                    </p>
                  )}
                </>
              )}
            </>
          ) : (
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-[var(--muted)]">
              Инвесторов пока нет — поля инвестора скрыты. Вся прибыль идёт вам. Добавить
              инвесторов можно в «Настройки».
            </p>
          )}

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
          <p className="text-sm text-[var(--muted)]">Укажите цену товара и срок</p>
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

      <button
        className="btn-primary"
        type="submit"
        disabled={loading || selectedClient?.is_blacklisted}
      >
        {loading ? "Создаём…" : "Создать рассрочку"}
      </button>
    </form>
  );
}
