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
      bio: String(node.bio ?? ''),
      teip: String(node.teip ?? '').trim().slice(0, 80),
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

/** Keep a person's name on one line by growing its card when needed. */
export function getCardWidthForName(name, {
  baseWidth,
  fixedWidth,
  safety = 0,
  measureText
} = {}) {
  const minimum = Number(baseWidth);
  if (!Number.isFinite(minimum) || minimum < 0) {
    throw new TypeError('A non-negative base card width is required');
  }
  if (typeof measureText !== 'function') throw new TypeError('A text measurement function is required');

  const label = String(name ?? '').trim();
  if (!label) return Math.ceil(minimum);
  const measuredWidth = Number(measureText(label));
  const fixed = Number(fixedWidth) || 0;
  const extra = Number(safety) || 0;
  if (!Number.isFinite(measuredWidth) || measuredWidth < 0) {
    throw new TypeError('Text measurement must return a non-negative number');
  }

  return Math.max(Math.ceil(minimum), Math.ceil(fixed + measuredWidth + extra));
}
