const FAMILY_TREE_KEYS = new Set([
  'drewo-adam',
  'drewo-dada-yurt',
  'drewo-eldarovy',
  'drewo-guzat',
  'drewo-reklama'
]);

function normalizedTreeKey(treeKey) {
  const key = String(treeKey ?? '').trim().toLowerCase();
  return key === 'demo' || key === 'hoti' || FAMILY_TREE_KEYS.has(key) ? key : 'hoti';
}

export function whoAmIPersonStorageKey(treeKey) {
  return `waydean-preview:my-person:v1:${normalizedTreeKey(treeKey)}`;
}

export function readWhoAmIPerson(storage, treeKey, validPersonIds) {
  const normalizedKey = normalizedTreeKey(treeKey);
  const key = whoAmIPersonStorageKey(normalizedKey);
  const validIds = validPersonIds instanceof Set
    ? validPersonIds
    : new Set(Array.isArray(validPersonIds) ? validPersonIds : []);
  try {
    const personId = storage?.getItem(key);
    if (personId != null) {
      if (!personId) return null;
      return validIds.has(personId) ? personId : null;
    }

    // Older family-tree builds stored every non-demo identity under HOTI.
    if (normalizedKey === 'demo' || normalizedKey === 'hoti') return null;
    const legacyId = storage?.getItem('waydean-preview:my-person:v1:hoti');
    if (!legacyId || !validIds.has(legacyId)) return null;
    try { storage?.setItem(key, legacyId); } catch { /* A valid legacy identity still works for this visit. */ }
    return legacyId;
  } catch {
    return null;
  }
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
    const normalizedKey = normalizedTreeKey(treeKey);
    const key = whoAmIPersonStorageKey(normalizedKey);
    if (FAMILY_TREE_KEYS.has(normalizedKey)) {
      // Block migration from the old shared HOTI key after an explicit reset.
      storage.setItem(key, '');
    } else {
      storage.removeItem(key);
    }
    return true;
  } catch {
    return false;
  }
}
