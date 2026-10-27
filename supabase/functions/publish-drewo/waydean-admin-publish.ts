function normalizeJsonSnapshot(value: unknown): string {
  const source = String(value ?? '').trim();
  try {
    return JSON.stringify(JSON.parse(source));
  } catch {
    return source;
  }
}

/** Account publishing must stop when either the tree or its activity base changed. */
export function waydeanAdminPublishHasConflict({
  baseFingerprint,
  serverFingerprint,
  baseActivityJson,
  serverActivityJson,
}: {
  baseFingerprint: string;
  serverFingerprint: string;
  baseActivityJson: string;
  serverActivityJson: string;
}): boolean {
  if (!baseFingerprint || !serverFingerprint || baseFingerprint !== serverFingerprint) return true;
  return normalizeJsonSnapshot(baseActivityJson || '[]') !== normalizeJsonSnapshot(serverActivityJson || '[]');
}

function normalizeActivityArray(value: string): string | null {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? JSON.stringify(parsed) : null;
  } catch {
    return null;
  }
}

/** An account restore must match the exact tree and audit log shown in the UI. */
export function waydeanAdminRestoreHasConflict({
  expectedFingerprint,
  currentFingerprint,
  expectedActivityJson,
  currentActivityJson,
}: {
  expectedFingerprint: string;
  currentFingerprint: string;
  expectedActivityJson: string;
  currentActivityJson: string;
}): boolean {
  if (!expectedFingerprint || !currentFingerprint || expectedFingerprint !== currentFingerprint) return true;
  const expectedActivity = normalizeActivityArray(expectedActivityJson);
  const currentActivity = normalizeActivityArray(currentActivityJson);
  return expectedActivity === null || currentActivity === null || expectedActivity !== currentActivity;
}

export function waydeanAdminRestoreSafetySnapshot({
  currentTreeJson,
  currentActivityJson,
}: {
  currentTreeJson: string;
  currentActivityJson: string;
}): { treeJson: string; activityJson: string } {
  return { treeJson: currentTreeJson, activityJson: currentActivityJson };
}
