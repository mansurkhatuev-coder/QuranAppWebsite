import { notFound } from "next/navigation";
import { LoanDetail } from "@/components/LoanDetail";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { syncOverdueSchedules } from "@/lib/overdue";

export default async function LoanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organization, settings } = await getSessionProfile();
  const supabase = await createClient();
  if (organization && settings) {
    await syncOverdueSchedules(supabase, organization.id, settings.overdue_days, new Date());
  }

  const [{ data: loan }, { data: schedules }, { data: guarantors }] = await Promise.all([
    supabase
      .from("loans")
      .select("*, clients(full_name, phone), investors(name)")
      .eq("id", id)
      .eq("organization_id", organization!.id)
      .maybeSingle(),
    supabase
      .from("payment_schedules")
      .select("*")
      .eq("loan_id", id)
      .order("sequence_number"),
    supabase
      .from("loan_guarantors")
      .select("*")
      .eq("loan_id", id)
      .order("created_at"),
  ]);

  if (!loan || !settings) notFound();

  return (
    <LoanDetail
      loan={loan}
      schedules={schedules ?? []}
      guarantors={guarantors ?? []}
      settings={settings}
      orgName={organization!.name}
    />
  );
}
