import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { authorizeWaydeanAdmin } from './waydean-admin-access.ts';

Deno.test('allows only the configured admin account for the drewo tree', () => {
  assertEquals(
    authorizeWaydeanAdmin({
      treeDir: 'drewo',
      authenticatedUserId: 'auth-user-123',
      allowedUserId: 'auth-user-123',
    }),
    { ok: true, treeDir: 'drewo' },
  );
});

Deno.test('denies a different authenticated Supabase account', () => {
  assertEquals(
    authorizeWaydeanAdmin({
      treeDir: 'drewo',
      authenticatedUserId: 'other-user',
      allowedUserId: 'auth-user-123',
    }),
    { ok: false, status: 403, code: 'account_not_allowed' },
  );
});

Deno.test('fails closed when the admin allowlist secret is missing', () => {
  assertEquals(
    authorizeWaydeanAdmin({
      treeDir: 'drewo',
      authenticatedUserId: 'auth-user-123',
      allowedUserId: '',
    }),
    { ok: false, status: 503, code: 'allowlist_not_configured' },
  );
});

Deno.test('rejects a request without a verified user', () => {
  assertEquals(
    authorizeWaydeanAdmin({
      treeDir: 'drewo',
      authenticatedUserId: null,
      allowedUserId: 'auth-user-123',
    }),
    { ok: false, status: 401, code: 'authentication_required' },
  );
});

Deno.test('does not allow the account gate to authorize a different tree', () => {
  assertEquals(
    authorizeWaydeanAdmin({
      treeDir: 'another-tree',
      authenticatedUserId: 'auth-user-123',
      allowedUserId: 'auth-user-123',
    }),
    { ok: false, status: 400, code: 'invalid_tree' },
  );
});
