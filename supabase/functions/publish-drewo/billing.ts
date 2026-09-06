/** Billing for family trees: WhatsApp now, SBP-ready fields later. */

export type BillingStatus = 'exempt' | 'trial' | 'active' | 'expired' | 'disabled';
export type PaymentMethod = 'manual_whatsapp' | 'sbp' | null;

/** Reserved for future SBP (Система быстрых платежей) provider integration. */
export type SbpBillingState = {
  customerId: string | null;
  subscriptionId: string | null;
  lastPaymentUrl: string | null;
  lastQrId: string | null;
  lastProviderStatus: string | null;
};

export type TreeBilling = {
  /** Product code; keep stable for SBP catalog mapping later. */
  plan: 'family_half_year';
  status: BillingStatus;
  trialEndsAt: string | null;
  paidUntil: string | null;
  /** Grandfathered price for this tree (₽). */
  priceRub: number;
  priceLocked: boolean;
  periodMonths: number;
  paymentMethod: PaymentMethod;
  lastPaymentAt: string | null;
  lastPaymentAmount: number | null;
  /** External id when SBP/manual receipt is recorded. */
  lastPaymentId: string | null;
  revenueTotal: number;
  notes: string;
  sbp: SbpBillingState;
};

export type BillingAccessState = {
  hasAccess: boolean;
  /** Premium visuals (sky, premium theme). Trial + paid + exempt. */
  hasPremium: boolean;
  reason: 'ok' | 'exempt' | 'disabled' | 'trial_expired' | 'subscription_expired';
  daysLeft: number | null;
  label: string | null;
  /** Edits blocked only when tree is disabled (not when premium lapsed). */
  editsBlocked: boolean;
  editBlockReason: string;
};

export const DEFAULT_PRICE_RUB = 790;
export const DEFAULT_PERIOD_MONTHS = 6;
export const DEFAULT_TRIAL_DAYS = 30;
export const BILLING_PLAN = 'family_half_year' as const;

export function emptySbpState(): SbpBillingState {
  return {
    customerId: null,
    subscriptionId: null,
    lastPaymentUrl: null,
    lastQrId: null,
    lastProviderStatus: null,
  };
}

export function defaultExemptBilling(): TreeBilling {
  return {
    plan: BILLING_PLAN,
    status: 'exempt',
    trialEndsAt: null,
    paidUntil: null,
    priceRub: DEFAULT_PRICE_RUB,
    priceLocked: true,
    periodMonths: DEFAULT_PERIOD_MONTHS,
    paymentMethod: null,
    lastPaymentAt: null,
    lastPaymentAmount: null,
    lastPaymentId: null,
    revenueTotal: 0,
    notes: '',
    sbp: emptySbpState(),
  };
}

export function startTrialBilling(now = new Date(), trialDays = DEFAULT_TRIAL_DAYS): TreeBilling {
  const ends = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
  return {
    ...defaultExemptBilling(),
    status: 'trial',
    trialEndsAt: ends.toISOString(),
    paymentMethod: 'manual_whatsapp',
  };
}

function asIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

function asNonNegInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.floor(n), 1_000_000_000);
}

function asStatus(value: unknown): BillingStatus {
  if (
    value === 'exempt' ||
    value === 'trial' ||
    value === 'active' ||
    value === 'expired' ||
    value === 'disabled'
  ) {
    return value;
  }
  return 'exempt';
}

function asPaymentMethod(value: unknown): PaymentMethod {
  if (value === 'manual_whatsapp' || value === 'sbp') return value;
  return null;
}

function parseSbp(raw: unknown): SbpBillingState {
  const base = emptySbpState();
  if (!raw || typeof raw !== 'object') return base;
  const item = raw as Record<string, unknown>;
  return {
    customerId: typeof item.customerId === 'string' ? item.customerId.slice(0, 120) : null,
    subscriptionId:
      typeof item.subscriptionId === 'string' ? item.subscriptionId.slice(0, 120) : null,
    lastPaymentUrl:
      typeof item.lastPaymentUrl === 'string' ? item.lastPaymentUrl.trim().slice(0, 500) : null,
    lastQrId: typeof item.lastQrId === 'string' ? item.lastQrId.slice(0, 120) : null,
    lastProviderStatus:
      typeof item.lastProviderStatus === 'string'
        ? item.lastProviderStatus.trim().slice(0, 80)
        : null,
  };
}

