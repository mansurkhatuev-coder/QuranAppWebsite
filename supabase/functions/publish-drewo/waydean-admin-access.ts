export type WaydeanAdminAccessInput = {
  treeDir: unknown;
  authenticatedUserId: string | null | undefined;
  allowedUserId: string | null | undefined;
};

export type WaydeanAdminAccessDecision =
  | { ok: true; treeDir: 'drewo' }
  | {
    ok: false;
    status: 400 | 401 | 403 | 503;
    code:
      | 'invalid_tree'
      | 'authentication_required'
      | 'account_not_allowed'
      | 'allowlist_not_configured';
  };

export function authorizeWaydeanAdmin({
  treeDir,
  authenticatedUserId,
  allowedUserId,
}: WaydeanAdminAccessInput): WaydeanAdminAccessDecision {
  if (treeDir !== 'drewo') {
    return { ok: false, status: 400, code: 'invalid_tree' };
  }

  const configuredId = typeof allowedUserId === 'string'
    ? allowedUserId.trim()
    : '';
  if (!configuredId) {
    return { ok: false, status: 503, code: 'allowlist_not_configured' };
  }

  if (typeof authenticatedUserId !== 'string' || !authenticatedUserId.trim()) {
    return { ok: false, status: 401, code: 'authentication_required' };
  }

  if (authenticatedUserId !== configuredId) {
    return { ok: false, status: 403, code: 'account_not_allowed' };
  }

  return { ok: true, treeDir: 'drewo' };
}
