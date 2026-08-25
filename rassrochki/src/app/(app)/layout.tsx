import { AccessBlocked } from "@/components/AccessBlocked";
import { AppShell } from "@/components/AppShell";
import { getAccessState, organizationHasAccess } from "@/lib/access";
import { getSessionProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, organization } = await getSessionProfile();
  if (!user) redirect("/login");
  if (!organization) redirect("/onboarding");

  if (!organizationHasAccess(organization)) {
    return <AccessBlocked organization={organization} />;
  }

  const access = getAccessState(organization);
  const showTrialWarning =
    organization.subscription_status === "trial" &&
    access.daysLeft != null &&
    access.daysLeft <= 7;

  return (
    <AppShell
      orgName={organization.name}
      accessLabel={access.label}
      showTrialWarning={showTrialWarning}
      isPlatformAdmin={Boolean(profile?.is_platform_admin)}
    >
      {children}
    </AppShell>
  );
}