/** Missing billing → exempt (legacy trees keep working). */
export function parseBilling(raw: unknown): TreeBilling {
  if (!raw || typeof raw !== 'object') return defaultExemptBilling();
  const item = raw as Record<string, unknown>;
  const priceRub = asNonNegInt(item.priceRub, DEFAULT_PRICE_RUB) || DEFAULT_PRICE_RUB;
  const periodMonths =
    asNonNegInt(item.periodMonths, DEFAULT_PERIOD_MONTHS) || DEFAULT_PERIOD_MONTHS;
  return {
    plan: BILLING_PLAN,
    status: asStatus(item.status),
    trialEndsAt: asIso(item.trialEndsAt),
    paidUntil: asIso(item.paidUntil),
    priceRub,
    priceLocked: item.priceLocked !== false,
    periodMonths: Math.min(Math.max(periodMonths, 1), 36),
    paymentMethod: asPaymentMethod(item.paymentMethod),
    lastPaymentAt: asIso(item.lastPaymentAt),
    lastPaymentAmount:
      item.lastPaymentAmount == null ? null : asNonNegInt(item.lastPaymentAmount, 0),
    lastPaymentId: typeof item.lastPaymentId === 'string' ? item.lastPaymentId.slice(0, 120) : null,
    revenueTotal: asNonNegInt(item.revenueTotal, 0),
    notes: typeof item.notes === 'string' ? item.notes.trim().slice(0, 300) : '',
    sbp: parseSbp(item.sbp),
  };
}

export function serializeBilling(billing: TreeBilling): TreeBilling {
  return {
    plan: BILLING_PLAN,
    status: billing.status,
    trialEndsAt: billing.trialEndsAt,
    paidUntil: billing.paidUntil,
    priceRub: billing.priceRub,
    priceLocked: billing.priceLocked,
    periodMonths: billing.periodMonths,
    paymentMethod: billing.paymentMethod,
    lastPaymentAt: billing.lastPaymentAt,
    lastPaymentAmount: billing.lastPaymentAmount,
    lastPaymentId: billing.lastPaymentId,
    revenueTotal: billing.revenueTotal,
    notes: billing.notes,
    sbp: {
      customerId: billing.sbp.customerId,
      subscriptionId: billing.sbp.subscriptionId,
      lastPaymentUrl: billing.sbp.lastPaymentUrl,
      lastQrId: billing.sbp.lastQrId,
      lastProviderStatus: billing.sbp.lastProviderStatus,
    },
  };
}

function daysUntil(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const ends = Date.parse(iso);
  if (!Number.isFinite(ends)) return null;
  return Math.ceil((ends - now.getTime()) / (24 * 60 * 60 * 1000));
}

function formatRuDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * Reconcile stored status with dates (trial/paid may have lapsed).
 * Does not mutate disabled/exempt.
 */
export function reconcileBilling(billing: TreeBilling, now = new Date()): TreeBilling {
  if (billing.status === 'exempt' || billing.status === 'disabled') {
    return billing;
  }

  if (billing.status === 'trial') {
    if (billing.trialEndsAt && Date.parse(billing.trialEndsAt) <= now.getTime()) {
      return { ...billing, status: 'expired' };
    }
    return billing;
  }

  if (billing.status === 'active') {
    if (billing.paidUntil && Date.parse(billing.paidUntil) <= now.getTime()) {
      return { ...billing, status: 'expired' };
    }
    return billing;
  }

  // expired: if somehow paidUntil is in the future again, revive
  if (billing.paidUntil && Date.parse(billing.paidUntil) > now.getTime()) {
    return { ...billing, status: 'active' };
  }
  if (billing.trialEndsAt && Date.parse(billing.trialEndsAt) > now.getTime() && !billing.paidUntil) {
    return { ...billing, status: 'trial' };
  }
  return billing;
}

export function getBillingAccess(billingInput: TreeBilling, now = new Date()): BillingAccessState {
  const billing = reconcileBilling(billingInput, now);

  if (billing.status === 'exempt') {
    return {
      hasAccess: true,
      hasPremium: true,
      reason: 'exempt',
      daysLeft: null,
      label: 'Без оплаты (своё)',
      editsBlocked: false,
      editBlockReason: '',
    };
  }

  if (billing.status === 'disabled') {
    return {
      hasAccess: false,
      hasPremium: false,
      reason: 'disabled',
      daysLeft: null,
      label: 'Отключено',
      editsBlocked: true,
      editBlockReason: 'Древо отключено. Напишите в WhatsApp, чтобы восстановить доступ.',
    };
  }

  if (billing.status === 'trial') {
    const left = daysUntil(billing.trialEndsAt, now);
    return {
      hasAccess: true,
      hasPremium: true,
      reason: 'ok',
      daysLeft: left,
      label: billing.trialEndsAt ? `Премиум (пробный) до ${formatRuDate(billing.trialEndsAt)}` : 'Премиум (пробный)',
      editsBlocked: false,
      editBlockReason: '',
    };
  }

  if (billing.status === 'active') {
    const left = daysUntil(billing.paidUntil, now);
    return {
      hasAccess: true,
      hasPremium: true,
      reason: 'ok',
      daysLeft: left,
      label: billing.paidUntil ? `Премиум до ${formatRuDate(billing.paidUntil)}` : 'Премиум',
      editsBlocked: false,
      editBlockReason: '',
    };
  }

  // expired → simple mode: edits OK, premium visuals off
  const trialish = Boolean(billing.trialEndsAt) && !billing.lastPaymentAt;
  return {
    hasAccess: true,
    hasPremium: false,
    reason: trialish ? 'trial_expired' : 'subscription_expired',
    daysLeft: 0,
    label: trialish ? 'Простой режим (пробный премиум закончился)' : 'Простой режим',
    editsBlocked: false,
    editBlockReason: '',
  };
}

