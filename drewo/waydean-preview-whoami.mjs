export function whoAmIPersonStorageKey(treeKey) {
  return `waydean-preview:my-person:v1:${treeKey === 'demo' ? 'demo' : 'hoti'}`;
}

export function readWhoAmIPerson(storage, treeKey, validPersonIds) {
  const key = whoAmIPersonStorageKey(treeKey);
  try {
    const personId = storage?.getItem(key);
    if (!personId) return null;
    const validIds = validPersonIds instanceof Set
      ? validPersonIds
      : new Set(Array.isArray(validPersonIds) ? validPersonIds : []);
    if (validIds.has(personId)) return personId;
  } catch {
    return null;
  }
  return null;
}

export function saveWhoAmIPerson(storage, treeKey, personId) {
  if (typeof personId !== 'string' || !personId.trim()) return false;
  try {
    if (!storage) return false;
    storage.setItem(whoAmIPersonStorageKey(treeKey), personId);
    return true;
  } catch {
    return false;
  }
}

export function clearWhoAmIPerson(storage, treeKey) {
  try {
    if (!storage) return false;
    storage.removeItem(whoAmIPersonStorageKey(treeKey));
    return true;
  } catch {
    return false;
  }
}
