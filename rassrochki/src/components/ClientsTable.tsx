"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Client } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { formatDateShort } from "@/lib/utils";
import { WhatsAppButton } from "@/components/WhatsAppButton";

export function ClientsTable({ clients: initial }: { clients: Client[] }) {
  const router = useRouter();
  const [clients, setClients] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  async function toggleBlacklist(client: Client) {
    setBusyId(client.id);
    const supabase = createClient();
    const next = !client.is_blacklisted;
    const note = next ? (noteDraft[client.id] ?? client.blacklist_note ?? "").trim() || null : null;

    const { data, error } = await supabase
      .from("clients")
      .update({
        is_blacklisted: next,
        blacklist_note: note,
      })
      .eq("id", client.id)
      .select("*")
      .single();

    setBusyId(null);
    if (error || !data) return;

    setClients((prev) => prev.map((c) => (c.id === client.id ? data : c)));
    router.refresh();
  }

  return (
    <>
      <div className="hidden md:block card overflow-x-auto p-0">
        <table className="min-w-full text-sm">
          <thead className="border-b border-[var(--border)] bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-3">Имя</th>
              <th className="px-4 py-3">Телефон</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Добавлен</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr
                key={client.id}
                className={`border-b border-[var(--border)] ${
                  client.is_blacklisted ? "bg-red-50/60" : ""
                }`}
              >
                <td className="px-4 py-3 font-medium">{client.full_name}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{client.phone ?? "—"}</span>
                    {client.phone ? (
                      <WhatsAppButton phone={client.phone} label="WA" />
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {client.is_blacklisted ? (
                    <span className="badge-red">Чёрный список</span>
                  ) : (
                    <span className="badge-green">Ок</span>
                  )}
                  {client.is_blacklisted && client.blacklist_note && (
                    <p className="mt-1 text-xs text-red-700">{client.blacklist_note}</p>
                  )}
                </td>
                <td className="px-4 py-3">{formatDateShort(client.created_at.slice(0, 10))}</td>
                <td className="px-4 py-3">
                  {!client.is_blacklisted && (
                    <input
                      className="input mb-2 max-w-[12rem] text-xs"
                      placeholder="Причина (необяз.)"
                      value={noteDraft[client.id] ?? ""}
                      onChange={(e) =>
                        setNoteDraft({ ...noteDraft, [client.id]: e.target.value })
                      }
                    />
                  )}
                  <button
                    type="button"
                    className={client.is_blacklisted ? "btn-secondary text-xs" : "btn-danger text-xs"}
                    disabled={busyId === client.id}
                    onClick={() => toggleBlacklist(client)}
                  >
                    {busyId === client.id
                      ? "…"
                      : client.is_blacklisted
                        ? "Убрать из ЧС"
                        : "В чёрный список"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 md:hidden">
        {clients.map((client) => (
          <div
            key={client.id}
            className={`card ${client.is_blacklisted ? "border-red-200 bg-red-50/50" : ""}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{client.full_name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
                  <span>{client.phone ?? "Телефон не указан"}</span>
                  {client.phone ? (
                    <WhatsAppButton phone={client.phone} label="WhatsApp" />
                  ) : null}
                </div>
                {client.is_blacklisted && (
                  <p className="mt-1 text-sm text-red-700">
                    Чёрный список
                    {client.blacklist_note ? `: ${client.blacklist_note}` : ""}
                  </p>
                )}
              </div>
              {client.is_blacklisted ? (
                <span className="badge-red">ЧС</span>
              ) : (
                <span className="badge-green">Ок</span>
              )}
            </div>
            {!client.is_blacklisted && (
              <input
                className="input mt-3 text-sm"
                placeholder="Причина для чёрного списка"
                value={noteDraft[client.id] ?? ""}
                onChange={(e) => setNoteDraft({ ...noteDraft, [client.id]: e.target.value })}
              />
            )}
            <button
              type="button"
              className={`mt-3 w-full ${
                client.is_blacklisted ? "btn-secondary" : "btn-danger"
              }`}
              disabled={busyId === client.id}
              onClick={() => toggleBlacklist(client)}
            >
              {busyId === client.id
                ? "…"
                : client.is_blacklisted
                  ? "Убрать из чёрного списка"
                  : "В чёрный список"}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
