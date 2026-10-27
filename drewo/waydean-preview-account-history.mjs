const activityTitles = Object.freeze({
  add: 'Добавлен человек',
  delete: 'Удалён человек',
  rename: 'Изменено имя',
  reparent: 'Изменена родственная связь',
  year: 'Изменена дата',
  bio: 'Изменена биография',
  photo: 'Добавлено или изменено фото',
  'photo-remove': 'Удалено фото'
});

export function parseWaydeanActivity(raw) {
  try {
    const parsed = Array.isArray(raw) ? raw : JSON.parse(String(raw ?? '[]'));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(entry => entry && typeof entry === 'object' && !Array.isArray(entry))
      .map(entry => ({ ...entry }))
      .sort((left, right) => {
        const leftAt = Date.parse(String(left.at ?? ''));
        const rightAt = Date.parse(String(right.at ?? ''));
        return (Number.isFinite(rightAt) ? rightAt : 0) - (Number.isFinite(leftAt) ? leftAt : 0);
      });
  } catch {
    return [];
  }
}

export function describeWaydeanActivity(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return 'Изменение дерева';
  const base = activityTitles[String(entry.type ?? '')] || 'Изменение дерева';
  const dateField = entry.type === 'year'
    ? entry.field === 'born' ? 'рождения' : entry.field === 'died' ? 'смерти' : ''
    : '';
  const title = dateField ? `Изменена дата ${dateField}` : base;
  const person = typeof entry.son === 'string' ? entry.son.trim() : '';
  return person ? `${title} · ${person}` : title;
}

export function parseWaydeanBackups(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(item => item && typeof item === 'object' && !Array.isArray(item)
    && typeof item.name === 'string' && /^[A-Za-z0-9._-]{1,180}\.(?:json|html)$/.test(item.name))
    .map(item => ({
      name: item.name,
      label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : item.name,
      savedAt: typeof item.savedAt === 'string' ? item.savedAt : '',
      personCount: Number.isFinite(Number(item.personCount)) ? Math.max(0, Number(item.personCount)) : 0,
      pinned: item.pinned === true
    }))
    .sort((left, right) => Date.parse(right.savedAt || '') - Date.parse(left.savedAt || ''));
}
