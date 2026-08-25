import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getSessionProfile();
  if (!user) redirect("/login");
  if (!profile?.is_platform_admin) redirect("/dashboard");
  return <>{children}</>;
}
