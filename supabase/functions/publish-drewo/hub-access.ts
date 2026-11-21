const userIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export function hubOperatorDenial(
  user: { id: string; is_anonymous?: boolean },
  configuredIds: string | undefined,
): { status: number; error: string } | null {
  const ids = (configuredIds ?? '').split(',').map(id => id.trim().toLowerCase()).filter(Boolean);
  if (!ids.length || ids.some(id => !userIdPattern.test(id))) {
    return { status: 503, error: 'Доступ оператора кабинета не настроен.' };
  }
  if (user.is_anonymous || !ids.includes(user.id.toLowerCase())) {
    return { status: 403, error: 'Для кабинета нужен разрешённый аккаунт оператора.' };
  }
  return null;
}

export function publicTreeStatus(treeDir: string, lock: { locked: boolean }) {
  return {
    ok: true,
    treeDir,
    locked: lock.locked,
    lockedReason: lock.locked ? 'Правки временно закрыты.' : '',
  };
}
