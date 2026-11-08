import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWaydeanPublishPayload,
  buildWaydeanPublishActivity
} from './waydean-preview-publish.mjs';
import * as publish from './waydean-preview-publish.mjs';

const baseTree = {
  id: 'root', name: 'Род', born: 1900, died: null, sons: [
    { id: 'person-a', name: 'А', born: 1950, died: null, sons: [] },
    { id: 'person-b', name: 'Б', born: 1960, died: null, sons: [] }
  ]
};

test('builds a server publish snapshot with the known base and no force overwrite', () => {
  const payload = buildWaydeanPublishPayload({
    baseTree,
    draftTree: { ...structuredClone(baseTree), sons: [
      { ...structuredClone(baseTree.sons[0]), name: 'Али' },
      structuredClone(baseTree.sons[1])
    ] },
    baseActivityJson: '[{"type":"add","sonId":"person-a"}]',
    baseFingerprint: 'base-fingerprint',
    at: '2026-10-27T12:00:00.000Z'
  });

  assert.equal(JSON.parse(payload.treeJson).sons[0].name, 'Али');
  assert.equal(payload.baseFingerprint, 'base-fingerprint');
  assert.equal(payload.baseActivityJson, '[{"type":"add","sonId":"person-a"}]');
  assert.equal(JSON.parse(payload.activityJson).length, 2);
  assert.equal(JSON.parse(payload.activityJson)[1].type, 'rename');
  assert.equal('force' in payload, false);
});

test('records additions, removals, reparenting, dates, biography, teip, and photos', () => {
  const before = {
    id: 'root', name: 'Род', sons: [
      { id: 'a', name: 'А', born: 1900, bio: '', teip: '', photo: 'old', sons: [] },
      { id: 'b', name: 'Б', sons: [] },
      { id: 'c', name: 'В', sons: [] }
    ]
  };
  const after = {
    id: 'root', name: 'Род', sons: [
      { id: 'a', name: 'А', born: 1901, bio: 'Текст', teip: 'Тейп', photo: 'new', sons: [
        { id: 'c', name: 'В', sons: [] },
        { id: 'new', name: 'Г', sons: [] }
      ] },
      { id: 'b', name: 'Б', sons: [] }
    ]
  };

  const entries = buildWaydeanPublishActivity(before, after, '2026-10-27T12:00:00.000Z');
  const byType = type => entries.filter(entry => entry.type === type);

  assert.equal(byType('add').length, 1);
  assert.equal(byType('delete').length, 0);
  assert.equal(byType('reparent').length, 1);
  assert.equal(byType('year').length, 1);
  assert.equal(byType('bio').length, 1);
  assert.equal(byType('teip').length, 1);
  assert.equal(byType('photo').length, 1);
  assert.ok(entries.every(entry => entry.at === '2026-10-27T12:00:00.000Z'));
});

test('rejects invalid tree snapshots and malformed base activity', () => {
  assert.throws(() => buildWaydeanPublishPayload({ draftTree: null }), /tree/i);
  const payload = buildWaydeanPublishPayload({
    baseTree,
    draftTree: baseTree,
    baseActivityJson: 'not-json',
    baseFingerprint: 'fp'
  });
  assert.equal(JSON.parse(payload.activityJson).length, 0);
});

test('keeps gender in published JSON and records gender changes and child additions', () => {
  const before = { id: 'root', name: 'Род', sons: [{ id: 'a', name: 'А', gender: 'male', sons: [] }] };
  const after = { id: 'root', name: 'Род', sons: [
    { id: 'a', name: 'А', gender: 'female', sons: [] },
    { id: 'b', name: 'Б', gender: 'female', sons: [] }
  ] };
  const payload = buildWaydeanPublishPayload({ baseTree: before, draftTree: after, at: '2026-11-08T00:00:00.000Z' });
  const published = JSON.parse(payload.treeJson);
  const activity = JSON.parse(payload.activityJson);

  assert.equal(published.sons[0].gender, 'female');
  assert.equal(published.sons[1].gender, 'female');
  assert.ok(activity.some(row => row.type === 'gender' && row.sonId === 'a' && row.gender === 'female'));
  assert.ok(activity.some(row => row.type === 'add' && row.sonId === 'b' && row.gender === 'female'));
  assert.equal(typeof publish.accountPublishButtonState, 'function');
});

test('shows the publish cue only for a saved changed draft with publish access', () => {
  assert.deepEqual(publish.accountPublishButtonState({ editStatus: 'dirty', hasChanges: true, canPublish: true, hasBaseFingerprint: true }), { visible: false, disabled: true });
  assert.deepEqual(publish.accountPublishButtonState({ editStatus: 'saved', hasChanges: true, canPublish: true, hasBaseFingerprint: true }), { visible: true, disabled: false });
  assert.deepEqual(publish.accountPublishButtonState({ editStatus: 'saved', hasChanges: true, canPublish: false, hasBaseFingerprint: true }), { visible: false, disabled: true });
  assert.deepEqual(publish.accountPublishButtonState({ editStatus: 'saved', hasChanges: true, canPublish: true, hasBaseFingerprint: false }), { visible: false, disabled: true });
});
