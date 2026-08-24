"use client";

import type { Client } from "@/types/database";
import { formatDateShort } from "@/lib/utils";

export function ClientsTable({ clients }: { clients: Client[] }) {
  return (
    <>
      <div className="hidden md:block card overflow-x-auto p-0">
        <table className="min-w-full text-sm">
          <thead className="border-b border-[var(--border)] bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-3">Имя</th>
              <th className="px-4 py-3">Телефон</th>
              <th className="px-4 py-3">Добавлен</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id} className="border-b border-[var(--border)]">
                <td className="px-4 py-3 font-medium">{client.full_name}</td>
                <td className="px-4 py-3">{client.phone ?? "—"}</td>
                <td className="px-4 py-3">{formatDateShort(client.created_at.slice(0, 10))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 md:hidden">
        {clients.map((client) => (
          <div key={client.id} className="card">
            <p className="font-semibold">{client.full_name}</p>
            <p className="text-sm text-[var(--muted)]">{client.phone ?? "Телефон не указан"}</p>
          </div>
        ))}
      </div>
    </>
  );
}
