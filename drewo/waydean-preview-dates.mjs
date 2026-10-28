function normalizeYear(value) {
  if (value == null || value === '') return null;
  const year = Number(value);
  return Number.isFinite(year) ? year : null;
}

/** Matches the legacy tree's approximate year-only Gregorian-to-Hijri rule. */
export function gregorianYearToHijri(value) {
  const year = normalizeYear(value);
  if (year == null) return null;
  return Math.max(1, Math.round((year - 622) * 33 / 32));
}

/** Format partial life years like the production tree; no month or day is inferred. */
export function formatLifeYears(person, calendar = 'g') {
  const born = normalizeYear(person?.born);
  const died = normalizeYear(person?.died);
  const hijri = calendar === 'h';
  const mapYear = year => year == null ? null : hijri ? gregorianYearToHijri(year) : year;
  const birthYear = mapYear(born);
  const deathYear = mapYear(died);
  const suffix = hijri ? ' هـ' : '';

  if (birthYear != null && deathYear != null) return `${birthYear} — ${deathYear}${suffix}`;
  if (birthYear != null) return `${birthYear}${suffix}`;
  if (deathYear != null) return `ум. ${deathYear}${suffix}`;
  return '';
}