export function addMonthsIso(fromIso: string | null, months: number, now = new Date()): string {
  const baseMs = fromIso && Date.parse(fromIso) > now.getTime() ? Date.parse(fromIso) : now.getTime();
  const d = new Date(baseMs);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  // clamp overflow (Jan 31 + 1 month)
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d.toISOString();
}

export type BillingAction = 'extend' | 'activate_trial' | 'deactivate' | 'set_exempt';

export type ApplyBillingOptions = {
  action: BillingAction;
  /** Periods to extend (each = billing.periodMonths). Default 1. */
  periods?: number;
  paymentAmount?: number | null;
  paymentId?: string | null;
  paymentMethod?: PaymentMethod;
  note?: string | null;
  now?: Date;
};

export function applyBillingAction(current: TreeBilling, options: ApplyBillingOptions): TreeBilling {
  const now = options.now ?? new Date();
  const billing = { ...reconcileBilling(current, now), sbp: { ...current.sbp } };
  const periods = Math.min(Math.max(Number(options.periods) || 1, 1), 12);
  const note = typeof options.note === 'string' ? options.note.trim().slice(0, 300) : '';

  if (options.action === 'set_exempt') {
    return {
      ...billing,
      status: 'exempt',
      notes: note || billing.notes,
    };
  }

  if (options.action === 'deactivate') {
    return {
      ...billing,
      status: 'disabled',
      notes: note || billing.notes,
    };
  }

  if (options.action === 'activate_trial') {
    const trial = startTrialBilling(now);
    return {
      ...billing,
      status: 'trial',
      trialEndsAt: trial.trialEndsAt,
      paymentMethod: billing.paymentMethod || 'manual_whatsapp',
      notes: note || billing.notes,
    };
  }

  // extend
  const months = billing.periodMonths * periods;
  const paidUntil = addMonthsIso(billing.paidUntil, months, now);
  const amount =
    options.paymentAmount == null
      ? billing.priceRub * periods
      : asNonNegInt(options.paymentAmount, 0);
  const method = options.paymentMethod || billing.paymentMethod || 'manual_whatsapp';

  return {
    ...billing,
    status: 'active',
    paidUntil,
    paymentMethod: method,
    lastPaymentAt: now.toISOString(),
    lastPaymentAmount: amount,
    lastPaymentId:
      typeof options.paymentId === 'string' && options.paymentId.trim()
        ? options.paymentId.trim().slice(0, 120)
        : billing.lastPaymentId,
    revenueTotal: billing.revenueTotal + amount,
    notes: note || billing.notes,
  };
}

export function publicBillingView(billingInput: TreeBilling, now = new Date()) {
  const billing = reconcileBilling(billingInput, now);
  const access = getBillingAccess(billing, now);
  return {
    plan: billing.plan,
    status: billing.status,
    trialEndsAt: billing.trialEndsAt,
    paidUntil: billing.paidUntil,
    priceRub: billing.priceRub,
    priceLocked: billing.priceLocked,
    periodMonths: billing.periodMonths,
    paymentMethod: billing.paymentMethod,
    revenueTotal: billing.revenueTotal,
    hasAccess: access.hasAccess,
    hasPremium: access.hasPremium,
    reason: access.reason,
    daysLeft: access.daysLeft,
    label: access.label,
    editsBlocked: access.editsBlocked,
    editBlockReason: access.editBlockReason,
    /** Placeholder until SBP checkout is wired. */
    sbpReady: true,
    sbp: {
      hasCustomer: Boolean(billing.sbp.customerId),
      hasSubscription: Boolean(billing.sbp.subscriptionId),
      lastProviderStatus: billing.sbp.lastProviderStatus,
    },
  };
}

export function buildWhatsAppRenewText(options: {
  treeTitle: string;
  treeDir: string;
  code?: string;
  priceRub: number;
  periodMonths: number;
  reason?: BillingAccessState['reason'];
}) {
  const period =
    options.periodMonths === 6 ? 'полгода' : `${options.periodMonths} мес.`;
  const why =
    options.reason === 'trial_expired'
      ? 'Пробный премиум закончился — хочу снова полный режим.'
      : options.reason === 'disabled'
        ? 'Древо отключено.'
        : 'Хочу продлить премиум.';
  const lines = [
    'Здравствуйте! Хочу премиум для семейного древа.',
    why,
    `Древо: ${options.treeTitle}`,
    `Код: ${options.code || options.treeDir}`,
    `Тариф: ${options.priceRub} ₽ / ${period}`,
    'Оплата нужна на развитие и поддержку проекта.',
  ];
  return lines.join('\n');
}
