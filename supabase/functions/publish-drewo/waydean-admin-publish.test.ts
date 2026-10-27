import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { waydeanAdminPublishHasConflict, waydeanAdminRestoreHasConflict, waydeanAdminRestoreSafetySnapshot } from './waydean-admin-publish.ts';

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

Deno.test('allows restore only when the loaded tree and activity are still current', () => {
  assertEquals(waydeanAdminRestoreHasConflict({
    expectedFingerprint: 'tree-v1',
    currentFingerprint: 'tree-v1',
    expectedActivityJson: '[ {"id":1} ]',
    currentActivityJson: '[{"id":1}]',
  }), false);
});

Deno.test('rejects restore when either the tree or activity changed', () => {
  assertEquals(waydeanAdminRestoreHasConflict({
    expectedFingerprint: 'tree-v1',
    currentFingerprint: 'tree-v2',
    expectedActivityJson: '[]',
    currentActivityJson: '[]',
  }), true);
  assertEquals(waydeanAdminRestoreHasConflict({
    expectedFingerprint: 'tree-v1',
    currentFingerprint: 'tree-v1',
    expectedActivityJson: '[{"id":1}]',
    currentActivityJson: '[{"id":1},{"id":2}]',
  }), true);
});

Deno.test('fails closed when the restore base or activity array is missing or malformed', () => {
  assertEquals(waydeanAdminRestoreHasConflict({
    expectedFingerprint: '',
    currentFingerprint: 'tree-v1',
    expectedActivityJson: '[]',
    currentActivityJson: '[]',
  }), true);
  assertEquals(waydeanAdminRestoreHasConflict({
    expectedFingerprint: 'tree-v1',
    currentFingerprint: 'tree-v1',
    expectedActivityJson: '{"id":1}',
    currentActivityJson: '[]',
  }), true);
});

Deno.test('uses the current live tree and activity as the pre-restore safety snapshot', () => {
  assertEquals(waydeanAdminRestoreSafetySnapshot({
    currentTreeJson: '{"id":"live"}',
    currentActivityJson: '[{"type":"live-change"}]',
  }), {
    treeJson: '{"id":"live"}',
    activityJson: '[{"type":"live-change"}]',
  });
});
