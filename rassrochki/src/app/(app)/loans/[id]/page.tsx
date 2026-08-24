import { notFound } from "next/navigation";
import { LoanDetail } from "@/components/LoanDetail";
import { createClient, getSessionProfile } from "@/lib/supabase/server";

export default async function LoanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organization, settings } = await getSessionProfile();
  const supabase = await createClient();

  const [{ data: loan }, { data: schedules }] = await Promise.all([
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
  ]);

  if (!loan || !settings) notFound();

  return (
    <LoanDetail
      loan={loan}
      schedules={schedules ?? []}
      settings={settings}
      orgName={organization!.name}
    />
  );
}
