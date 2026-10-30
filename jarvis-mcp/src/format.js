const COMMENT_MAX = 160;
const NAME_MAX = 40;

const ANALYTICS_FIELDS = [
  ['active', 'Активные'],
  ['new_installs', 'Новые установки'],
  ['all_time_installs', 'Установки за всё время'],
  ['events', 'События'],
  ['azkar', 'Азкары'],
  ['lessons', 'Уроки'],
  ['app_open', 'Открытия'],
  ['tasbih', 'Тасбих'],
];

export function normalizeDays(value) {
  if (value === undefined || value === null || value === '') return 7;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 7;
  return Math.min(3650, Math.floor(n));
}

export function clampLimit(value) {
  if (value === undefined || value === null || value === '') return 20;
  const n = Number(value);
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(50, Math.floor(n)));
}

export function normalizeMinRating(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}

function finiteNumber(value) {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function periodLabel(days) {
  if (!days) return 'всё время';
  if (days === 1) return '1 день';
  return `${days} дн.`;
}

export function buildAnalyticsSummary(data) {
  const source = data && typeof data === 'object' ? data : {};
  const period = source.period && typeof source.period === 'object' ? source.period : {};
  const summary = {};
  const days = finiteNumber(source.days);
  if (days !== undefined) summary.days = days;

  const values = {
    active: period.active,
    new_installs: period.new_installs,
    all_time_installs: source.all_time_installs,
    events: period.events,
    azkar: period.azkar,
    lessons: period.lessons,
    app_open: period.app_open,
    tasbih: period.tasbih,
  };

  for (const [key] of ANALYTICS_FIELDS) {
    const n = finiteNumber(values[key]);
    if (n !== undefined) summary[key] = n;
  }
  return summary;
}

export function formatAnalytics(data) {
  const summary = buildAnalyticsSummary(data);
  const lines = [`Период: ${periodLabel(summary.days ?? 0)}`];
  for (const [key, label] of ANALYTICS_FIELDS) {
    if (summary[key] === undefined) continue;
    lines.push(`${label}: ${summary[key]}`);
  }
  lines.push(JSON.stringify(summary));
  return lines.join('\n');
}

export function truncateText(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function buildFeedbackItems(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const item = {
      rating: finiteNumber(row?.rating) ?? null,
      comment: truncateText(row?.comment, COMMENT_MAX),
      course_id: row?.course_id ?? null,
      platform: row?.platform ?? null,
      created_at: row?.created_at ?? null,
    };
    const lessonId = typeof row?.lesson_id === 'string' ? row.lesson_id.trim() : '';
    if (lessonId) item.lesson_id = truncateText(lessonId, 80);
    const name = typeof row?.display_name === 'string' ? truncateText(row.display_name, NAME_MAX) : '';
    if (name) item.display_name = name;
    return item;
  });
}

function stars(rating) {
  const n = Math.max(0, Math.min(5, Number(rating) || 0));
  if (!n) return 'без оценки';
  return '★'.repeat(n);
}

export function formatFeedback(rows) {
  const items = buildFeedbackItems(rows);
  if (!items.length) return `Отзывов нет.\n${JSON.stringify({ count: 0, items: [] })}`;
  const lines = [`Отзывы: ${items.length}`];
  items.forEach((item, index) => {
    const bits = [stars(item.rating), item.course_id || 'курс', item.platform || '—', item.created_at || '—'];
    if (item.display_name) bits.push(item.display_name);
    lines.push(`${index + 1}. ${bits.join(' · ')}`);
    lines.push(item.comment ? `   «${item.comment}»` : '   без комментария');
  });
  lines.push(JSON.stringify({ count: items.length, items }));
  return lines.join('\n');
}

export function formatFeedbackStats(stats) {
  const count = finiteNumber(stats?.count) ?? 0;
  const avg = finiteNumber(stats?.avg_rating);
  const summary = {
    count,
    avg_rating: avg ?? null,
  };
  if (stats?.min_rating != null) summary.min_rating = stats.min_rating;
  const filter = summary.min_rating != null ? ` (оценка от ${summary.min_rating})` : '';
  const avgText = avg == null ? '—' : String(avg);
  return `Отзывов${filter}: ${count}\nСредняя оценка: ${avgText}\n${JSON.stringify(summary)}`;
}

export function publicError(error, kind) {
  const message = error instanceof Error ? error.message : String(error?.message ?? error ?? '');
  if (
    kind === 'analytics' &&
    /analytics_dashboard/i.test(message) &&
    /function|schema|does not exist|PGRST202|could not find/i.test(message)
  ) {
    return 'Аналитика недоступна: функция analytics_dashboard не найдена.';
  }
  if (kind === 'feedback' && /academy_course_feedback/i.test(message) && /does not exist|relation/i.test(message)) {
    return 'Отзывы недоступны: таблица academy_course_feedback не найдена.';
  }
  if (/permission denied|row-level security|JWT|not authorized/i.test(message)) {
    return 'Нет доступа. Нужен вход пользователя админки (anon key и email/пароль).';
  }
  const clean = message.replace(/\s+/g, ' ').trim();
  if (!clean) return 'Запрос не удался.';
  return clean.length > 180 ? `${clean.slice(0, 179)}…` : clean;
}
