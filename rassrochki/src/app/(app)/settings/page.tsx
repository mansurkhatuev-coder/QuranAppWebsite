"use client";

import { FormEvent, useEffect, useState } from "react";
import { DraftIndicator } from "@/components/ui";
import { NumericInput } from "@/components/NumericInput";
import { FormSkeleton } from "@/components/Skeleton";
import { Spinner } from "@/components/Spinner";
import { useDraft } from "@/hooks/useDraft";
import { createClient } from "@/lib/supabase/client";
import type { Investor, Organization, OrganizationSettings } from "@/types/database";
import { downloadCsv } from "@/lib/utils";
import { friendlyError, statusLabelRu } from "@/lib/friendly";
import {
  buildFullOrgBackup,
  daysSinceBackup,
  downloadJson,
  markBackupDone,
  needsBackupReminder,
} from "@/lib/backup";

type SettingsDraft = {
  orgName: string;
  default_term_months: string;
  default_markup_percent: string;
  income_share_manager: string;
  income_share_investor: string;
  overdue_days: string;
  contract_template: string;
};

export default function SettingsPage() {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [newInvestor, setNewInvestor] = useState({ name: "", share_percent: "70" });
  const [orgId, setOrgId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupHint, setBackupHint] = useState<string>("");
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const days = daysSinceBackup();
    if (days === null) {
      setBackupHint("Копию данных с этого устройства ещё не скачивали");
    } else if (needsBackupReminder()) {
      setBackupHint(`Последняя копия ${days} дн. назад — лучше скачать снова`);
    } else {
      setBackupHint(`Последняя копия ${days} дн. назад`);
    }
  }, []);

  const { value, setValue, status } = useDraft<SettingsDraft>("draft:settings-v2", {
    orgName: "",
    default_term_months: "12",
    default_markup_percent: "30",
    income_share_manager: "30",
    income_share_investor: "70",
    overdue_days: "3",
    contract_template: "",
  });

  useEffect(() => {
    async function load() {
      try {
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

        const [{ data: org }, { data: settings }, { data: investorRows }] = await Promise.all([
          supabase.from("organizations").select("*").eq("id", profile.organization_id).single(),
          supabase
            .from("organization_settings")
            .select("*")
            .eq("organization_id", profile.organization_id)
            .single(),
          supabase.from("investors").select("*").eq("organization_id", profile.organization_id),
        ]);

        if (org && settings) {
          setValue({
            orgName: org.name,
            default_term_months: String(settings.default_term_months),
            default_markup_percent: String(settings.default_markup_percent ?? 30),
            income_share_manager: String(settings.income_share_manager),
            income_share_investor: String(settings.income_share_investor),
            overdue_days: String(settings.overdue_days),
            contract_template: settings.contract_template,
          });
        }
        setInvestors(investorRows ?? []);
      } finally {
        setBooting(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setLoading(true);
    setMessage(null);
    const supabase = createClient();

    const [{ error: orgError }, { error: settingsError }] = await Promise.all([
      supabase.from("organizations").update({ name: value.orgName.trim() }).eq("id", orgId),
      supabase
        .from("organization_settings")
        .update({
          default_term_months: Number(value.default_term_months),
          default_markup_percent: Number(value.default_markup_percent),
          income_share_manager: Number(value.income_share_manager),
          income_share_investor: Number(value.income_share_investor),
          overdue_days: Number(value.overdue_days),
          contract_template: value.contract_template,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", orgId),
    ]);

    setLoading(false);
    if (orgError || settingsError) {
      setMessage(friendlyError("Не удалось сохранить настройки", orgError || settingsError));
      return;
    }
    setMessage("Настройки сохранены");
  }

  async function addInvestor(e: FormEvent) {
    e.preventDefault();
    if (!orgId || !newInvestor.name.trim()) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("investors")
      .insert({
        organization_id: orgId,
        name: newInvestor.name.trim(),
        share_percent: Number(newInvestor.share_percent),
      })
      .select("*")
      .single();
    if (error) {
      setMessage(friendlyError("Не удалось добавить инвестора", error));
      return;
    }
    setInvestors((prev) => [...prev, data]);
    setNewInvestor({ name: "", share_percent: "70" });
  }

  async function exportFullBackup() {
    if (!orgId) return;
    setBackupBusy(true);
    setMessage(null);
    try {
      const data = await buildFullOrgBackup(orgId);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadJson(`rassrochki-kopiya-${stamp}.json`, data);
      markBackupDone();
      setBackupHint("Копия только что скачана — сохраните файл на компьютер");
      setMessage("Полная копия скачана");
    } catch (err) {
      setMessage(friendlyError("Не удалось скачать копию данных", err));
    } finally {
      setBackupBusy(false);
    }
  }

  async function exportAll() {
    if (!orgId) return;
    const supabase = createClient();
    const [{ data: loans, error: loansError }, { data: schedules, error: schedulesError }] =
      await Promise.all([
        supabase
          .from("loans")
          .select("*, clients(full_name, phone), investors(name)")
          .eq("organization_id", orgId),
        supabase
          .from("payment_schedules")
          .select("loan_id, due_date, amount, status, paid_amount")
          .eq("organization_id", orgId),
      ]);

    if (loansError || schedulesError) {
      setMessage(friendlyError("Не удалось собрать CSV-выгрузку", loansError || schedulesError));
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const scheduleByLoan = new Map<
      string,
      { due_date: string; amount: number; status: string; paid_amount: number | null }[]
    >();

    for (const row of schedules ?? []) {
      const list = scheduleByLoan.get(row.loan_id) ?? [];
      list.push(row);
      scheduleByLoan.set(row.loan_id, list);
    }

    downloadCsv("rassrochki_export.csv", [
      [
        "Клиент",
        "Телефон",
        "Рассрочка",
        "Статус",
        "Инвестор",
        "Цена товара",
        "Наценка, %",
        "Сумма к возврату",
        "Взнос",
        "Режим графика",
        "Срок, мес",
        "Платёж/мес",
        "Дата старта",
        "Оплачено по графику",
        "Остаток по графику",
        "Просрочено (сумма)",
        "Ближайший платёж",
        "Кол-во оплаченных месяцев",
        "Кол-во месяцев в просрочке",
        "Доля владельца, %",
        "Доля инвестора, %",
        "Вложение инвестора",
      ],
      ...(loans ?? []).map((loan) => {
        const rows = [...(scheduleByLoan.get(loan.id) ?? [])].sort((a, b) =>
          a.due_date.localeCompare(b.due_date)
        );

        const paidBySchedule = rows.reduce((sum, s) => {
          if (s.status === "paid") return sum + Number(s.paid_amount ?? s.amount);
          return sum + Number(s.paid_amount ?? 0);
        }, 0);
        const scheduledTotal = rows.reduce((sum, s) => sum + Number(s.amount || 0), 0);
        const remainingBySchedule = Math.max(0, scheduledTotal - paidBySchedule);
        const overdueRows = rows.filter((s) => s.status === "overdue");
        const overdueAmount = overdueRows.reduce((sum, s) => {
          const paid = Number(s.paid_amount ?? 0);
          return sum + Math.max(0, Number(s.amount) - paid);
        }, 0);
        const nextPending = rows.find(
          (s) => (s.status === "pending" || s.status === "overdue") && s.due_date >= today
        );
        const paidMonths = rows.filter((s) => s.status === "paid").length;

        return [
          loan.clients?.full_name ?? "",
          loan.clients?.phone ?? "",
          loan.title ?? "",
          statusLabelRu(loan.status),
          loan.investors?.name ?? "",
          String(loan.cost_amount ?? ""),
          String(loan.markup_percent ?? ""),
          String(loan.principal ?? ""),
          String(loan.down_payment ?? ""),
          loan.schedule_on_full_amount ? "Полная сумма" : "После взноса",
          String(loan.term_months ?? ""),
          String(loan.monthly_payment ?? ""),
          loan.start_date ?? "",
          String(Math.round(paidBySchedule * 100) / 100),
          String(Math.round(remainingBySchedule * 100) / 100),
          String(Math.round(overdueAmount * 100) / 100),
          nextPending?.due_date ?? "",
          String(paidMonths),
          String(overdueRows.length),
          String(loan.income_share_manager ?? ""),
          String(loan.income_share_investor ?? ""),
          String(loan.investor_amount ?? ""),
        ];
      }),
    ]);
  }

  if (booting) {
    return <FormSkeleton />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Настройки</h1>
        <DraftIndicator status={status} />
      </div>

      {message && (
        <p
          className={`rounded-xl px-3 py-2 text-sm ${
            message.startsWith("Не удалось")
              ? "bg-red-50 text-red-700"
              : "bg-emerald-50 text-emerald-800"
          }`}
        >
          {message}
        </p>
      )}

      <form onSubmit={saveSettings} className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-4">
          <h2 className="font-semibold">Организация и рассрочки</h2>
          <div>
            <label className="label">Название организации</label>
            <input
              className="input"
              value={value.orgName}
              onChange={(e) => setValue({ ...value, orgName: e.target.value })}
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Срок по умолчанию, мес</label>
              <NumericInput
                mode="integer"
                value={value.default_term_months}
                onChange={(default_term_months) =>
                  setValue({ ...value, default_term_months })
                }
              />
            </div>
            <div>
              <label className="label">Наценка по умолчанию, %</label>
              <NumericInput
                mode="decimal"
                value={value.default_markup_percent}
                onChange={(default_markup_percent) =>
                  setValue({ ...value, default_markup_percent })
                }
              />
            </div>
          </div>
          <div>
            <label className="label">
              Через сколько полных дней после даты платежа считать просрочкой
            </label>
            <NumericInput
              mode="integer"
              value={value.overdue_days}
              onChange={(overdue_days) => setValue({ ...value, overdue_days })}
            />
            <p className="mt-1 text-xs text-[var(--muted)]">
              Например, при 3 днях платёж от 25 числа станет просроченным 29 числа.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Доля владельца в прибыли, %</label>
              <NumericInput
                mode="decimal"
                value={value.income_share_manager}
                onChange={(income_share_manager) =>
                  setValue({ ...value, income_share_manager })
                }
              />
            </div>
            <div>
              <label className="label">Доля инвестора в прибыли, %</label>
              <NumericInput
                mode="decimal"
                value={value.income_share_investor}
                onChange={(income_share_investor) =>
                  setValue({ ...value, income_share_investor })
                }
              />
            </div>
          </div>
          <p className="text-xs text-[var(--muted)]">
            Наценка — прибыль с товара. Доли 30/70 делят именно прибыль между вами и инвестором.
          </p>
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? <Spinner label="Сохраняем…" /> : "Сохранить настройки"}
          </button>
        </div>

        <div className="card space-y-3">
          <h2 className="font-semibold">Шаблон договора</h2>
          <p className="text-xs text-[var(--muted)]">
            Текст договора. При скачивании подставятся данные клиента, суммы, график и
            поручители. Можно отредактировать под себя.
          </p>
          <textarea
            className="input min-h-64"
            value={value.contract_template}
            onChange={(e) => setValue({ ...value, contract_template: e.target.value })}
          />
        </div>
      </form>

      <div className="card space-y-4">
        <h2 className="font-semibold">Инвесторы</h2>
        <form onSubmit={addInvestor} className="flex flex-wrap gap-2">
          <input
            className="input max-w-xs"
            placeholder="Имя инвестора"
            value={newInvestor.name}
            onChange={(e) => setNewInvestor({ ...newInvestor, name: e.target.value })}
            required
          />
          <NumericInput
            className="input w-28"
            mode="decimal"
            value={newInvestor.share_percent}
            onChange={(share_percent) => setNewInvestor({ ...newInvestor, share_percent })}
          />
          <button className="btn-secondary" type="submit">
            Добавить
          </button>
        </form>
        <ul className="space-y-2">
          {investors.map((inv) => (
            <li
              key={inv.id}
              className="flex items-center justify-between rounded-xl border border-[var(--border)] px-3 py-2"
            >
              <span>{inv.name}</span>
              <span className="text-sm text-[var(--muted)]">{inv.share_percent}%</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="card space-y-3">
        <h2 className="mb-1 font-semibold">Копия данных</h2>
        <p className="text-sm text-[var(--muted)]">{backupHint}</p>
        <p className="text-sm text-[var(--muted)]">
          Полная копия — все клиенты, рассрочки и платежи. Таблица — краткий список
          рассрочек. Раз в неделю скачивайте полную копию на компьютер.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={backupBusy}
            onClick={exportFullBackup}
          >
            {backupBusy ? <Spinner label="Готовим…" /> : "Скачать полную копию"}
          </button>
          <button type="button" className="btn-secondary" onClick={exportAll}>
            Скачать таблицу
          </button>
        </div>
      </div>
    </div>
  );
}
