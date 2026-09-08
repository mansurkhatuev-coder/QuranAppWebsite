export type TreeNodeLike = {
  id?: unknown;
  name?: unknown;
  sons?: TreeNodeLike[];
};

export type PersonRef = {
  id: string;
  name: string;
  fatherName: string | null;
};

export type PersonIndexEntry = {
  name: string;
  fatherName: string | null;
};

/** Walk tree: id → { name, fatherName }. */
export function collectPersonIndex(
  root: TreeNodeLike | null | undefined
): Map<string, PersonIndexEntry> {
  const map = new Map<string, PersonIndexEntry>();
  function walk(node: TreeNodeLike | null | undefined, fatherName: string | null) {
    if (!node || node.id == null) return;
    const id = String(node.id);
    const name = String(node.name ?? id);
    map.set(id, { name, fatherName });
    const selfName = name;
    (node.sons || []).forEach((s) => walk(s, selfName));
  }
  walk(root, null);
  return map;
}

export function listAddedPeople(
  beforeRoot: TreeNodeLike | null | undefined,
  afterRoot: TreeNodeLike | null | undefined
): PersonRef[] {
  const before = collectPersonIndex(beforeRoot);
  const after = collectPersonIndex(afterRoot);
  const added: PersonRef[] = [];
  after.forEach((entry, id) => {
    if (!before.has(id)) {
      added.push({ id, name: entry.name, fatherName: entry.fatherName });
    }
  });
  return added;
}

export function buildAdditionNotification(
  treeName: string,
  added: PersonRef[],
  baseUrl: string
): { title: string; body: string; url: string } {
  const title = String(treeName || 'Древо');
  const base = String(baseUrl || './');
  if (!added.length) {
    return { title, body: '', url: base };
  }
  if (added.length === 1) {
    const p = added[0];
    const body = p.fatherName
      ? `Добавлен: ${p.name} (отец: ${p.fatherName})`
      : `Добавлен: ${p.name}`;
    const sep = base.includes('?') ? '&' : '?';
    return { title, body, url: `${base}${sep}focus=${encodeURIComponent(p.id)}` };
  }
  const names = added.map((p) => p.name);
  const shown = names.slice(0, 3).join(', ');
  const rest = names.length - 3;
  const body =
    rest > 0
      ? `Добавлено человек: ${added.length} — ${shown} и ещё ${rest}`
      : `Добавлено человек: ${added.length} — ${shown}`;
  return { title, body, url: base };
}
