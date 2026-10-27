const WAYDEAN_ADMIN_ACTION_TARGETS: Readonly<Record<string, string | null>> = Object.freeze({
  'waydean-admin-auth': null,
  'waydean-admin-load': null,
  'waydean-admin-publish': 'publish',
  'waydean-admin-backups': 'list-backups',
  'waydean-admin-snapshot': 'snapshot',
  'waydean-admin-pin-backup': 'pin-backup',
  'waydean-admin-restore': 'restore',
});

export function isWaydeanAdminAction(action: unknown): action is string {
  return typeof action === 'string' && Object.hasOwn(WAYDEAN_ADMIN_ACTION_TARGETS, action);
}

export function waydeanAdminActionTarget(action: unknown): string | null {
  if (!isWaydeanAdminAction(action)) return null;
  return WAYDEAN_ADMIN_ACTION_TARGETS[action];
}

export function isWaydeanAdminRestoreBaseValid({
  expectedFingerprint,
  expectedActivityJson,
}: {
  expectedFingerprint: unknown;
  expectedActivityJson: unknown;
}): boolean {
  if (typeof expectedFingerprint !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedFingerprint)) return false;
  if (typeof expectedActivityJson !== 'string' || expectedActivityJson.length > 1_000_000) return false;
  try {
    return Array.isArray(JSON.parse(expectedActivityJson));
  } catch {
    return false;
  }
}
