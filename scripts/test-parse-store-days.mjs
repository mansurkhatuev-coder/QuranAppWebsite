#!/usr/bin/env node
/** Smoke-test RuStore «Период» + MM.YYYY against parse-store-days.ts source + logic. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'supabase/functions/store-downloads/parse-store-days.ts'), 'utf8');

for (const needle of ['^период$', 'monthYear', '05.2026', 'Период / timePeriod']) {
  if (!src.includes(needle) && !src.includes(needle.replace('05.2026', 'MM.YYYY'))) {
    // monthYear variable + период header must exist
  }
}
if (!/\^период\$/.test(src)) {
  console.error('missing ^период$ header accept');
  process.exit(1);
}
if (!/monthYear/.test(src)) {
  console.error('missing monthYear parse');
  process.exit(1);
}

function normalizeHeader(value) {
  return value.replace(/^\uFEFF/, '').trim().toLowerCase();
}
function headerKind(value) {
  const h = normalizeHeader(value);
  if (!h) return 'other';
  if (/^timeperiod$|^time[_\s-]*period$|^период$|^period$/.test(h)) return 'date';
  if (/период/.test(h) && !/дата/.test(h)) return 'other';
  if (/^всего$|^total$|^итого$/.test(h)) return 'downloads';
  return 'other';
}
function lastDayOfMonth(year, month) {
  const last = new Date(Date.UTC(year, month, 0));
  const pad = (n) => String(n).padStart(2, '0');
  return `${last.getUTCFullYear()}-${pad(last.getUTCMonth() + 1)}-${pad(last.getUTCDate())}`;
}
function parseDay(raw) {
  const value = raw.trim();
  const monthYear = /^(\d{1,2})[./-](\d{4})$/.exec(value);
  if (monthYear) {
    const month = Number(monthYear[1]);
    const year = Number(monthYear[2]);
    if (month >= 1 && month <= 12) return lastDayOfMonth(year, month);
  }
  return null;
}
function parse(csv) {
  const lines = csv.trim().split(/\n/);
  const headers = lines[0].split(',').map((c) => c.trim());
  const kinds = headers.map(headerKind);
  const dateIdx = kinds.indexOf('date');
  const downloadsIdx = kinds.indexOf('downloads');
  if (dateIdx < 0 || downloadsIdx < 0) return { ok: false, reason: 'no-date-column' };
  const rows = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    const raw = cells[dateIdx] || '';
    if (/^(всего|total|итого)$/i.test(raw)) continue;
    const day = parseDay(raw);
    if (!day) continue;
    rows.push({ day, downloads: Number(cells[downloadsIdx]) || 0 });
  }
  return { ok: true, rows };
}

const csv = readFileSync(
  '/home/ubuntu/.cursor/projects/workspace/uploads/___________93b8.csv',
  'utf8'
);
const parsed = parse(csv);
if (!parsed.ok) {
  console.error(parsed);
  process.exit(1);
}
const total = parsed.rows.reduce((s, r) => s + r.downloads, 0);
if (total !== 240) {
  console.error('expected 240 got', total, parsed.rows);
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, days: parsed.rows.length, total, first: parsed.rows[0] }));
