"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const links = [
  { href: "/dashboard", label: "Главная" },
  { href: "/clients", label: "Клиенты" },
  { href: "/loans", label: "Рассрочки" },
  { href: "/settings", label: "Настройки" },
];

export function AppShell({
  orgName,
  accessLabel,
  showTrialWarning,
  isPlatformAdmin,
  children,
}: {
  orgName: string;
  accessLabel?: string | null;
  showTrialWarning?: boolean;
  isPlatformAdmin?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Рассрочки</p>
            <p className="max-w-[14rem] truncate font-semibold sm:max-w-xs md:max-w-md" title={orgName}>
              {orgName}
            </p>
            {accessLabel && (
              <p
                className={`mt-0.5 text-xs ${
                  showTrialWarning ? "font-medium text-amber-700" : "text-[var(--muted)]"
                }`}
              >
                {accessLabel}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isPlatformAdmin && (
              <Link href="/platform" className="btn-secondary text-xs">
                Организации
              </Link>
            )}
            <button type="button" onClick={logout} className="btn-secondary text-xs">
              Выйти
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 pb-2 md:px-4">
          {links.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium ${
                  active
                    ? "bg-teal-700 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-4 md:py-6">{children}</main>
    </div>
  );
}
