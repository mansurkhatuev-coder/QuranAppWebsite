"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PlatformOrganization } from "@/types/database";
import { formatDate, formatDateShort } from "@/lib/utils";
import { ListPageSkeleton } from "@/components/Skeleton";
import { Spinner } from "@/components/Spinner";

export default function PlatformPage() {
  const [orgs, setOrgs] = useState<PlatformOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [monthsByOrg, setMonthsByOrg] = useState<Record<string, string>>({});

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

  async function runAction(
    orgId: string,
    action: "extend" | "deactivate" | "activate_trial"
  ) {
    setBusyId(orgId);
    setError(null);
    const supabase = createClient();
    const months = Number(monthsByOrg[orgId] || "1") || 1;
    const { error: rpcError } = await supabase.rpc("platform_set_organization_access", {
      p_org_id: orgId,
      p_action: action,
      p_months: months,
      p_note: null,
    });
    setBusyId(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await load();
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
        <p className="text-sm text-[var(--muted)]">
          Продление, пробный период и отключение доступа. Клиент пишет в WhatsApp — вы
          подтверждаете здесь.
        </p>

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
              return (
                <article key={org.id} className="card space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-semibold">{org.name}</h2>
                      <p className="text-xs text-[var(--muted)]">
                        Создана {formatDate(org.created_at)}
                      </p>
                    </div>
                    <StatusBadge org={org} />
                  </div>

                  <dl className="grid gap-2 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-[var(--muted)]">Статус</dt>
                      <dd className="font-medium">{org.subscription_status}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--muted)]">Пробный до</dt>
                      <dd className="font-medium">
                        {org.trial_ends_at
                          ? formatDateShort(org.trial_ends_at.slice(0, 10))
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[var(--muted)]">Оплачено до</dt>
                      <dd className="font-medium">
                        {org.paid_until ? formatDateShort(org.paid_until) : "—"}
                      </dd>
                    </div>
                  </dl>

                  {org.access_note && (
                    <p className="text-sm text-slate-600">Заметка: {org.access_note}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <span className="text-[var(--muted)]">Мес.</span>
                      <input
                        className="input w-16 py-1.5"
                        type="number"
                        min={1}
                        max={36}
                        value={monthsByOrg[org.id] ?? "1"}
                        onChange={(e) =>
                          setMonthsByOrg((prev) => ({ ...prev, [org.id]: e.target.value }))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="btn-primary text-sm"
                      disabled={busy}
                      onClick={() => void runAction(org.id, "extend")}
                    >
                      Продлить
                    </button>
                    <button
                      type="button"
                      className="btn-secondary text-sm"
                      disabled={busy}
                      onClick={() => void runAction(org.id, "activate_trial")}
                    >
                      Ещё 30 дней trial
                    </button>
                    <button
                      type="button"
                      className="btn-danger text-sm"
                      disabled={busy}
                      onClick={() => void runAction(org.id, "deactivate")}
                    >
                      Отключить
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function StatusBadge({ org }: { org: PlatformOrganization }) {
  if (!org.is_active || org.subscription_status === "disabled") {
    return <span className="badge-red">Отключена</span>;
  }
  if (org.has_access) {
    return <span className="badge-green">Доступ есть</span>;
  }
  return <span className="badge-yellow">Нет доступа</span>;
}
