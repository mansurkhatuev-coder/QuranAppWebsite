export function includePersonInFilters(filters, person) {
  const next = { ...filters };
  next.min = Math.min(next.min, person.generation);
  if (Number.isFinite(next.max)) next.max = Math.max(next.max, person.generation);
  if (next.photosOnly && !person.hasPhoto) next.photosOnly = false;

  return {
    filters: next,
    changed: next.min !== filters.min || next.max !== filters.max || next.photosOnly !== filters.photosOnly
  };
}

export function fallbackSelectedPersonId(selectedId, visiblePeople) {
  if (visiblePeople.some(person => person.id === selectedId)) return selectedId;
  return visiblePeople[0]?.id ?? selectedId;
}
