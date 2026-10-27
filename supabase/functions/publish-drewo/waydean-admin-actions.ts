const WAYDEAN_ADMIN_ACTION_TARGETS: Readonly<Record<string, string | null>> = Object.freeze({
  'waydean-admin-auth': null,
  'waydean-admin-load': null,
  'waydean-admin-publish': 'publish',
  'waydean-admin-backups': 'list-backups',
  'waydean-admin-snapshot': 'snapshot',
  'waydean-admin-pin-backup': 'pin-backup',
  'waydean-admin-restore': 'restore',
  'waydean-admin-lock': 'set-lock',
  'waydean-admin-password': 'set-password',
});

export function isWaydeanAdminAction(action: unknown): action is string {
  return typeof action === 'string' && Object.hasOwn(WAYDEAN_ADMIN_ACTION_TARGETS, action);
}

export function waydeanAdminActionTarget(action: unknown): string | null {
  if (!isWaydeanAdminAction(action)) return null;
  return WAYDEAN_ADMIN_ACTION_TARGETS[action];
}

export function waydeanAdminLoadAccessState(presentation: {
  [key: string]: unknown;
  locked: unknown;
  lockedReason?: unknown;
  deletedAt?: unknown;
  billing?: Record<string, unknown> | null;
}): { locked: boolean; lockedReason: string; canToggleLock: boolean } {
  const locked = presentation.locked === true;
  const lockedReason = locked && typeof presentation.lockedReason === 'string'
    ? presentation.lockedReason.trim().slice(0, 200)
    : '';
  const hasDeletedAt = typeof presentation.deletedAt === 'string' && presentation.deletedAt.length > 0;
  const billingBlocksEdits = presentation.billing?.editsBlocked === true;
  return { locked, lockedReason, canToggleLock: !hasDeletedAt && !billingBlocksEdits };
}

export async function familyPasswordSessionFields(
  isWaydeanAdminRequest: boolean,
  mintSessionToken: () => Promise<string>
): Promise<{ sessionToken?: string }> {
  if (isWaydeanAdminRequest) return {};
  return { sessionToken: await mintSessionToken() };
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
