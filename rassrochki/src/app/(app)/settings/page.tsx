"use client";

import { FormEvent, useEffect, useState } from "react";
import { DraftIndicator } from "@/components/ui";
import { useDraft } from "@/hooks/useDraft";
import { createClient } from "@/lib/supabase/client";
import type { Investor, Organization, OrganizationSettings } from "@/types/database";
import { downloadCsv } from "@/lib/utils";

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
      setMessage(orgError?.message ?? settingsError?.message ?? "Ошибка");
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
      setMessage(error.message);
      return;
    }
    setInvestors((prev) => [...prev, data]);
    setNewInvestor({ name: "", share_percent: "70" });
  }

  async function exportAll() {
    if (!orgId) return;
    const supabase = createClient();
    const { data: loans } = await supabase
      .from("loans")
      .select("*, clients(full_name), investors(name)")
      .eq("organization_id", orgId);

    downloadCsv("rassrochki_export.csv", [
      ["Клиент", "Рассрочка", "Сумма", "Срок", "Платёж/мес", "Статус", "Инвестор"],
      ...(loans ?? []).map((loan) => [
        loan.clients?.full_name ?? "",
        loan.title ?? "",
        String(loan.principal),
        String(loan.term_months),
        String(loan.monthly_payment),
        loan.status,
        loan.investors?.name ?? "",
      ]),
    ]);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Настройки</h1>
        <DraftIndicator status={status} />
      </div>

      {message && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
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
              <input
                className="input"
                type="number"
                min="1"
                value={value.default_term_months}
                onChange={(e) => setValue({ ...value, default_term_months: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Наценка по умолчанию, %</label>
              <input
                className="input"
                type="number"
                min="0"
                value={value.default_markup_percent}
                onChange={(e) => setValue({ ...value, default_markup_percent: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label">Просрочка через, дней</label>
            <input
              className="input"
              type="number"
              min="0"
              value={value.overdue_days}
              onChange={(e) => setValue({ ...value, overdue_days: e.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Доля владельца в прибыли, %</label>
              <input
                className="input"
                type="number"
                value={value.income_share_manager}
                onChange={(e) => setValue({ ...value, income_share_manager: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Доля инвестора в прибыли, %</label>
              <input
                className="input"
                type="number"
                value={value.income_share_investor}
                onChange={(e) => setValue({ ...value, income_share_investor: e.target.value })}
              />
            </div>
          </div>
          <p className="text-xs text-[var(--muted)]">
            Наценка — прибыль с товара. Доли 30/70 делят именно прибыль между вами и инвестором.
          </p>
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? "Сохраняем…" : "Сохранить настройки"}
          </button>
        </div>

        <div className="card space-y-3">
          <h2 className="font-semibold">Шаблон договора</h2>
          <p className="text-xs text-[var(--muted)]">
            Переменные: {"{organization}"}, {"{client}"}, {"{phone}"}, {"{amount}"}, {"{term_months}"},
            {" {monthly_payment}"}, {"{start_date}"}, {"{schedule}"}, {"{manager_share}"},
            {" {investor_share}"}, {"{investor}"}
          </p>
          <textarea
            className="input min-h-64 font-mono text-xs"
            value={value.contract_template}
            onChange={(e) => setValue({ ...value, contract_template: e.target.value })}
          />
        </div>
      </form>

      <div className="card space-y-4">
        <h2 className="font-semibold">Инвесторы (справочник)</h2>
        <form onSubmit={addInvestor} className="flex flex-wrap gap-2">
          <input
            className="input max-w-xs"
            placeholder="Имя инвестора"
            value={newInvestor.name}
            onChange={(e) => setNewInvestor({ ...newInvestor, name: e.target.value })}
            required
          />
          <input
            className="input w-28"
            type="number"
            min="0"
            max="100"
            value={newInvestor.share_percent}
            onChange={(e) => setNewInvestor({ ...newInvestor, share_percent: e.target.value })}
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

      <div className="card">
        <h2 className="mb-2 font-semibold">Экспорт данных</h2>
        <p className="mb-3 text-sm text-[var(--muted)]">
          Скачайте CSV как резервную копию на компьютер.
        </p>
        <button type="button" className="btn-secondary" onClick={exportAll}>
          Скачать CSV
        </button>
      </div>
    </div>
  );
}
