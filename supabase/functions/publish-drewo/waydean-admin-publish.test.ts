import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { waydeanAdminPublishHasConflict } from './waydean-admin-publish.ts';

Deno.test('accepts an unchanged tree and activity base', () => {
  assertEquals(waydeanAdminPublishHasConflict({
    baseFingerprint: 'tree-v1',
    serverFingerprint: 'tree-v1',
    baseActivityJson: '[ {"id":1} ]',
    serverActivityJson: '[{"id":1}]',
  }), false);
});

Deno.test('rejects a changed tree even when the activity matches', () => {
  assertEquals(waydeanAdminPublishHasConflict({
    baseFingerprint: 'tree-v1',
    serverFingerprint: 'tree-v2',
    baseActivityJson: '[]',
    serverActivityJson: '[]',
  }), true);
});

Deno.test('rejects a changed server activity log even when the tree matches', () => {
  assertEquals(waydeanAdminPublishHasConflict({
    baseFingerprint: 'tree-v1',
    serverFingerprint: 'tree-v1',
    baseActivityJson: '[{"id":1}]',
    serverActivityJson: '[{"id":1},{"id":2}]',
  }), true);
});

Deno.test('fails closed when an account publish has no known base version', () => {
  assertEquals(waydeanAdminPublishHasConflict({
    baseFingerprint: '',
    serverFingerprint: 'tree-v1',
    baseActivityJson: '[]',
    serverActivityJson: '[]',
  }), true);
});
