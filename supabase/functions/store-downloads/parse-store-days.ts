export type StoreDownloadDay = {
  day: string;
  downloads: number;
  updates: number;
};

export type ParseStoreTableResult =
  | { ok: true; rows: StoreDownloadDay[] }
  | { ok: false; reason: string };

const FIRST_TIME_TYPE =
  /first[\s-]*time|перв|install(?!.*(update|обнов))/i;

function detectDelimiter(headerLine: string): string {
  const semi = (headerLine.match(/;/g) || []).length;
  const tab = (headerLine.match(/\t/g) || []).length;
  const comma = (headerLine.match(/,/g) || []).length;
  if (tab >= semi && tab >= comma && tab > 0) return '\t';
  if (semi >= comma && semi > 0) return ';';
  return ',';
}

function splitLine(line: string, delimiter: string): string[] {
  return line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ''));
}

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, '').trim().toLowerCase();
}

function headerKind(value: string): 'date' | 'downloads' | 'updates' | 'type' | 'counts' | 'other' {
  const h = normalizeHeader(value);
  if (!h) return 'other';
  if (/конверси|просмотр|view|conversion/.test(h)) return 'other';
  // RuStore: "Период" / "timePeriod" — monthly buckets, not a calendar "date" label.
  if (/^timeperiod$|^time[_\s-]*period$|^period$/.test(h)) return 'date';
  if (/период/.test(h) && !/конверси|просмотр|view/.test(h)) return 'date';
  if (/^(date|дата|day|день)$/i.test(h) || /(^| )(date|дата)($| )/.test(h) || /дата начала/.test(h)) return 'date';
  if (/download type|тип.*скач|тип.*загруз/.test(h) || h === 'type') return 'type';
  if (/обнов|update/.test(h)) return 'updates';
  if (/^всего$|^total$|^итого$/.test(h)) return 'downloads';
  if (/установ|install|скач|download|загруз/.test(h)) return 'downloads';
  if (/^counts?$/.test(h) || h === 'количество' || /^кол-?во/.test(h)) return 'counts';
  return 'other';
}

