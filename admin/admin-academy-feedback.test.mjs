import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function loadFeedbackModule() {
  const source = await readFile(new URL('./admin-academy-feedback.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window }, { filename: 'admin-academy-feedback.js' });
  return window.AdminAcademyFeedback;
}

test('feedback summary labels capped rows and scopes the average to the visible sample', async () => {
  const feedback = await loadFeedbackModule();
  const rows = [
    { rating: 5, comment: 'Хорошо' },
    { rating: 3, comment: '' },
  ];

  const summary = feedback.buildStatsText(rows, { loadedCount: 200, sourceTotal: 250, limit: 200 });

  assert.match(summary, /последние 200 из 250/i);
  assert.match(summary, /средняя по выборке 4\.0/);
  assert.match(summary, /с комментарием: 1/);
});

test('feedback summary does not imply an all-time count when exact coverage is unavailable', async () => {
  const feedback = await loadFeedbackModule();
  const rows = [{ rating: 5, comment: '' }];

  const summary = feedback.buildStatsText(rows, { loadedCount: 200, sourceTotal: null, limit: 200 });

  assert.match(summary, /последние 200/i);
  assert.match(summary, /итог неизвестен/i);
});
