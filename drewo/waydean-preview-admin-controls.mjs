export function accountLockPresentation(locked, lockedReason = '', canToggleLock = true) {
  const isLocked = locked === true;
  const canToggle = canToggleLock === true;
  const reason = typeof lockedReason === 'string' ? lockedReason.trim() : '';
  return {
    state: isLocked ? 'Правки закрыты' : 'Правки открыты',
    detail: isLocked
      ? reason || 'Обычные редакторы не смогут сохранить изменения.'
      : 'Редакторы могут сохранять изменения.',
    buttonLabel: canToggle ? (isLocked ? 'Разрешить правки' : 'Закрыть правки') : 'Изменение недоступно',
    canToggle
  };
}

export function validateFamilyPasswordChange(password, confirmation) {
  const normalizedPassword = String(password ?? '').trim().toLocaleLowerCase('ru-RU');
  const normalizedConfirmation = String(confirmation ?? '').trim().toLocaleLowerCase('ru-RU');
  if (normalizedPassword !== normalizedConfirmation) {
    return { ok: false, error: 'Пароли не совпадают.' };
  }
  if (normalizedPassword.length < 2 || normalizedPassword.length > 64) {
    return { ok: false, error: 'Пароль должен содержать от 2 до 64 символов.' };
  }
  return { ok: true, normalizedPassword };
}
