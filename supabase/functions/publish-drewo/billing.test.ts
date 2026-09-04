import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  applyBillingAction,
  getBillingAccess,
  parseBilling,
  reconcileBilling,
  startTrialBilling,
  defaultExemptBilling,
  addMonthsIso,
} from './billing.ts';

Deno.test('legacy / missing billing is exempt', () => {
  const billing = parseBilling(undefined);
  const access = getBillingAccess(billing, new Date('2026-09-04T00:00:00.000Z'));
  assertEquals(access.hasAccess, true);
  assertEquals(access.reason, 'exempt');
  assertEquals(access.editsBlocked, false);
});

Deno.test('trial expires into simple mode (edits stay, premium off)', () => {
  const now = new Date('2026-09-04T12:00:00.000Z');
  const trial = startTrialBilling(new Date('2026-08-01T12:00:00.000Z'), 30);
  const access = getBillingAccess(trial, now);
  assertEquals(access.hasAccess, true);
  assertEquals(access.hasPremium, false);
  assertEquals(access.reason, 'trial_expired');
  assertEquals(access.editsBlocked, false);
});

Deno.test('extend sets active paidUntil and revenue', () => {
  const now = new Date('2026-09-04T12:00:00.000Z');
  const trial = startTrialBilling(now, 30);
  const next = applyBillingAction(trial, {
    action: 'extend',
    periods: 1,
    paymentAmount: 790,
    paymentMethod: 'manual_whatsapp',
    now,
  });
  assertEquals(next.status, 'active');
  assertEquals(next.lastPaymentAmount, 790);
  assertEquals(next.revenueTotal, 790);
  assertEquals(next.paymentMethod, 'manual_whatsapp');
  const access = getBillingAccess(next, now);
  assertEquals(access.hasAccess, true);
  assertEquals(Boolean(next.paidUntil), true);
});

Deno.test('extend stacks from paidUntil when still valid', () => {
  const now = new Date('2026-09-04T12:00:00.000Z');
  const paidUntil = addMonthsIso(null, 6, now);
  const base = {
    ...defaultExemptBilling(),
    status: 'active' as const,
    paidUntil,
    priceRub: 790,
    periodMonths: 6,
    paymentMethod: 'manual_whatsapp' as const,
  };
  const next = applyBillingAction(base, { action: 'extend', periods: 1, now });
  assertEquals(Date.parse(next.paidUntil!), Date.parse(addMonthsIso(paidUntil, 6, now)));
});

Deno.test('deactivate blocks access', () => {
  const now = new Date('2026-09-04T12:00:00.000Z');
  const next = applyBillingAction(startTrialBilling(now), {
    action: 'deactivate',
    now,
  });
  assertEquals(next.status, 'disabled');
  const access = getBillingAccess(next, now);
  assertEquals(access.hasAccess, false);
  assertEquals(access.reason, 'disabled');
});

Deno.test('reconcile active past paidUntil → expired', () => {
  const now = new Date('2026-09-04T12:00:00.000Z');
  const billing = reconcileBilling(
    {
      ...defaultExemptBilling(),
      status: 'active',
      paidUntil: '2026-08-01T00:00:00.000Z',
    },
    now
  );
  assertEquals(billing.status, 'expired');
});
