import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { backupListLabel, backupTimestamp, isSafeBackupName } from './backup-files.ts';

Deno.test('new snapshots have independent names even at the same timestamp', () => {
  const stamps = Array.from({ length: 32 }, () => backupTimestamp());
  const uniqueIds = stamps.map(stamp => stamp.split('_').at(-1));
  assertEquals(new Set(uniqueIds).size, stamps.length);
  for (const stamp of stamps) {
    const name = `drewo-test-${stamp}.json`;
    assert(isSafeBackupName(name, 'drewo-test'));
    assertEquals(backupListLabel(name, 'drewo-test'), stamp.slice(0, 19).replace('_', ' '));
  }
});

Deno.test('legacy JSON and HTML backups are listed and restorable for their own tree', () => {
  for (const extension of ['json', 'html']) {
    const name = `drewo-test-2026-10-01_09-30-20.${extension}`;
    assert(isSafeBackupName(name, 'drewo-test'));
    assertEquals(backupListLabel(name, 'drewo-test'), '2026-10-01 09-30-20');
    assertEquals(isSafeBackupName(name, 'drewo-other'), false);
  }
});
