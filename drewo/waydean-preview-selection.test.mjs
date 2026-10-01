import test from 'node:test';
import assert from 'node:assert/strict';
import { includePersonInFilters, fallbackSelectedPersonId } from './waydean-preview-selection.mjs';

test('expands only generation bounds needed to include a selected person', () => {
  const result = includePersonInFilters({ min: 3, max: 5, photosOnly: false }, { generation: 1, hasPhoto: false });

  assert.deepEqual(result, {
    filters: { min: 1, max: 5, photosOnly: false },
    changed: true
  });
});

test('extends the upper generation bound when a search selects a later person', () => {
  const result = includePersonInFilters({ min: 1, max: 1, photosOnly: false }, { generation: 2, hasPhoto: true });

  assert.deepEqual(result, {
    filters: { min: 1, max: 2, photosOnly: false },
    changed: true
  });
});

test('turns off photo-only when the selected person has no photo', () => {
  const result = includePersonInFilters({ min: 1, max: 4, photosOnly: true }, { generation: 3, hasPhoto: false });

  assert.deepEqual(result.filters, { min: 1, max: 4, photosOnly: false });
  assert.equal(result.changed, true);
});

test('keeps filters unchanged when they already include the selected person', () => {
  const filters = { min: 2, max: 4, photosOnly: true };
  const result = includePersonInFilters(filters, { generation: 3, hasPhoto: true });

  assert.deepEqual(result.filters, filters);
  assert.equal(result.changed, false);
});

test('keeps the selected person when visible, otherwise chooses the first visible result', () => {
  const visible = [{ id: 'first' }, { id: 'second' }];

  assert.equal(fallbackSelectedPersonId('second', visible), 'second');
  assert.equal(fallbackSelectedPersonId('hidden', visible), 'first');
  assert.equal(fallbackSelectedPersonId('hidden', []), 'hidden');
});
