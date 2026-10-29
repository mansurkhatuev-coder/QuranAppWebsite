import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatLifeYears, gregorianYearToHijri } from './waydean-preview-dates.mjs';

const html = readFileSync(new URL('./waydean-preview.html', import.meta.url), 'utf8');
const serviceWorker = readFileSync(new URL('./waydean-preview-sw.js', import.meta.url), 'utf8');

test('Waydean year-only Hijri conversion matches the production formula', () => {
  assert.equal(gregorianYearToHijri(1951), 1371);
  assert.equal(gregorianYearToHijri(1952), 1372);
  assert.equal(gregorianYearToHijri(1999), 1420);
  assert.equal(gregorianYearToHijri(''), null);
  assert.equal(gregorianYearToHijri('not-a-year'), null);
});

test('complete life years use the same Gregorian and Hijri labels as production', () => {
  const person = { born: 1952, died: 2024 };
  assert.equal(formatLifeYears(person, 'g'), '1952 — 2024');
  assert.equal(formatLifeYears(person, 'h'), '1372 — 1446 هـ');
});

test('birth-only and death-only dates preserve production meaning', () => {
  assert.equal(formatLifeYears({ born: 1999 }, 'g'), '1999');
  assert.equal(formatLifeYears({ born: 1999 }, 'h'), '1420 هـ');
  assert.equal(formatLifeYears({ died: 1952 }, 'g'), 'ум. 1952');
  assert.equal(formatLifeYears({ died: 1952 }, 'h'), 'ум. 1372 هـ');
});

test('missing and invalid dates do not become invented years', () => {
  assert.equal(formatLifeYears({}, 'g'), '');
  assert.equal(formatLifeYears({ born: '', died: null }, 'h'), '');
  assert.equal(formatLifeYears({ born: 'unknown', died: 2000 }, 'g'), 'ум. 2000');
});

test('calendar parity module is versioned and included in the offline PWA cache', () => {
  assert.match(html, /waydean-preview\.js\?v=menu-video-lines-20261029-1/);
  assert.match(serviceWorker, /waydean-preview-dates\.mjs\?v=calendar-parity-1/);
});
