import type { Organization } from "@/types/database";
import { formatDateShort } from "@/lib/utils";

export type AccessState = {
  hasAccess: boolean;
  reason: "ok" | "disabled" | "trial_expired" | "subscription_expired";
  daysLeft: number | null;
  label: string | null;
};

function startOfUtcDay(d: Date) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function organizationHasAccess(org: Pick<
  Organization,
  "is_active" | "subscription_status" | "trial_ends_at" | "paid_until"
> | null | undefined): boolean {
  return getAccessState(org).hasAccess;
}

export function getAccessState(
  org: Pick<
    Organization,
    "is_active" | "subscription_status" | "trial_ends_at" | "paid_until"
  > | null | undefined
): AccessState {
  if (!org) {
    return { hasAccess: false, reason: "disabled", daysLeft: null, label: null };
  }

  if (!org.is_active || org.subscription_status === "disabled") {
    return {
      hasAccess: false,
      reason: "disabled",
      daysLeft: null,
      label: "Доступ приостановлен",
    };
  }

  const now = new Date();

  if (org.subscription_status === "trial") {
    if (!org.trial_ends_at) {
      return {
        hasAccess: false,
        reason: "trial_expired",
        daysLeft: 0,
        label: "Пробный период закончился",
      };
    }
    const ends = new Date(org.trial_ends_at);
    if (ends.getTime() <= now.getTime()) {
      return {
        hasAccess: false,
        reason: "trial_expired",
        daysLeft: 0,
        label: "Пробный период закончился",
      };
    }
    const daysLeft = Math.max(
      1,
      Math.ceil((ends.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    );
    return {
      hasAccess: true,
      reason: "ok",
      daysLeft,
      label: `Пробный период до ${formatDateShort(org.trial_ends_at.slice(0, 10))}`,
    };
  }

  if (org.subscription_status === "active") {
    if (org.paid_until) {
      const paidUntil = new Date(`${org.paid_until}T23:59:59.999Z`);
      if (startOfUtcDay(paidUntil) < startOfUtcDay(now)) {
        return {
          hasAccess: false,
          reason: "subscription_expired",
          daysLeft: 0,
          label: "Подписка закончилась",
        };
      }
      const daysLeft = Math.max(
        1,
        Math.ceil((paidUntil.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      );
      return {
        hasAccess: true,
        reason: "ok",
        daysLeft,
        label: `Оплачено до ${formatDateShort(org.paid_until)}`,
      };
    }
    return {
      hasAccess: true,
      reason: "ok",
      daysLeft: null,
      label: "Подписка активна",
    };
  }

  // expired или неизвестный статус
  return {
    hasAccess: false,
    reason: "subscription_expired",
    daysLeft: 0,
    label: "Доступ закрыт",
  };
}
