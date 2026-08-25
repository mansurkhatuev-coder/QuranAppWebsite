"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { DraftIndicator } from "@/components/ui";
import { useDraft } from "@/hooks/useDraft";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/friendly";
import type { Client, Investor, OrganizationSettings } from "@/types/database";
import {
  MARKUP_PRESETS,
  TERM_PRESETS,
  buildSchedule,
  calcFinancedAmount,
  calcInvestorShareByCapital,
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
  investor_amount: string;
  title: string;
  cost_amount: string;
  markup_percent: string;
  down_payment: string;
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
  const [customTerm, setCustomTerm] = useState(false);
  const [showNewInvestor, setShowNewInvestor] = useState(false);
  const [newInvestor, setNewInvestor] = useState({ name: "", share_percent: "70" });
  const [savingInvestor, setSavingInvestor] = useState(false);
  const [guarantors, setGuarantors] = useState<
    { full_name: string; phone: string; notes: string }[]
  >([]);
  const [shareManual, setShareManual] = useState(false);

  const initial: LoanDraft = {
    client_id: "",
    investor_id: "",
    investor_amount: "",
    title: "",
    cost_amount: "",
    markup_percent: "30",
    down_payment: "",
    term_months: "12",
    start_date: new Date().toISOString().slice(0, 10),
    monthly_payment: "",
    income_share_manager: "30",
    income_share_investor: "70",
    notes: "",
  };

  const { value, setValue, status, clearDraft } = useDraft<LoanDraft>(
    "draft:new-loan-v4",
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
        const defaultTerm = String(settingsRow.default_term_months ?? 12);
        const isPreset = TERM_PRESETS.some((t) => String(t.months) === defaultTerm);
        if (!isPreset && defaultTerm) setCustomTerm(true);
        setValue({
          ...value,
          term_months: value.term_months || defaultTerm,
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

  const selectedClient = clients.find((c) => c.id === value.client_id);
  const hasInvestors = investors.length > 0;
  const cost = Number(value.cost_amount) || 0;
  const markup = Number(value.markup_percent) || 0;
  const downPayment = Number(value.down_payment) || 0;
  const principal = cost > 0 ? calcTotalWithMarkup(cost, markup) : 0;
  const financed = principal > 0 ? calcFinancedAmount(principal, downPayment) : 0;
  const profit = cost > 0 ? calcProfit(cost, markup) : 0;
  const withInvestor = Boolean(value.investor_id);
  const invested = Number(value.investor_amount) || 0;

  const autoInvestorShare =
    withInvestor && cost > 0 && invested > 0
      ? calcInvestorShareByCapital(invested, cost)
      : 0;
  const investorSharePct = withInvestor
    ? shareManual
      ? Number(value.income_share_investor) || 0
      : autoInvestorShare
    : 0;
  const managerSharePct = withInvestor ? Math.round((100 - investorSharePct) * 100) / 100 : 100;

  const profitSplit = splitIncome(profit, managerSharePct, investorSharePct);
  const investorExpectedTotal = invested + profitSplit.investor;

  useEffect(() => {
    if (!withInvestor || shareManual) return;
    if (!(cost > 0 && invested >= 0)) return;
    const nextInv = String(autoInvestorShare);
    const nextMgr = String(Math.round((100 - autoInvestorShare) * 100) / 100);
    if (
      value.income_share_investor === nextInv &&
      value.income_share_manager === nextMgr
    ) {
      return;
    }
    setValue({
      ...value,
      income_share_investor: nextInv,
      income_share_manager: nextMgr,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.cost_amount, value.investor_amount, value.investor_id, shareManual, autoInvestorShare]);

  const previewSchedule = useMemo(() => {
    const term = Number(value.term_months);
    if (!financed || !term || !value.start_date) return [];
    const monthly =
      Number(value.monthly_payment) || calcMonthlyPayment(financed, term);
    return buildSchedule(financed, term, value.start_date, monthly);
  }, [financed, value.term_months, value.start_date, value.monthly_payment]);

  async function addInvestorInline(e: FormEvent) {
    e.preventDefault();
    if (!orgId || !newInvestor.name.trim()) return;
    setSavingInvestor(true);
    setError(null);
    const share = Number(newInvestor.share_percent) || 70;
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("investors")
      .insert({
        organization_id: orgId,
        name: newInvestor.name.trim(),
        share_percent: share,
      })
      .select("*")
      .single();
    setSavingInvestor(false);
    if (insertError || !data) {
      setError(friendlyError("Не удалось добавить инвестора", insertError));
      return;
    }
    setInvestors((prev) => [...prev, data]);
    setValue({
      ...value,
      investor_id: data.id,
      income_share_investor: String(share),
      income_share_manager: String(100 - share),
    });
    setNewInvestor({ name: "", share_percent: "70" });
    setShowNewInvestor(false);
  }

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
      setError(friendlyError("Не удалось добавить клиента", insertError));
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
      setError("Войдите в аккаунт");
      setLoading(false);
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    if (!profile) {
      setError("Не удалось продолжить. Выйдите и войдите снова");
      setLoading(false);
      return;
    }

    const termMonths = Number(value.term_months);
    const total = calcTotalWithMarkup(cost, markup);
    const down = Number(value.down_payment) || 0;
    if (down > total) {
      setError("Взнос не может быть больше суммы к возврату");
      setLoading(false);
      return;
    }
    const financedAmount = calcFinancedAmount(total, down);
    if (financedAmount <= 0) {
      setError("После взноса нечего разбивать на платежи — уменьшите взнос");
      setLoading(false);
      return;
    }
    const monthlyPayment =
      Number(value.monthly_payment) || calcMonthlyPayment(financedAmount, termMonths);
    const schedule = buildSchedule(
      financedAmount,
      termMonths,
      value.start_date,
      monthlyPayment
    );

    const useInvestor = Boolean(value.investor_id);
    const investorAmount =
      useInvestor && value.investor_amount ? Number(value.investor_amount) : null;
    const managerShare = useInvestor ? managerSharePct : 100;
    const investorShare = useInvestor ? investorSharePct : 0;

    const { data: loan, error: loanError } = await supabase
      .from("loans")
      .insert({
        organization_id: profile.organization_id,
        client_id: value.client_id,
        investor_id: useInvestor ? value.investor_id : null,
        investor_amount: investorAmount,
        title: value.title.trim() || null,
        cost_amount: cost,
        markup_percent: markup,
        principal: total,
        down_payment: down,
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
      setError(friendlyError("Не удалось создать рассрочку", loanError));
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
      setError(friendlyError("Не удалось сохранить график платежей", scheduleError));
      return;
    }

    const guarantorRows = guarantors
      .filter((g) => g.full_name.trim())
      .map((g) => ({
        loan_id: loan.id,
        organization_id: profile.organization_id,
        full_name: g.full_name.trim(),
        phone: g.phone.trim() || null,
        notes: g.notes.trim() || null,
      }));

    if (guarantorRows.length > 0) {
      const { error: guarantorError } = await supabase
        .from("loan_guarantors")
        .insert(guarantorRows);
      if (guarantorError) {
        setError(friendlyError("Не удалось сохранить поручителей", guarantorError));
        return;
      }
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
              <label className="label">Дата начала</label>
              <input
                className="input"
                type="date"
                value={value.start_date}
                onChange={(e) => setValue({ ...value, start_date: e.target.value })}
                required
              />
            </div>
          </div>

          <div>
            <label className="label">Срок рассрочки</label>
            <div className="mb-2 flex flex-wrap gap-2">
              {TERM_PRESETS.map((t) => (
                <button
                  key={t.months}
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    !customTerm && Number(value.term_months) === t.months
                      ? "bg-teal-700 text-white"
                      : "border border-[var(--border)] bg-white text-slate-700"
                  }`}
                  onClick={() => {
                    setCustomTerm(false);
                    setValue({ ...value, term_months: String(t.months), monthly_payment: "" });
                  }}
                >
                  {t.label}
                </button>
              ))}
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  customTerm
                    ? "bg-teal-700 text-white"
                    : "border border-[var(--border)] bg-white text-slate-700"
                }`}
                onClick={() => setCustomTerm(true)}
              >
                Свой срок
              </button>
            </div>
            {customTerm && (
              <div className="flex items-center gap-2">
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="120"
                  value={value.term_months}
                  onChange={(e) =>
                    setValue({ ...value, term_months: e.target.value, monthly_payment: "" })
                  }
                  required
                  placeholder="Число месяцев"
                />
                <span className="shrink-0 text-sm text-[var(--muted)]">мес.</span>
              </div>
            )}
            {!customTerm && (
              <p className="text-xs text-[var(--muted)]">
                Выбрано: {value.term_months} мес.
              </p>
            )}
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

          <div>
            <label className="label">Первоначальный взнос, ₽</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={value.down_payment}
              onChange={(e) =>
                setValue({ ...value, down_payment: e.target.value, monthly_payment: "" })
              }
              placeholder="0 — без взноса"
            />
            <p className="mt-1 text-xs text-[var(--muted)]">
              График платежей считается от оставшейся суммы после взноса
            </p>
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

        <div className="card space-y-4">
          <h2 className="font-semibold">Расчёт и условия</h2>

          <div className="grid gap-2 rounded-xl bg-slate-50 p-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-[var(--muted)]">К возврату всего</span>
              <span className="font-semibold">{principal ? formatMoney(principal) : "—"}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[var(--muted)]">Взнос</span>
              <span className="font-semibold">
                {downPayment ? formatMoney(downPayment) : "0 ₽"}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[var(--muted)]">В рассрочку</span>
              <span className="font-semibold text-teal-800">
                {financed ? formatMoney(financed) : "—"}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[var(--muted)]">Прибыль</span>
              <span className="font-semibold">{profit ? formatMoney(profit) : "—"}</span>
            </div>
            {financed > 0 && Number(value.term_months) > 0 && (
              <div className="flex justify-between gap-2">
                <span className="text-[var(--muted)]">≈ платёж / мес</span>
                <span className="font-semibold">
                  {formatMoney(
                    Number(value.monthly_payment) ||
                      calcMonthlyPayment(financed, Number(value.term_months))
                  )}
                </span>
              </div>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="label mb-0">Инвестор по сделке</label>
              <button
                type="button"
                className="text-sm font-medium text-teal-700"
                onClick={() => setShowNewInvestor((v) => !v)}
              >
                {showNewInvestor ? "Отмена" : "+ Добавить инвестора"}
              </button>
            </div>
            <p className="mb-2 text-xs text-[var(--muted)]">
              Инвестор вкладывает деньги в товар, а долю получает от прибыли (наценки), не
              от всей суммы к возврату.
            </p>

            {showNewInvestor ? (
              <div className="space-y-2 rounded-xl border border-dashed border-teal-300 bg-teal-50/40 p-3">
                <input
                  className="input"
                  placeholder="Имя инвестора"
                  value={newInvestor.name}
                  onChange={(e) => setNewInvestor({ ...newInvestor, name: e.target.value })}
                />
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="100"
                  placeholder="Доля от прибыли, %"
                  value={newInvestor.share_percent}
                  onChange={(e) =>
                    setNewInvestor({ ...newInvestor, share_percent: e.target.value })
                  }
                />
                <button
                  type="button"
                  className="btn-primary w-full"
                  disabled={savingInvestor || !newInvestor.name.trim()}
                  onClick={addInvestorInline}
                >
                  {savingInvestor ? "Добавляем…" : "Добавить и выбрать"}
                </button>
              </div>
            ) : (
              <select
                className="input"
                value={value.investor_id}
                onChange={(e) => {
                  const inv = investors.find((i) => i.id === e.target.value);
                  setShareManual(false);
                  setValue({
                    ...value,
                    investor_id: e.target.value,
                    income_share_investor: inv
                      ? value.income_share_investor
                      : "0",
                    income_share_manager: inv ? value.income_share_manager : "100",
                    investor_amount: e.target.value ? value.investor_amount : "",
                  });
                }}
              >
                <option value="">Без инвестора (вся прибыль вам)</option>
                {investors.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.name} (доля по умолч. {inv.share_percent}%)
                  </option>
                ))}
              </select>
            )}
            {!hasInvestors && !showNewInvestor && (
              <p className="mt-2 text-xs text-[var(--muted)]">
                Список пуст — нажмите «+ Добавить инвестора»
              </p>
            )}
          </div>

          {withInvestor && (
            <>
              <div>
                <label className="label">Сколько вложил инвестор, ₽</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={value.investor_amount}
                  onChange={(e) => {
                    setShareManual(false);
                    setValue({ ...value, investor_amount: e.target.value });
                  }}
                  placeholder="Например: 80000"
                />
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Доля прибыли считается по вкладу: вложил / цена товара.
                  {cost > 0 && invested > 0
                    ? ` Сейчас ${autoInvestorShare}% ( ${formatMoney(invested)} из ${formatMoney(cost)} ).`
                    : " Укажите цену товара и сумму вложений."}
                </p>
              </div>

              <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3 text-sm space-y-1">
                <p className="font-semibold text-teal-900">Предполагаемый доход по сделке</p>
                <div className="flex justify-between gap-2">
                  <span className="text-[var(--muted)]">Прибыль всего</span>
                  <span className="font-medium">{formatMoney(profit)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[var(--muted)]">Вам (прибыль)</span>
                  <span className="font-medium">{formatMoney(profitSplit.manager)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[var(--muted)]">Инвестору прибыль</span>
                  <span className="font-medium">{formatMoney(profitSplit.investor)}</span>
                </div>
                <div className="flex justify-between gap-2 border-t border-teal-200 pt-1">
                  <span className="text-[var(--muted)]">Инвестору всего (вложения + прибыль)</span>
                  <span className="font-semibold text-teal-900">
                    {formatMoney(investorExpectedTotal)}
                  </span>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={shareManual}
                  onChange={(e) => setShareManual(e.target.checked)}
                />
                Задать долю вручную (не по вкладу)
              </label>

              {shareManual && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">Доля владельца от прибыли, %</label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      max="100"
                      value={value.income_share_manager}
                      onChange={(e) => {
                        const manager = Number(e.target.value);
                        setValue({
                          ...value,
                          income_share_manager: e.target.value,
                          income_share_investor: String(Math.max(0, 100 - manager)),
                        });
                      }}
                    />
                  </div>
                  <div>
                    <label className="label">Доля инвестора от прибыли, %</label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      max="100"
                      value={value.income_share_investor}
                      onChange={(e) => {
                        const invShare = Number(e.target.value);
                        setValue({
                          ...value,
                          income_share_investor: e.target.value,
                          income_share_manager: String(Math.max(0, 100 - invShare)),
                        });
                      }}
                    />
                  </div>
                </div>
              )}

              {!shareManual && withInvestor && (
                <p className="text-sm text-[var(--muted)]">
                  Доли: вам {managerSharePct}% / инвестору {investorSharePct}% от прибыли
                </p>
              )}
            </>
          )}

          <div className="space-y-3 border-t border-[var(--border)] pt-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold">Поручители</h3>
                <p className="text-xs text-[var(--muted)]">Можно несколько или ни одного</p>
              </div>
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() =>
                  setGuarantors((prev) => [...prev, { full_name: "", phone: "", notes: "" }])
                }
              >
                + Поручитель
              </button>
            </div>
            {guarantors.length === 0 && (
              <p className="text-sm text-[var(--muted)]">Поручителей пока нет</p>
            )}
            {guarantors.map((g, index) => (
              <div
                key={index}
                className="space-y-2 rounded-xl border border-[var(--border)] bg-slate-50/80 p-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Поручитель {index + 1}</p>
                  <button
                    type="button"
                    className="text-xs text-red-600"
                    onClick={() => setGuarantors((prev) => prev.filter((_, i) => i !== index))}
                  >
                    Удалить
                  </button>
                </div>
                <input
                  className="input"
                  placeholder="ФИО"
                  value={g.full_name}
                  onChange={(e) =>
                    setGuarantors((prev) =>
                      prev.map((row, i) =>
                        i === index ? { ...row, full_name: e.target.value } : row
                      )
                    )
                  }
                />
                <input
                  className="input"
                  placeholder="Телефон"
                  value={g.phone}
                  onChange={(e) =>
                    setGuarantors((prev) =>
                      prev.map((row, i) =>
                        i === index ? { ...row, phone: e.target.value } : row
                      )
                    )
                  }
                />
                <input
                  className="input"
                  placeholder="Заметка (необяз.)"
                  value={g.notes}
                  onChange={(e) =>
                    setGuarantors((prev) =>
                      prev.map((row, i) =>
                        i === index ? { ...row, notes: e.target.value } : row
                      )
                    )
                  }
                />
              </div>
            ))}
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
          <p className="text-sm text-[var(--muted)]">
            Укажите цену и срок (после взноса должна остаться сумма в рассрочку)
          </p>
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
