"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Client } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/friendly";
import { formatDateShort } from "@/lib/utils";
import { WhatsAppButton } from "@/components/WhatsAppButton";

export function ClientsTable({ clients: initial }: { clients: Client[] }) {
  const router = useRouter();
  const [clients, setClients] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function toggleBlacklist(client: Client) {
    const next = !client.is_blacklisted;
    if (next) {
      const ok = window.confirm(
        `Добавить «${client.full_name}» в чёрный список? Новые рассрочки на него будут запрещены.`
      );
      if (!ok) return;
    }

    setBusyId(client.id);
    setError(null);
    const supabase = createClient();
    const note = next ? (noteDraft[client.id] ?? client.blacklist_note ?? "").trim() || null : null;

    const { data, error: updateError } = await supabase
      .from("clients")
      .update({
        is_blacklisted: next,
        blacklist_note: note,
      })
      .eq("id", client.id)
      .select("*")
      .single();

    setBusyId(null);
    if (updateError || !data) {
      setError(
        next
          ? "Не удалось добавить в чёрный список"
          : "Не удалось убрать из чёрного списка"
      );
      return;
    }

    setClients((prev) => prev.map((c) => (c.id === client.id ? data : c)));
    router.refresh();
  }

  async function deleteClient(client: Client) {
    const ok = window.confirm(
      `Удалить клиента «${client.full_name}»? Это нельзя отменить.`
    );
    if (!ok) return;

    setBusyId(client.id);
    setError(null);
    const supabase = createClient();

    const { count, error: countError } = await supabase
      .from("loans")
      .select("id", { count: "exact", head: true })
      .eq("client_id", client.id);

    if (countError) {
      setBusyId(null);
      setError(friendlyError("Не удалось проверить рассрочки клиента", countError));
      return;
    }

    if ((count ?? 0) > 0) {
      setBusyId(null);
      setError(
        `Нельзя удалить «${client.full_name}»: есть связанные рассрочки (${count}). Сначала закройте или удалите их.`
      );
      return;
    }

    const { error: deleteError } = await supabase
      .from("clients")
      .delete()
      .eq("id", client.id);

    setBusyId(null);
    if (deleteError) {
      const raw = deleteError.message?.toLowerCase() ?? "";
      if (raw.includes("foreign key") || raw.includes("restrict") || deleteError.code === "23503") {
        setError(
          `Нельзя удалить «${client.full_name}»: есть связанные рассрочки.`
        );
        return;
      }
      setError(friendlyError("Не удалось удалить клиента", deleteError));
      return;
    }

    setClients((prev) => prev.filter((c) => c.id !== client.id));
    router.refresh();
  }

  return (
    <>
      {error && (
        <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="hidden md:block overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b border-[var(--border)] bg-slate-50 text-left text-xs text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">Имя</th>
              <th className="px-3 py-2 font-medium">Телефон</th>
              <th className="px-3 py-2 font-medium">Статус</th>
              <th className="px-3 py-2 font-medium">Добавлен</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr
                key={client.id}
                className={`border-b border-[var(--border)] last:border-0 ${
                  client.is_blacklisted ? "bg-red-50/60" : ""
                }`}
              >
                <td className="px-3 py-2 font-medium">{client.full_name}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[var(--muted)]">{client.phone ?? "—"}</span>
                    {client.phone ? (
                      <WhatsAppButton phone={client.phone} label="WA" />
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {client.is_blacklisted ? (
                    <span className="badge-red">ЧС</span>
                  ) : (
                    <span className="badge-green">Ок</span>
                  )}
                  {client.is_blacklisted && client.blacklist_note && (
                    <p className="mt-0.5 max-w-[10rem] truncate text-xs text-red-700">
                      {client.blacklist_note}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2 text-[var(--muted)]">
                  {formatDateShort(client.created_at.slice(0, 10))}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {!client.is_blacklisted && (
                      <input
                        className="input max-w-[9rem] px-2 py-1 text-xs"
                        placeholder="Причина ЧС"
                        value={noteDraft[client.id] ?? ""}
                        onChange={(e) =>
                          setNoteDraft({ ...noteDraft, [client.id]: e.target.value })
                        }
                      />
                    )}
                    <button
                      type="button"
                      className={
                        client.is_blacklisted
                          ? "btn-secondary px-2.5 py-1.5 text-xs"
                          : "btn-danger px-2.5 py-1.5 text-xs"
                      }
                      disabled={busyId === client.id}
                      onClick={() => toggleBlacklist(client)}
                    >
                      {busyId === client.id
                        ? "…"
                        : client.is_blacklisted
                          ? "Убрать ЧС"
                          : "В ЧС"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-50"
                      disabled={busyId === client.id}
                      onClick={() => deleteClient(client)}
                    >
                      Удалить
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-1.5 md:hidden">
        {clients.map((client) => (
          <div
            key={client.id}
            className={`rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 ${
              client.is_blacklisted ? "border-red-200 bg-red-50/50" : ""
            }`}
          >
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-semibold">{client.full_name}</p>
                  {client.is_blacklisted ? (
                    <span className="badge-red shrink-0">ЧС</span>
                  ) : null}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)]">
                  <span className="truncate">{client.phone ?? "Нет телефона"}</span>
                  {client.phone ? (
                    <WhatsAppButton phone={client.phone} label="WA" />
                  ) : null}
                </div>
                {client.is_blacklisted && client.blacklist_note ? (
                  <p className="mt-0.5 truncate text-xs text-red-700">{client.blacklist_note}</p>
                ) : null}
              </div>
            </div>

            {!client.is_blacklisted && (
              <input
                className="input mt-2 px-2 py-1.5 text-xs"
                placeholder="Причина для ЧС"
                value={noteDraft[client.id] ?? ""}
                onChange={(e) => setNoteDraft({ ...noteDraft, [client.id]: e.target.value })}
              />
            )}

            <div className="mt-2 flex gap-1.5">
              <button
                type="button"
                className={`flex-1 px-2.5 py-1.5 text-xs ${
                  client.is_blacklisted ? "btn-secondary" : "btn-danger"
                }`}
                disabled={busyId === client.id}
                onClick={() => toggleBlacklist(client)}
              >
                {busyId === client.id
                  ? "…"
                  : client.is_blacklisted
                    ? "Убрать ЧС"
                    : "В ЧС"}
              </button>
              <button
                type="button"
                className="btn-secondary flex-1 px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-50"
                disabled={busyId === client.id}
                onClick={() => deleteClient(client)}
              >
                Удалить
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
