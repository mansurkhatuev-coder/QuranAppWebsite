import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { ClientsTable } from "@/components/ClientsTable";
import { createClient, getSessionProfile } from "@/lib/supabase/server";

export default async function ClientsPage() {
  const { organization } = await getSessionProfile();
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .eq("organization_id", organization!.id)
    .order("created_at", { ascending: false });

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

      {(clients ?? []).length === 0 ? (
        <EmptyState title="Клиентов пока нет" description="Добавьте первого клиента." />
      ) : (
        <ClientsTable clients={clients ?? []} />
      )}
    </div>
  );
}
