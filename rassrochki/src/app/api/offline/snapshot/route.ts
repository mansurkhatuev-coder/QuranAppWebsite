import { NextResponse } from "next/server";
import { organizationHasAccess } from "@/lib/access";
import { readAllPages } from "@/lib/offline/snapshot";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { syncOverdueSchedules } from "@/lib/overdue";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_SIZE = 500;

function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "Cookie",
    },
  });
}

export async function GET() {
  const { user, organization, settings } = await getSessionProfile();
  if (!user || !organization) return json({ error: "Not authenticated" }, 401);
  if (!organizationHasAccess(organization)) return json({ error: "Access denied" }, 403);
  if (!settings) return json({ error: "Organization settings are unavailable" }, 503);

  const supabase = await createClient();
  const organizationId = organization.id;

  try {
    await syncOverdueSchedules(supabase, organizationId, settings.overdue_days, new Date());
    const [clients, loans, schedules, payments, guarantors, investors, cashTransactions] = await Promise.all([
      readAllPages(
        (from, to) =>
          supabase
            .from("clients")
            .select("*")
            .eq("organization_id", organizationId)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to),
        PAGE_SIZE
      ),
      readAllPages(
        (from, to) =>
          supabase
            .from("loans")
            .select("*, clients(full_name, phone, address), investors(name)")
            .eq("organization_id", organizationId)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to),
        PAGE_SIZE
      ),
      readAllPages(
        (from, to) =>
          supabase
            .from("payment_schedules")
            .select("*")
            .eq("organization_id", organizationId)
            .order("sequence_number", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to),
        PAGE_SIZE
      ),
      readAllPages(
        (from, to) =>
          supabase
            .from("payments")
            .select("*")
            .eq("organization_id", organizationId)
            .order("paid_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to),
        PAGE_SIZE
      ),
      readAllPages(
        (from, to) =>
          supabase
            .from("loan_guarantors")
            .select("*")
            .eq("organization_id", organizationId)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to),
        PAGE_SIZE
      ),
      readAllPages(
        (from, to) =>
          supabase
            .from("investors")
            .select("*")
            .eq("organization_id", organizationId)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to),
        PAGE_SIZE
      ),
      readAllPages(
        (from, to) =>
          supabase
            .from("cash_transactions")
            .select("*, investors(name)")
            .eq("organization_id", organizationId)
            .order("occurred_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to),
        PAGE_SIZE
      ),
    ]);

    return json(
      {
        complete: true,
        snapshot: {
          userId: user.id,
          organizationId,
          syncedAt: new Date().toISOString(),
          organization: { id: organization.id, name: organization.name },
          settings,
          clients,
          loans,
          schedules,
          payments,
          guarantors,
          investors,
          cash_transactions: cashTransactions,
        },
      },
      200
    );
  } catch {
    return json({ error: "Unable to load a complete offline snapshot" }, 503);
  }
}
