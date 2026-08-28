"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PlatformOrganization } from "@/types/database";
import { formatDateShort, formatMoney } from "@/lib/utils";
import { NumericInput } from "@/components/NumericInput";
import { ListPageSkeleton } from "@/components/Skeleton";
import { Spinner } from "@/components/Spinner";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

type Action = "extend" | "deactivate" | "activate_trial";

export default function PlatformPage() {
  const [orgs, setOrgs] = useState<PlatformOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [monthsByOrg, setMonthsByOrg] = useState<Record<string, string>>({});
  const [payByOrg, setPayByOrg] = useState<Record<string, string>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState("");
  const [deleteAck, setDeleteAck] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("platform_list_organizations");
    if (rpcError) {
      setError(rpcError.message);
      setOrgs([]);
    } else {
      setOrgs((data as PlatformOrganization[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalRevenue = useMemo(
    () => orgs.reduce((sum, o) => sum + Number(o.platform_revenue || 0), 0),
    [orgs]
  );

  async function runAction(orgId: string, action: Action) {
    setBusyId(orgId);
    setError(null);
    const supabase = createClient();
    const months = Number(monthsByOrg[orgId] || "1") || 1;
    const paymentRaw = payByOrg[orgId];
    const payment =
      paymentRaw === undefined || paymentRaw === "" ? 0 : Number(paymentRaw);

    const { error: rpcError } = await supabase.rpc("platform_set_organization_access", {
      p_org_id: orgId,
      p_action: action,
      p_months: months,
      p_note: null,
      p_payment_amount: payment,
    });
    setBusyId(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    if (action === "extend") {
      setPayByOrg((prev) => ({ ...prev, [orgId]: "" }));
    }
    await load();
  }

  async function deleteOrg(org: PlatformOrganization) {
    if (deleteName.trim() !== org.name || !deleteAck) return;
    setBusyId(org.id);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("platform_delete_organization", {
      p_org_id: org.id,
      p_confirm_name: deleteName.trim(),
    });
    setBusyId(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setDeleteId(null);
    setDeleteName("");
    setDeleteAck(false);
    await load();
  }

  function openDelete(orgId: string) {
    setDeleteId(orgId);
    setDeleteName("");
    setDeleteAck(false);
    setError(null);
  }

  function closeDelete() {
    setDeleteId(null);
    setDeleteName("");
    setDeleteAck(false);
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Рассрочки</p>
            <h1 className="text-xl font-bold">Организации</h1>
          </div>
          <Link href="/dashboard" className="btn-secondary text-sm">
            В приложение
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        {!loading && orgs.length > 0 && (
          <p className="text-sm text-[var(--muted)]">
            Всего доход:{" "}
            <span className="font-semibold text-slate-800">{formatMoney(totalRevenue)}</span>
          </p>
        )}

        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {loading ? (
          <ListPageSkeleton titleWidth="w-40" />
        ) : orgs.length === 0 ? (
          <p className="card text-sm text-[var(--muted)]">Пока нет организаций.</p>
        ) : (
          <div className="space-y-3">
            {orgs.map((org) => {
              const busy = busyId === org.id;
              const disabled = !org.is_active || org.subscription_status === "disabled";
              const showTrial = !org.has_access || org.subscription_status === "trial";
              const showDeactivate = !disabled;
              const deleting = deleteId === org.id;
              const until = org.has_access
                ? org.subscription_status === "trial" && org.trial_ends_at
                  ? `Пробный до ${formatDateShort(org.trial_ends_at.slice(0, 10))}`
                  : org.paid_until
                    ? `Оплачено до ${formatDateShort(org.paid_until)}`
                    : "Доступ есть"
                : disabled
                  ? "Отключена"
                  : "Нет доступа";

              return (
                <article key={org.id} className="card space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="font-semibold">{org.name}</h2>
                      <p className="mt-0.5 text-sm text-[var(--muted)]">{until}</p>
                    </div>
                    <StatusBadge org={org} disabled={disabled} />
                  </div>

                  <p className="text-sm text-[var(--muted)]">
                    Заходил:{" "}
                    <span className="font-medium text-slate-800">
                      {formatLastSignIn(org.last_sign_in_at)}
                    </span>
                    {" · "}
                    Рассрочек:{" "}
                    <span className="font-medium text-slate-800">
                      {Number(org.active_loans_count || 0)} акт. /{" "}
                      {Number(org.loans_count || 0)} всего
                    </span>
                    {" · "}
                    Доход:{" "}
                    <span className="font-semibold text-slate-800">
                      {formatMoney(Number(org.platform_revenue || 0))}
                    </span>
                  </p>

                  {!deleting && (
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="text-sm">
                        <span className="mb-1 block text-[var(--muted)]">Мес.</span>
                        <NumericInput
                          className="input w-16 py-1.5"
                          mode="integer"
                          value={monthsByOrg[org.id] ?? "1"}
                          onChange={(v) =>
                            setMonthsByOrg((prev) => ({ ...prev, [org.id]: v }))
                          }
                        />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block text-[var(--muted)]">Оплата ₽</span>
                        <NumericInput
                          className="input w-28 py-1.5"
                          mode="integer"
                          placeholder="0"
                          value={payByOrg[org.id] ?? ""}
                          onChange={(v) => setPayByOrg((prev) => ({ ...prev, [org.id]: v }))}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn-primary text-sm"
                        disabled={busy}
                        onClick={() => void runAction(org.id, "extend")}
                      >
                        {busy ? <Spinner className="h-4 w-4" /> : "Продлить"}
                      </button>
                      {showTrial && (
                        <button
                          type="button"
                          className="btn-secondary text-sm"
                          disabled={busy}
                          onClick={() => void runAction(org.id, "activate_trial")}
                        >
                          +30 дн. trial
                        </button>
                      )}
                      {showDeactivate && (
                        <button
                          type="button"
                          className="btn-secondary text-sm text-red-700"
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Отключить «${org.name}»? Доступ закроется сразу.`
                              )
                            ) {
                              void runAction(org.id, "deactivate");
                            }
                          }}
                        >
                          Отключить
                        </button>
                      )}
                      {disabled && (
                        <button
                          type="button"
                          className="btn-danger text-sm"
                          disabled={busy}
                          onClick={() => openDelete(org.id)}
                        >
                          Удалить
                        </button>
                      )}
                    </div>
                  )}

                  {deleting && (
                    <div className="space-y-3 rounded-xl border border-red-200 bg-red-50/60 p-3">
                      <p className="text-sm font-medium text-red-800">
                        Удаление навсегда: клиенты, рассрочки и оплаты этой организации
                        пропадут.
                      </p>
                      <p className="text-sm text-red-700">
                        Сначала введите точное название: <strong>{org.name}</strong>
                      </p>
                      <input
                        className="input"
                        value={deleteName}
                        onChange={(e) => setDeleteName(e.target.value)}
                        placeholder="Название организации"
                        autoComplete="off"
                      />
                      <label className="flex items-start gap-2 text-sm text-red-800">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={deleteAck}
                          onChange={(e) => setDeleteAck(e.target.checked)}
                        />
                        <span>Понимаю: откатить удаление нельзя</span>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn-danger text-sm"
                          disabled={
                            busy || deleteName.trim() !== org.name || !deleteAck
                          }
                          onClick={() => void deleteOrg(org)}
                        >
                          {busy ? <Spinner className="h-4 w-4" /> : "Удалить навсегда"}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary text-sm"
                          disabled={busy}
                          onClick={closeDelete}
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function StatusBadge({
  org,
  disabled,
}: {
  org: PlatformOrganization;
  disabled: boolean;
}) {
  if (disabled) return <span className="badge-red">Отключена</span>;
  if (org.has_access) return <span className="badge-green">Доступ есть</span>;
  return <span className="badge-yellow">Нет доступа</span>;
}

function formatLastSignIn(value: string | null | undefined) {
  if (!value) return "никогда";
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true, locale: ru });
  } catch {
    return formatDateShort(value.slice(0, 10));
  }
}
