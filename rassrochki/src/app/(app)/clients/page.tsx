"use client";

import Link from "next/link";
import { ClientsTable } from "@/components/ClientsTable";
import { EmptyState } from "@/components/ui";
import { useOfflineWorkspace } from "@/components/OfflineBootstrap";

export default function ClientsPage() {
  const { snapshot, loaded, online, syncing, error } = useOfflineWorkspace();
  const clients = snapshot?.clients ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Клиенты</h1>
          <p className="text-sm text-[var(--muted)]">Заёмщики по рассрочкам</p>
        </div>
        <Link href="/clients/new" className="btn-primary">
          + Клиент
        </Link>
      </div>

      {!loaded || (!snapshot && syncing) ? (
        <p className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--muted)]">
          Загружаем данные на устройство…
        </p>
      ) : !snapshot ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {online === false
            ? "На этом устройстве ещё нет сохранённых клиентов. Подключитесь к интернету, чтобы загрузить данные."
            : error || "Пока не удалось сохранить данные на устройстве. Повторите обновление."}
        </div>
      ) : clients.length === 0 ? (
        <EmptyState title="Клиентов пока нет" description="Добавьте первого клиента." />
      ) : (
        <ClientsTable clients={clients} />
      )}
    </div>
  );
}
