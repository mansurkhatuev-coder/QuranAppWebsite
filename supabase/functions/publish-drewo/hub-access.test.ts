import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { hubOperatorDenial, publicTreeStatus } from './hub-access.ts';

const operatorId = '123e4567-e89b-12d3-a456-426614174000';
const otherId = '123e4567-e89b-12d3-a456-426614174001';

Deno.test('requires a verified non-anonymous account on the configured operator list', () => {
  assertEquals(hubOperatorDenial({ id: operatorId }, ` ${otherId}, ${operatorId.toUpperCase()} `), null);
  assertEquals(hubOperatorDenial({ id: otherId }, operatorId)?.status, 403);
  assertEquals(hubOperatorDenial({ id: operatorId, is_anonymous: true }, operatorId)?.status, 403);
  assertEquals(hubOperatorDenial({ id: operatorId }, undefined)?.status, 503);
  assertEquals(hubOperatorDenial({ id: operatorId }, `${operatorId},not-an-account-id`)?.status, 503);
});

Deno.test('public tree status discloses the lock alone and a generic message', () => {
  const internal = {
    locked: true,
    lockedReason: 'internal administration note',
    deletedAt: '2026-01-01',
    billing: { revenueTotal: 400, paymentMethod: 'test' },
    superConfigured: true,
  };
  assertEquals(publicTreeStatus('drewo-synthetic', internal), {
    ok: true,
    treeDir: 'drewo-synthetic',
    locked: true,
    lockedReason: 'Правки временно закрыты.',
  });
  assertEquals(publicTreeStatus('drewo-synthetic', { locked: false }).lockedReason, '');
});
