function normalizeYear(value) {
  if (value == null || value === '') return null;
  const year = Number(value);
  return Number.isFinite(year) ? year : null;
}

/** Flatten the read-only nested `sons` tree without mutating its source. */
export function flattenTree(root) {
  if (!root || typeof root !== 'object' || Array.isArray(root)) {
    throw new TypeError('Tree root must be an object');
  }

  const flat = [];
  const seenIds = new Set();

  function visit(node, parentId, generation) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      throw new TypeError('Each person must be an object');
    }
    const id = String(node.id ?? '').trim();
    if (!id) throw new TypeError('Each person must have an ID');
    if (seenIds.has(id)) throw new TypeError(`Duplicate person ID: ${id}`);
    seenIds.add(id);

    const children = Array.isArray(node.sons) ? node.sons : [];
    const photoKey = node.photo == null || node.photo === false || node.photo === ''
      ? null
      : String(node.photo).trim() || null;
    flat.push({
      id,
      name: String(node.name ?? '').trim() || 'Без имени',
      born: normalizeYear(node.born),
      died: normalizeYear(node.died),
      photoKey,
      hasPhoto: Boolean(photoKey),
      generation,
      parentId,
      childCount: children.length
    });

    children.forEach(child => visit(child, id, generation + 1));
  }

  visit(root, null, 1);
  return flat;
}