function parseCount(raw: string): number {
  const cleaned = raw.replace(/[\s\u00a0]/g, '').replace(',', '.');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

function lastDayOfMonth(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${last.getUTCFullYear()}-${pad(last.getUTCMonth() + 1)}-${pad(last.getUTCDate())}`;
}

function parseDay(raw: string): string | null {
  const value = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const yearMonth = /^(\d{4})-(\d{2})$/.exec(value);
  if (yearMonth) return lastDayOfMonth(Number(yearMonth[1]), Number(yearMonth[2]));
  // RuStore monthly export: 05.2026 / 05-2026 / 2026.05
  const monthYear = /^(\d{1,2})[./-](\d{4})$/.exec(value);
  if (monthYear) {
    const month = Number(monthYear[1]);
    const year = Number(monthYear[2]);
    if (month >= 1 && month <= 12) return lastDayOfMonth(year, month);
  }
  const yearMonthDot = /^(\d{4})[./](\d{1,2})$/.exec(value);
  if (yearMonthDot) {
    const year = Number(yearMonthDot[1]);
    const month = Number(yearMonthDot[2]);
    if (month >= 1 && month <= 12) return lastDayOfMonth(year, month);
  }
  const dotted = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(value);
  if (dotted) {
    const day = dotted[1].padStart(2, '0');
    const month = dotted[2].padStart(2, '0');
    return `${dotted[3]}-${month}-${day}`;
  }
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (us) {
    const month = us[1].padStart(2, '0');
    const day = us[2].padStart(2, '0');
    return `${us[3]}-${month}-${day}`;
  }
  return null;
}

function isFirstTimeType(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  if (/re-?download|update|обнов/i.test(v) && !FIRST_TIME_TYPE.test(v)) return false;
  if (FIRST_TIME_TYPE.test(v)) return true;
  return !/re-?download|redownload/i.test(v);
}

function findHeader(lines: string[]): { index: number; delimiter: string } | null {
  const max = Math.min(lines.length, 25);
  for (let i = 0; i < max; i++) {
    const delimiter = detectDelimiter(lines[i]);
    if (!delimiter || (delimiter === ',' && !(lines[i].includes(',') || lines[i].includes(';') || lines[i].includes('\t')))) {
      continue;
    }
    const kinds = splitLine(lines[i], delimiter).map(headerKind);
    if (kinds.includes('date') && (kinds.includes('downloads') || kinds.includes('counts'))) {
      return { index: i, delimiter };
    }
  }
  return null;
}

export function formatParseError(reason: string): string {
  if (reason === 'empty') return 'Файл пустой.';
  if (reason === 'no-rows') return 'В файле нет строк с цифрами.';
  if (reason === 'no-date-column') {
    return 'Нет колонки с датой/периодом. Нужен CSV статистики (Период / timePeriod / Дата), не отзывы.';
  }
  if (reason === 'no-downloads-column') return 'Нет колонки установок / скачиваний.';
  if (reason === 'no-valid-rows') {
    return 'Даты/периоды в файле не разобрал. Подойдёт помесячный CSV RuStore (05.2026) или дневной.';
  }
  return `CSV: ${reason}`;
}

export function parseStoreDownloadTable(input: string): ParseStoreTableResult {
  const text = String(input || '').replace(/^\uFEFF/, '').trim();
  if (!text) return { ok: false, reason: 'empty' };

  const lines = text.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.trim());
  if (lines.length < 2) return { ok: false, reason: 'no-rows' };

  const header = findHeader(lines);
  if (!header) return { ok: false, reason: 'no-date-column' };

  const delimiter = header.delimiter;
  const headers = splitLine(lines[header.index], delimiter).map(normalizeHeader);
  const kinds = headers.map(headerKind);
  const dateIdx = kinds.indexOf('date');
  if (dateIdx < 0) return { ok: false, reason: 'no-date-column' };

  const typeIdx = kinds.indexOf('type');
  const updatesIdx = kinds.indexOf('updates');
  let downloadsIdx = kinds.indexOf('downloads');
  const countsIdx = kinds.indexOf('counts');
  if (downloadsIdx < 0 && countsIdx >= 0) downloadsIdx = countsIdx;
  if (downloadsIdx < 0) return { ok: false, reason: 'no-downloads-column' };

  const merged = new Map<string, StoreDownloadDay>();
  for (const line of lines.slice(header.index + 1)) {
    const cells = splitLine(line, delimiter);
    const rawDay = cells[dateIdx] || '';
    if (/^(всего|total|итого)$/i.test(rawDay.trim())) continue;
    const day = parseDay(rawDay);
    if (!day) continue;
    if (typeIdx >= 0 && !isFirstTimeType(cells[typeIdx] || '')) continue;
    const downloads = parseCount(cells[downloadsIdx] || '0');
    const updates = updatesIdx >= 0 ? parseCount(cells[updatesIdx] || '0') : 0;
    const prev = merged.get(day) || { day, downloads: 0, updates: 0 };
    prev.downloads += downloads;
    prev.updates += updates;
    merged.set(day, prev);
  }

  const rows = [...merged.values()].sort((a, b) => a.day.localeCompare(b.day));
  if (!rows.length) return { ok: false, reason: 'no-valid-rows' };
  return { ok: true, rows };
}

export function sumDownloadsInRange(
  rows: StoreDownloadDay[],
  withinDays: number,
  nowMs = Date.now()
): number {
  if (!withinDays) {
    return rows.reduce((sum, row) => sum + row.downloads, 0);
  }
  const cutoff = nowMs - withinDays * 24 * 60 * 60 * 1000;
  return rows.reduce((sum, row) => {
    const t = Date.parse(`${row.day}T00:00:00.000Z`);
    if (!Number.isFinite(t) || t < cutoff) return sum;
    return sum + row.downloads;
  }, 0);
}
