import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getSessionProfile } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, organization } = await getSessionProfile();
  if (!user) redirect("/login");
  if (!organization) redirect("/onboarding");

  return <AppShell orgName={organization.name}>{children}</AppShell>;
}
