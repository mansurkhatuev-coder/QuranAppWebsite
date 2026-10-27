import { flattenTree } from './waydean-preview-model.mjs';

function cleanTree(root) {
  if (!root || typeof root !== 'object' || Array.isArray(root)) {
    throw new TypeError('A valid tree root is required');
  }
  const cleanNode = node => Object.fromEntries(Object.entries(node)
    .filter(([key]) => key !== 'allowAdd' && !key.startsWith('_') && key !== 'sons')
    .map(([key, value]) => [key, value])
    .concat([['sons', (Array.isArray(node.sons) ? node.sons : []).map(cleanNode)]]));
  const copy = cleanNode(root);
  flattenTree(copy);
  return copy;
}

function stableTreeJson(tree) {
  return JSON.stringify(cleanTree(tree));
}

function safeActivity(raw) {
  try {
    const value = JSON.parse(String(raw ?? '[]'));
    return Array.isArray(value) ? value.filter(row => row && typeof row === 'object' && !Array.isArray(row)) : [];
  } catch {
    return [];
  }
}

function peopleById(root) {
  return new Map(flattenTree(root).map(person => [person.id, person]));
}

export function buildWaydeanPublishActivity(before, after, at = new Date().toISOString()) {
  const previous = peopleById(before);
  const next = peopleById(after);
  const events = [];
  const add = (entry) => events.push({ ...entry, at });

  for (const person of next.values()) {
    const old = previous.get(person.id);
    if (!old) {
      const father = person.parentId ? next.get(person.parentId) : null;
      add({ type: 'add', son: person.name, father: father?.name || '', sonId: person.id, fatherId: person.parentId });
      continue;
    }
    if (old.parentId !== person.parentId) {
      const father = person.parentId ? next.get(person.parentId) : null;
      const previousFather = old.parentId ? previous.get(old.parentId) : null;
      add({
        type: 'reparent', son: person.name, father: father?.name || '', sonId: person.id,
        fatherId: person.parentId, fromId: old.parentId, fromName: previousFather?.name || ''
      });
    }
    if (old.name !== person.name) add({ type: 'rename', son: person.name, father: old.name, sonId: person.id });
    if (old.born !== person.born) add({ type: 'year', field: 'born', son: person.name, sonId: person.id });
    if (old.died !== person.died) add({ type: 'year', field: 'died', son: person.name, sonId: person.id });
    if (old.bio !== person.bio) add({ type: 'bio', son: person.name, sonId: person.id });
    if (old.teip !== person.teip) add({ type: 'teip', son: person.name, sonId: person.id });
    if (old.photoKey !== person.photoKey) {
      add({ type: person.photoKey ? 'photo' : 'photo-remove', son: person.name, sonId: person.id });
    }
  }

  for (const person of previous.values()) {
    if (!next.has(person.id)) {
      const father = person.parentId ? previous.get(person.parentId) : null;
      add({ type: 'delete', son: person.name, father: father?.name || '', sonId: person.id, fatherId: person.parentId });
    }
  }
  return events;
}

export function buildWaydeanPublishPayload({
  baseTree,
  draftTree,
  baseActivityJson = '[]',
  baseFingerprint = '',
  photos = [],
  photoDeletes = [],
  at = new Date().toISOString()
} = {}) {
  const cleanDraft = cleanTree(draftTree);
  const cleanBase = cleanTree(baseTree);
  const nextEvents = buildWaydeanPublishActivity(cleanBase, cleanDraft, at);
  return {
    treeDir: 'drewo',
    treeJson: JSON.stringify(cleanDraft),
    activityJson: JSON.stringify([...safeActivity(baseActivityJson), ...nextEvents]),
    baseActivityJson: String(baseActivityJson || '[]'),
    baseTreeJson: JSON.stringify(cleanBase),
    baseFingerprint: String(baseFingerprint || '').trim(),
    photos: Array.isArray(photos) ? photos : [],
    photoDeletes: Array.isArray(photoDeletes) ? photoDeletes : []
  };
}
