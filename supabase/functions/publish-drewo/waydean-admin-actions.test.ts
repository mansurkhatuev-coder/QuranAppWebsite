import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  isWaydeanAdminAction,
  isWaydeanAdminRestoreBaseValid,
  waydeanAdminActionTarget,
  waydeanAdminLoadAccessState,
  familyPasswordSessionFields,
} from './waydean-admin-actions.ts';

Deno.test('allows only the account-scoped Waydean actions', () => {
  const actions = [
    ['waydean-admin-auth', null],
    ['waydean-admin-load', null],
    ['waydean-admin-publish', 'publish'],
    ['waydean-admin-backups', 'list-backups'],
    ['waydean-admin-snapshot', 'snapshot'],
    ['waydean-admin-pin-backup', 'pin-backup'],
    ['waydean-admin-restore', 'restore'],
    ['waydean-admin-lock', 'set-lock'],
    ['waydean-admin-password', 'set-password'],
    ['waydean-admin-push-vapid', 'vapid-public'],
    ['waydean-admin-push-subscribe', 'subscribe'],
    ['waydean-admin-push-unsubscribe', 'unsubscribe'],
  ] as const;

  for (const [action, target] of actions) {
    assertEquals(isWaydeanAdminAction(action), true, `${action} should be allowlisted`);
    assertEquals(waydeanAdminActionTarget(action), target, `${action} should map explicitly`);
  }
});

Deno.test('returns only the effective public lock state from an access presentation', () => {
  assertEquals(waydeanAdminLoadAccessState({
    locked: true,
    lockedReason: 'Правки временно закрыты',
    billing: { editsBlocked: false, status: 'active' },
    deletedAt: null,
    passwordHash: 'must-never-be-returned',
  }), {
    locked: true,
    lockedReason: 'Правки временно закрыты',
    canToggleLock: true,
  });
  assertEquals(waydeanAdminLoadAccessState({ locked: false, lockedReason: '' }), {
    locked: false,
    lockedReason: '',
    canToggleLock: true,
  });
  assertEquals(waydeanAdminLoadAccessState({
    locked: true,
    lockedReason: 'Правки недоступны по тарифу',
    billing: { editsBlocked: true },
    deletedAt: null,
  }), {
    locked: true,
    lockedReason: 'Правки недоступны по тарифу',
    canToggleLock: false,
  });
  assertEquals(waydeanAdminLoadAccessState({
    locked: true,
    lockedReason: 'Древо удалено из каталога.',
    billing: { editsBlocked: false },
    deletedAt: '2026-10-01T00:00:00.000Z',
  }), {
    locked: true,
    lockedReason: 'Древо удалено из каталога.',
    canToggleLock: false,
  });
});

Deno.test('does not mint a family super-session token for an account-admin password change', async () => {
  let minted = false;
  assertEquals(await familyPasswordSessionFields(true, async () => {
    minted = true;
    return 'family-super-token';
  }), {});
  assertEquals(minted, false);

  assertEquals(await familyPasswordSessionFields(false, async () => 'family-editor-token'), {
    sessionToken: 'family-editor-token',
  });
});

Deno.test('maps account-authenticated push actions to the existing push operations', () => {
  const actions = [
    ['waydean-admin-push-vapid', 'vapid-public'],
    ['waydean-admin-push-subscribe', 'subscribe'],
    ['waydean-admin-push-unsubscribe', 'unsubscribe'],
  ] as const;
  for (const [action, target] of actions) {
    assertEquals(isWaydeanAdminAction(action), true);
    assertEquals(waydeanAdminActionTarget(action), target);
  }
});

Deno.test('requires a SHA-256 tree fingerprint and bounded JSON activity array before account restore', () => {
  assertEquals(isWaydeanAdminRestoreBaseValid({
    expectedFingerprint: 'a'.repeat(64),
    expectedActivityJson: '[{"type":"add"}]',
  }), true);
  assertEquals(isWaydeanAdminRestoreBaseValid({
    expectedFingerprint: '',
    expectedActivityJson: '[]',
  }), false);
  assertEquals(isWaydeanAdminRestoreBaseValid({
    expectedFingerprint: 'a'.repeat(64),
    expectedActivityJson: '{"type":"add"}',
  }), false);
  assertEquals(isWaydeanAdminRestoreBaseValid({
    expectedFingerprint: 'a'.repeat(64),
    expectedActivityJson: ' '.repeat(1_000_001),
  }), false);
});

Deno.test('rejects unknown and non-string account action names', () => {
  assertEquals(isWaydeanAdminAction('waydean-admin-delete-tree'), false);
  assertEquals(isWaydeanAdminAction('restore'), false);
  assertEquals(isWaydeanAdminAction('set-lock'), false);
  assertEquals(isWaydeanAdminAction('set-password'), false);
  assertEquals(isWaydeanAdminAction(''), false);
  assertEquals(waydeanAdminActionTarget('waydean-admin-delete-tree'), null);
  assertEquals(waydeanAdminActionTarget(null), null);
});
