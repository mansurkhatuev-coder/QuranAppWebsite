import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserVideoHandoff, VIDEO_HANDOFF_KEY } from './waydean-preview-video-handoff.mjs';

const records = [
  { id: 'root', name: 'Хоти', generation: 1, parentId: null, born: 1300, died: 1380, bio: 'private note', photoKey: 'private-photo' },
  { id: 'child', name: 'Исмаил', generation: 2, parentId: 'root', born: null, died: null, teip: 'private metadata' }
];

test('browser video handoff contains only render fields and no private profile fields', () => {
  const payload = createBrowserVideoHandoff(records, {
    scopeType: 'branch', selectedPersonId: 'root', title: 'История рода',
    includeDates: true, aspectRatio: '9:16'
  });

  assert.equal(VIDEO_HANDOFF_KEY, 'waydean.video-export.handoff.v1');
  assert.deepEqual(payload, {
    version: 1,
    tree: { people: [
      { id: 'root', name: 'Хоти', generation: 1, parentId: null, born: 1300, died: 1380 },
      { id: 'child', name: 'Исмаил', generation: 2, parentId: 'root', born: null, died: null }
    ] },
    settings: {
      scopeType: 'branch', selectedPersonId: 'root', title: 'История рода',
      includeDates: true, aspectRatio: '9:16'
    }
  });
});

test('browser video handoff normalizes invalid optional settings safely', () => {
  const payload = createBrowserVideoHandoff(records, {
    scopeType: 'unknown', selectedPersonId: 'missing', title: '',
    includeDates: 1, aspectRatio: '4:3'
  });

  assert.deepEqual(payload.settings, {
    scopeType: 'all', selectedPersonId: null, title: 'История рода',
    includeDates: false, aspectRatio: '16:9'
  });
});

test('browser video handoff rejects empty or invalid tree snapshots', () => {
  assert.throws(() => createBrowserVideoHandoff([], {}), /tree/i);
  assert.throws(() => createBrowserVideoHandoff([{ name: 'Без ID' }], {}), /id/i);
});
