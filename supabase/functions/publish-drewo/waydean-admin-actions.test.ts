import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isWaydeanAdminAction, isWaydeanAdminRestoreBaseValid, waydeanAdminActionTarget } from './waydean-admin-actions.ts';

Deno.test('allows only the account-scoped Waydean actions', () => {
  const actions = [
    ['waydean-admin-auth', null],
    ['waydean-admin-load', null],
    ['waydean-admin-publish', 'publish'],
    ['waydean-admin-backups', 'list-backups'],
    ['waydean-admin-snapshot', 'snapshot'],
    ['waydean-admin-pin-backup', 'pin-backup'],
    ['waydean-admin-restore', 'restore'],
  ] as const;

  for (const [action, target] of actions) {
    assertEquals(isWaydeanAdminAction(action), true, `${action} should be allowlisted`);
    assertEquals(waydeanAdminActionTarget(action), target, `${action} should map explicitly`);
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
  assertEquals(isWaydeanAdminAction(''), false);
  assertEquals(waydeanAdminActionTarget('waydean-admin-delete-tree'), null);
  assertEquals(waydeanAdminActionTarget(null), null);
});
