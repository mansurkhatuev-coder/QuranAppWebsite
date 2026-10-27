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
