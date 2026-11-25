export function backupTimestamp() {
  const time = new Date().toISOString().slice(0, -1).replace(/[:.]/g, '-').replace('T', '_');
  return `${time}_${crypto.randomUUID().replaceAll('-', '')}`;
}

export function backupListLabel(name: string, treeDir: string) {
  const prefix = treeDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return name
    .replace(new RegExp(`^${prefix}-`), '')
    .replace(/\.(html|json)$/, '')
    .replace(/-\d{3}_[a-f0-9]{32}$/, '')
    .replace(/_/g, ' ');
}

export function isSafeBackupName(name: string, treeDir: string) {
  const prefix = treeDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${prefix}-\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2}(?:-\\d{3}_[a-f0-9]{32})?\\.(html|json)$`).test(
    name
  );
}
