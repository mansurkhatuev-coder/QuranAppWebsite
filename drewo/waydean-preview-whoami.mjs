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

function whoAmIPersonSourceStorageKey(treeKey) {
  return `${whoAmIPersonStorageKey(treeKey)}:source`;
}

export function readWhoAmIPerson(storage, treeKey, validPersonIds) {
  const normalizedKey = normalizedTreeKey(treeKey);
  const key = whoAmIPersonStorageKey(normalizedKey);
  const validIds = validPersonIds instanceof Set
    ? validPersonIds
    : new Set(Array.isArray(validPersonIds) ? validPersonIds : []);
  try {
    const personId = storage?.getItem(key);

    if (FAMILY_TREE_KEYS.has(normalizedKey)) {
      const sourceKey = whoAmIPersonSourceStorageKey(normalizedKey);
      if (storage?.getItem(sourceKey) !== 'explicit-v1') {
        // Discard values written by the old shared-key migration. Their tree of origin is unknown.
        try {
          storage?.removeItem(key);
          storage?.removeItem(sourceKey);
        } catch { /* Ignore unavailable browser storage. */ }
        return null;
      }
    }

    if (!personId) return null;
    return validIds.has(personId) ? personId : null;
  } catch {
    return null;
  }
}

export function saveWhoAmIPerson(storage, treeKey, personId) {
  if (typeof personId !== 'string' || !personId.trim()) return false;
  try {
    if (!storage) return false;
    const normalizedKey = normalizedTreeKey(treeKey);
    if (FAMILY_TREE_KEYS.has(normalizedKey)) {
      storage.setItem(whoAmIPersonSourceStorageKey(normalizedKey), 'explicit-v1');
    }
    storage.setItem(whoAmIPersonStorageKey(normalizedKey), personId);
    return true;
  } catch {
    return false;
  }
}

export function clearWhoAmIPerson(storage, treeKey) {
  try {
    if (!storage) return false;
    const normalizedKey = normalizedTreeKey(treeKey);
    storage.removeItem(whoAmIPersonStorageKey(normalizedKey));
    if (FAMILY_TREE_KEYS.has(normalizedKey)) {
      storage.removeItem(whoAmIPersonSourceStorageKey(normalizedKey));
    }
    return true;
  } catch {
    return false;
  }
}
