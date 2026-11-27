export const FAMILY_AGGREGATE_POLICY_VERSION = 'drewo-family-aggregate-v1';

const treeDirPattern = /^drewo(?:-[a-z0-9-]{1,48})?$/;

export function authorizeFamilyAggregateConsent({
  role,
  treeDir,
  deleted = false,
  locked = false,
  decision = null,
  attested = false,
} = {}) {
  if (!treeDirPattern.test(String(treeDir || '')) || treeDir === 'drewo-reklama' || deleted) {
    return {ok: false, status: 403, error: 'Сводка для этого древа недоступна.'};
  }
  if (role !== 'editor') {
    return {ok: false, status: 403, error: 'Согласие может дать только семейная редакторская сессия.'};
  }
  if (decision == null) return {ok: true, operation: 'read', canManage: true};
  if (decision !== 'grant' && decision !== 'revoke') {
    return {ok: false, status: 400, error: 'Неизвестное действие с согласием.'};
  }
  if (decision === 'grant' && locked) {
    return {ok: false, status: 403, error: 'Для закрытого древа нельзя дать новое согласие.'};
  }
  if (decision === 'grant' && attested !== true) {
    return {ok: false, status: 400, error: 'Подтвердите полномочия представителя семьи.'};
  }
  return {ok: true, operation: decision, canManage: true};
}

export function canPublishAggregateSummary({enabled, configuredRepo, requestedRepo, repoIsPrivate} = {}) {
  return enabled === 'true'
    && typeof configuredRepo === 'string'
    && configuredRepo.length > 0
    && configuredRepo === requestedRepo
    && repoIsPrivate === true;
}
