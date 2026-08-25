"use client";

import { createClient } from "@/lib/supabase/client";

const LAST_BACKUP_KEY = "rassrochki:last-full-backup-at";

export function getLastBackupAt(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LAST_BACKUP_KEY);
}

export function markBackupDone() {
  if (typeof window === "undefined") return;
  localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
}

export function daysSinceBackup(): number | null {
  const raw = getLastBackupAt();
  if (!raw) return null;
  const ms = Date.now() - new Date(raw).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function needsBackupReminder(maxDays = 7): boolean {
  const days = daysSinceBackup();
  if (days === null) return true;
  return days >= maxDays;
}

export async function buildFullOrgBackup(organizationId: string) {
  const supabase = createClient();
  const [
    { data: organization },
    { data: settings },
    { data: clients },
    { data: investors },
    { data: loans },
    { data: schedules },
    { data: payments },
    { data: guarantors },
  ] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", organizationId).single(),
    supabase.from("organization_settings").select("*").eq("organization_id", organizationId).single(),
    supabase.from("clients").select("*").eq("organization_id", organizationId),
    supabase.from("investors").select("*").eq("organization_id", organizationId),
    supabase.from("loans").select("*").eq("organization_id", organizationId),
    supabase.from("payment_schedules").select("*").eq("organization_id", organizationId),
    supabase.from("payments").select("*").eq("organization_id", organizationId),
    supabase.from("loan_guarantors").select("*").eq("organization_id", organizationId),
  ]);

  return {
    exported_at: new Date().toISOString(),
    version: 1,
    organization,
    settings,
    clients: clients ?? [],
    investors: investors ?? [],
    loans: loans ?? [],
    payment_schedules: schedules ?? [],
    payments: payments ?? [],
    loan_guarantors: guarantors ?? [],
  };
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
