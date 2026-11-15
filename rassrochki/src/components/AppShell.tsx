"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageFade } from "@/components/PageFade";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";
import { OfflineBootstrap, OfflineStatus } from "@/components/OfflineBootstrap";
import { getOfflineStore } from "@/lib/offline/db";

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
  userId,
  organizationId,
  children,
}: {
  orgName: string;
  accessLabel?: string | null;
  showTrialWarning?: boolean;
  isPlatformAdmin?: boolean;
  userId: string;
  organizationId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  function openOfflineWorkspace(event: MouseEvent<HTMLDivElement>) {
    if (
      navigator.onLine ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLAnchorElement>("a[href]");
    if (!link || link.target === "_blank" || link.hasAttribute("download")) return;

    const destination = new URL(link.href, window.location.href);
    if (destination.origin !== window.location.origin || destination.pathname === "/offline.html") {
      return;
    }

    // Next.js client transitions request server data; the service worker only
    // falls back to the local workspace for document navigations.
    event.preventDefault();
    window.location.replace("/offline.html");
  }

  async function logout() {
    let queuedCount = 0;
    try {
      queuedCount = (await getOfflineStore().listOperations(userId, organizationId)).length;
    } catch {
      // Continue to the explicit logout path if local storage cannot be read.
    }
    if (
      queuedCount > 0 &&
      !window.confirm(
        `На устройстве есть ${queuedCount} несинхронизированных изменений. Нажмите «Отмена», чтобы остаться и синхронизировать их. Если выйти сейчас, локальные изменения и чеки будут удалены без отправки. Выйти и удалить данные?`
      )
    ) {
      return;
    }

    window.dispatchEvent(new Event("rassrochki:offline-lock"));
    try {
      await getOfflineStore().clearAccount(userId, organizationId);
      localStorage.removeItem("rassrochki:offline-account");
    } catch {
      window.dispatchEvent(new Event("rassrochki:offline-unlock"));
      window.alert("Не удалось очистить офлайн-данные. Повторите выход после перезагрузки страницы.");
      return;
    }

    const supabase = createClient();
    await supabase.auth.signOut();
    try {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (
          key.startsWith("draft:") ||
          key.startsWith("rassrochki:") ||
          key.includes("backup")
        ) {
          localStorage.removeItem(key);
        }
      }
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.filter((n) => n.startsWith("rassrochki")).map((n) => caches.delete(n)));
      }
    } catch {
      // ignore storage cleanup errors
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <OfflineBootstrap userId={userId} organizationId={organizationId}>
    <div className="min-h-screen" onClickCapture={openOfflineWorkspace}>
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
            <OfflineStatus />
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
                aria-current={active ? "page" : undefined}
                className={`min-h-11 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 ${
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
      <main className="mx-auto max-w-6xl space-y-3 px-4 py-4 md:py-6">
        <PageFade>{children}</PageFade>
        <PwaInstallBanner />
      </main>
    </div>
    </OfflineBootstrap>
  );
}
