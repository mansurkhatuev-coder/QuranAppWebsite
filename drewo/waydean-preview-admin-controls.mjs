import { newFamilyPasswordError, normalizeFamilyPassword } from '../assets/drewo-family-password.mjs?v=1';

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
  const normalizedPassword = normalizeFamilyPassword(password);
  const normalizedConfirmation = normalizeFamilyPassword(confirmation);
  if (normalizedPassword !== normalizedConfirmation) {
    return { ok: false, error: 'Пароли не совпадают.' };
  }
  const error = newFamilyPasswordError(normalizedPassword);
  if (error) return { ok: false, error };
  return { ok: true, normalizedPassword };
}
