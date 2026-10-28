export type FamilyPublishGuardInput = {
  role: string | null;
  signedFamilySession: boolean;
  force: boolean;
  baseFingerprint: string;
};

export type FamilyPublishGuardError = {
  status: 403 | 409;
  code: 'FAMILY_PUBLISH_FORCE_DENIED' | 'FAMILY_PUBLISH_BASE_REQUIRED';
  error: string;
};

export function familyPublishGuardError({
  role,
  signedFamilySession,
  force,
  baseFingerprint,
}: FamilyPublishGuardInput): FamilyPublishGuardError | null {
  if (force && role !== 'super') {
    return {
      status: 403,
      code: 'FAMILY_PUBLISH_FORCE_DENIED',
      error: 'Принудительная публикация доступна только роли super.',
    };
  }

  if (signedFamilySession && !force && !/^[a-f0-9]{64}$/i.test(baseFingerprint)) {
    return {
      status: 409,
      code: 'FAMILY_PUBLISH_BASE_REQUIRED',
      error: 'Не удалось проверить исходную версию дерева. Обновите дерево перед публикацией.',
    };
  }

  return null;
}
