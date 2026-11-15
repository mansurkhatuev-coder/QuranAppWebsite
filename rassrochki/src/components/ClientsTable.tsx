"use client";

import { useEffect, useState } from "react";
import { useOfflineWorkspace } from "@/components/OfflineBootstrap";
import type { Client } from "@/types/database";
import { formatDateShort } from "@/lib/utils";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { getClientOperationDependencies } from "@/lib/offline/sync";

export function ClientsTable({ clients: initial }: { clients: Client[] }) {
  const { snapshot, baseSnapshot, operations, enqueueCommand } = useOfflineWorkspace();
  const [clients, setClients] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [addressDraft, setAddressDraft] = useState<Record<string, string>>({});
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setClients(initial), [initial]);

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
    const note = next ? (noteDraft[client.id] ?? client.blacklist_note ?? "").trim() || null : null;
    try {
      const dependencies = getClientOperationDependencies(operations, client.id, [
        ...(snapshot?.loans ?? []),
        ...(baseSnapshot?.loans ?? []),
      ]);
      await enqueueCommand(
        {
          type: "client.blacklist",
          payload: {
            clientId: client.id,
            expectedVersion: Number(client.offline_version ?? 1),
            isBlacklisted: next,
            blacklistNote: note,
          },
        },
        dependencies
      );
      setClients((prev) =>
        prev.map((item) =>
          item.id === client.id
            ? { ...item, is_blacklisted: next, blacklist_note: note }
            : item
        )
      );
    } catch {
      setError(next ? "Не удалось сохранить клиента в очереди" : "Не удалось сохранить изменение");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteClient(client: Client) {
    const ok = window.confirm(
      `Удалить клиента «${client.full_name}»? Это нельзя отменить.`
    );
    if (!ok) return;

    setBusyId(client.id);
    setError(null);
    const relatedLoans = snapshot?.loans.filter((loan) => loan.client_id === client.id).length ?? 0;
    if (relatedLoans > 0) {
      setBusyId(null);
      setError(
        `Нельзя удалить «${client.full_name}»: есть связанные рассрочки (${relatedLoans}). Сначала закройте или удалите их.`
      );
      return;
    }
    try {
      const dependencies = getClientOperationDependencies(operations, client.id, [
        ...(snapshot?.loans ?? []),
        ...(baseSnapshot?.loans ?? []),
      ]);
      await enqueueCommand(
        {
          type: "client.delete",
          payload: { clientId: client.id, expectedVersion: Number(client.offline_version ?? 1) },
        },
        dependencies
      );
      setClients((prev) => prev.filter((item) => item.id !== client.id));
    } catch {
      setError(`Не удалось удалить «${client.full_name}» из локального списка.`);
    } finally {
      setBusyId(null);
    }
  }

  function editAddress(client: Client) {
    setAddressDraft((current) => ({ ...current, [client.id]: client.address ?? "" }));
    setEditingAddressId(client.id);
    setError(null);
  }

  function cancelAddressEdit(clientId: string) {
    setEditingAddressId(null);
    setAddressDraft((current) => {
      const next = { ...current };
      delete next[clientId];
      return next;
    });
  }

  async function saveAddress(client: Client) {
    const value = addressDraft[client.id] ?? client.address ?? "";
    if (value.length > 1000) {
      setError("Адрес не может быть длиннее 1000 символов.");
      return;
    }

    const address = value.trim() || null;
    const projectedClient = snapshot?.clients.find((item) => item.id === client.id);
    const expectedVersion = Number(projectedClient?.offline_version ?? client.offline_version ?? 1);
    const dependencies = getClientOperationDependencies(operations, client.id, [
      ...(baseSnapshot?.loans ?? []),
      ...(snapshot?.loans ?? []),
    ]);

    setBusyId(client.id);
    setError(null);
    try {
      await enqueueCommand(
        {
          type: "client.address",
          payload: { clientId: client.id, expectedVersion, address },
        },
        dependencies
      );
      setClients((current) =>
        current.map((item) =>
          item.id === client.id
            ? { ...item, address, offline_version: expectedVersion + 1 }
            : item
        )
      );
      cancelAddressEdit(client.id);
    } catch {
      setError("Не удалось сохранить адрес. Изменение осталось в форме.");
    } finally {
      setBusyId(null);
    }
  }

  function addressControl(client: Client, surface: "desktop" | "mobile") {
    if (editingAddressId === client.id) {
      const draft = addressDraft[client.id] ?? "";
      const fieldId = `client-address-${surface}-${client.id}`;
      return (
        <div className="mt-1 space-y-1.5">
          <label className="sr-only" htmlFor={fieldId}>
            Адрес клиента {client.full_name}
          </label>
          <textarea
            id={fieldId}
            className="input w-full px-2 py-1.5 text-xs"
            aria-label={`Адрес клиента ${client.full_name}`}
            aria-describedby={`${fieldId}-count`}
            maxLength={1000}
            rows={2}
            value={draft}
            disabled={busyId === client.id}
            onChange={(event) =>
              setAddressDraft((current) => ({ ...current, [client.id]: event.target.value }))
            }
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <span id={`${fieldId}-count`} className="text-[11px] text-[var(--muted)]">
              {draft.length}/1000
            </span>
            <button
              type="button"
              className="btn-primary px-2.5 py-1.5 text-xs"
              disabled={busyId === client.id}
              onClick={() => void saveAddress(client)}
            >
              {busyId === client.id ? "…" : "Сохранить"}
            </button>
            <button
              type="button"
              className="btn-secondary px-2.5 py-1.5 text-xs"
              disabled={busyId === client.id}
              onClick={() => cancelAddressEdit(client.id)}
            >
              Отмена
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {client.address ? (
          <p className="max-w-xs break-words text-xs text-[var(--muted)]">{client.address}</p>
        ) : (
          <span className="text-xs text-[var(--muted)]">Адрес не указан</span>
        )}
        <button
          type="button"
          className="btn-secondary px-2 py-1 text-xs"
          aria-label={`Изменить адрес клиента ${client.full_name}`}
          disabled={busyId === client.id}
          onClick={() => editAddress(client)}
        >
          Изменить адрес
        </button>
      </div>
    );
  }

  return (
    <>
      {error && (
        <p role="alert" className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
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
                  {addressControl(client, "desktop")}
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
                        className="input max-w-[9rem] px-2 py-1.5"
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
                {addressControl(client, "mobile")}
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
