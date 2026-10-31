function normalizeSearchValue(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("ru")
    .trim();
}

export function searchVideoPeople(people, query, { limit = 30 } = {}) {
  const records = Array.isArray(people) ? people : [];
  const normalizedQuery = normalizeSearchValue(query);
  const matches = records.filter(person => {
    const searchable = normalizeSearchValue([
      person.name,
      person.id,
      person.parentName,
      `поколение ${person.generation}`,
      person.born,
      person.died
    ].filter(value => value != null).join(" "));
    return !normalizedQuery || searchable.includes(normalizedQuery);
  });
  const requestedLimit = Number(limit);
  const safeLimit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(50, Math.trunc(requestedLimit)))
    : 30;

  return { people: matches.slice(0, safeLimit), total: matches.length };
}
