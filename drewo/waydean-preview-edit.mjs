export function cloneTree(tree) {
  return structuredClone(tree);
}

function findPerson(tree, id) {
  if (tree.id === id) return tree;
  for (const child of tree.sons || []) {
    const found = findPerson(child, id);
    if (found) return found;
  }
  return null;
}

function findParent(tree, id) {
  if ((tree.sons || []).some(child => child.id === id)) return tree;
  for (const child of tree.sons || []) {
    const found = findParent(child, id);
    if (found) return found;
  }
  return null;
}

function allIds(tree, result = new Set()) {
  result.add(tree.id);
  for (const child of tree.sons || []) allIds(child, result);
  return result;
}

function normalizeLifeYear(value) {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const text = String(value);
  if (!/^\d+$/.test(text)) throw new Error('Year must use decimal digits only');
  const year = Number(text);
  if (!Number.isSafeInteger(year)) throw new Error('Year must use decimal digits only');
  return year;
}

export function updatePerson(tree, id, fields) {
  const person = findPerson(tree, id);
  if (!person) throw new Error('Person not found');
  const next = { ...person };
  for (const key of ['name', 'born', 'died', 'bio']) {
    if (Object.hasOwn(fields, key)) next[key] = key === 'name' ? String(fields[key] || '').trim() : fields[key];
  }
  if (!next.name) throw new Error('Name is required');
  for (const key of ['born', 'died']) if (Object.hasOwn(fields, key)) next[key] = normalizeLifeYear(next[key]);
  if (next.born != null && next.died != null && next.born > next.died) throw new Error('Birth year must not be later than death year');
  Object.assign(person, next);
  return person;
}

export function addChild(tree, parentId, fields) {
  const parent = findPerson(tree, parentId);
  if (!parent) throw new Error('Parent not found');
  const id = String(fields.id || '').trim();
  if (!id || allIds(tree).has(id)) throw new Error('Child ID must be unique');
  const child = { id, name: String(fields.name || '').trim(), born: fields.born ?? null, died: fields.died ?? null, bio: String(fields.bio || ''), sons: [] };
  if (!child.name) throw new Error('Name is required');
  for (const key of ['born', 'died']) child[key] = normalizeLifeYear(child[key]);
  if (child.born != null && child.died != null && child.born > child.died) throw new Error('Birth year must not be later than death year');
  parent.sons ||= [];
  parent.sons.push(child);
  return child;
}

export function reparentPerson(tree, personId, newParentId) {
  if (personId === tree.id) throw new Error('Root cannot be reparented');
  const person = findPerson(tree, personId);
  const parent = findPerson(tree, newParentId);
  if (!person || !parent) throw new Error('Person or parent not found');
  if (findPerson(person, newParentId)) throw new Error('Reparenting would create a cycle');
  const oldParent = findParent(tree, personId);
  oldParent.sons = oldParent.sons.filter(child => child.id !== personId);
  parent.sons ||= [];
  parent.sons.push(person);
  return person;
}

export function deleteLeaf(tree, personId) {
  if (personId === tree.id) throw new Error('Root cannot be deleted');
  const person = findPerson(tree, personId);
  if (!person) throw new Error('Person not found');
  if ((person.sons || []).length) throw new Error('Only a leaf person can be deleted');
  const parent = findParent(tree, personId);
  parent.sons = parent.sons.filter(child => child.id !== personId);
  return person;
}

export function isDirty(original, draft) {
  const comparable = value => {
    if (Array.isArray(value)) return value.map(comparable);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().flatMap(key => {
      const field = value[key];
      if (key === 'bio' && field === '') return [];
      if ((key === 'born' || key === 'died') && (field == null || field === '')) return [];
      return [[key, comparable(field)]];
    }));
  };
  return JSON.stringify(comparable(original)) !== JSON.stringify(comparable(draft));
}

export function mockSave({ shouldFail = false } = {}) {
  return new Promise((resolve, reject) => setTimeout(() => {
    if (shouldFail) reject(new Error('Simulated recoverable save error'));
    else resolve({ saved: true, inMemoryOnly: true });
  }, 250));
}
