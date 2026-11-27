export const FAMILY_PASSWORD_MIN_LENGTH = 15;
export const FAMILY_PASSWORD_MAX_LENGTH = 64;
export const FAMILY_PASSWORD_LENGTH_ERROR =
  `Пароль семьи должен содержать от ${FAMILY_PASSWORD_MIN_LENGTH} до ${FAMILY_PASSWORD_MAX_LENGTH} символов.`;

/** @param {unknown} value */
export function normalizeFamilyPassword(value) {
  return String(value ?? '').trim().toLocaleLowerCase('ru-RU');
}

/** @param {string} password */
export function familyPasswordLength(password) {
  return Array.from(password).length;
}

/** @param {string} normalizedPassword */
export function newFamilyPasswordError(normalizedPassword) {
  const length = familyPasswordLength(normalizedPassword);
  return length < FAMILY_PASSWORD_MIN_LENGTH || length > FAMILY_PASSWORD_MAX_LENGTH
    ? FAMILY_PASSWORD_LENGTH_ERROR
    : '';
}
