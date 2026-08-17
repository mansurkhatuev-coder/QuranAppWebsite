/** Silent merge of two family-tree snapshots by person id. */

export type TreeNode = {
  id: string;
  name?: string;
  sons?: TreeNode[];
  born?: unknown;
  died?: unknown;
  bio?: unknown;
  photo?: unknown;
  [key: string]: unknown;
};

export type MergeFieldStat = {
  id: unknown;
  field: string;
  value?: unknown;
  server?: unknown;
  local?: unknown;
};

export type MergeStats = {
  filled: MergeFieldStat[];
  overridden: MergeFieldStat[];
  addedSons: Array<{ id: unknown; parentId: unknown; name?: unknown }>;
  skippedDeletes: Array<{ id: unknown; field?: string }>;
};

const MERGE_FIELDS = ['name', 'born', 'died', 'bio', 'photo'] as const;

type FieldName = (typeof MERGE_FIELDS)[number];

type IndexedTree = {
  root: TreeNode;
  byId: Map<string, TreeNode>;
  parentOf: Map<string, string>;
};

export function cloneTree<T>(node: T): T {
  return JSON.parse(JSON.stringify(node)) as T;
}

function emptyStats(): MergeStats {
  return { filled: [], overridden: [], addedSons: [], skippedDeletes: [] };
}

function fieldValue(node: TreeNode | undefined, field: FieldName): string {
  const value = node?.[field];
  if (value == null || value === false || value === '') return '';
  return String(value);
}

function indexTree(root: TreeNode): IndexedTree {
  const byId = new Map<string, TreeNode>();
  const parentOf = new Map<string, string>();
  function walk(node: TreeNode, parentId: string | null) {
    const id = String(node.id);
    byId.set(id, node);
    if (parentId != null) parentOf.set(id, String(parentId));
    (node.sons || []).forEach((son) => walk(son, id));
  }
  walk(root, null);
  return { root, byId, parentOf };
}

function stripRuntime(node: TreeNode) {
  delete node.allowAdd;
  for (const key of Object.keys(node)) {
    if (key.charAt(0) === '_') delete node[key];
  }
  (node.sons || []).forEach(stripRuntime);
}

export function serializeTree(root: TreeNode): string {
  const copy = cloneTree(root);
  stripRuntime(copy);
  return JSON.stringify(copy, null, 2);
}

export function parseTreeJson(raw: string): TreeNode {
  const parsed = JSON.parse(raw) as TreeNode;
  if (!parsed || typeof parsed !== 'object' || parsed.id == null) {
    throw new Error('treeJson без корня');
  }
  return parsed;
}

function applyLocalField(
  serverNode: TreeNode,
  localNode: TreeNode,
  field: FieldName,
  stats: MergeStats,
  opts: { onlyIfServerEmpty?: boolean }
) {
  const sv = fieldValue(serverNode, field);
  const lv = fieldValue(localNode, field);
  if (!lv) return;
  if (opts.onlyIfServerEmpty && sv) return;
  if (!sv) {
    serverNode[field] = localNode[field];
    stats.filled.push({ id: serverNode.id, field, value: localNode[field] });
    return;
  }
  if (sv !== lv) {
    const previous = serverNode[field];
    serverNode[field] = localNode[field];
    stats.overridden.push({
      id: serverNode.id,
      field,
      server: previous,
      local: localNode[field],
    });
  }
}

function applyThreeWayField(
  serverNode: TreeNode,
  localNode: TreeNode,
  baseNode: TreeNode | undefined,
  field: FieldName,
  stats: MergeStats
) {
  const sv = fieldValue(serverNode, field);
  const lv = fieldValue(localNode, field);
  const bv = fieldValue(baseNode, field);
  const localChanged = lv !== bv;
  if (!localChanged) return;
  if (!lv) {
    stats.skippedDeletes.push({ id: serverNode.id, field });
    return;
  }
  if (sv === lv) return;
  const previous = serverNode[field];
  serverNode[field] = localNode[field];
  if (!sv) {
    stats.filled.push({ id: serverNode.id, field, value: localNode[field] });
  } else {
    stats.overridden.push({
      id: serverNode.id,
      field,
      server: previous,
      local: localNode[field],
    });
  }
}

function attachLocalAdds(
  result: IndexedTree,
  localRoot: TreeNode,
  baseById: Map<string, TreeNode> | null,
  stats: MergeStats
) {
  function attach(localNode: TreeNode, parentOnResult: TreeNode | null) {
    const id = String(localNode.id);
    const existing = result.byId.get(id);
    if (existing) {
      (localNode.sons || []).forEach((son) => attach(son, existing));
      return;
    }
    if (baseById && baseById.has(id)) {
      // Present in the version this editor loaded, missing on server → server delete. Skip.
      return;
    }
    if (!parentOnResult) return;
    const copy = cloneTree(localNode);
    copy.sons = [];
    if (!Array.isArray(parentOnResult.sons)) parentOnResult.sons = [];
    parentOnResult.sons.push(copy);
    result.byId.set(id, copy);
    result.parentOf.set(id, String(parentOnResult.id));
    stats.addedSons.push({ id, parentId: parentOnResult.id, name: copy.name });
    (localNode.sons || []).forEach((son) => attach(son, copy));
  }
  attach(localRoot, null);
}

/** Two-way fallback when the client did not send the tree it loaded. */
export function mergeConcurrentEdits(
  serverRoot: TreeNode,
  localRoot: TreeNode
): { tree: TreeNode; stats: MergeStats } {
  const server = indexTree(cloneTree(serverRoot));
  const local = indexTree(localRoot);
  const stats = emptyStats();

  local.byId.forEach((localNode, id) => {
    const serverNode = server.byId.get(id);
    if (!serverNode) return;
    applyLocalField(serverNode, localNode, 'born', stats, {});
    applyLocalField(serverNode, localNode, 'died', stats, {});
    applyLocalField(serverNode, localNode, 'bio', stats, {});
    applyLocalField(serverNode, localNode, 'photo', stats, {});
    applyLocalField(serverNode, localNode, 'name', stats, { onlyIfServerEmpty: true });
  });

  attachLocalAdds(server, localRoot, null, stats);
  return { tree: server.root, stats };
}

/**
 * Three-way merge: keep every field the other editor changed, and apply this
 * editor's field changes. Same field, both changed → incoming (local) wins.
 * Deletes and reparents are not applied.
 */
export function mergeThreeWay(
  serverRoot: TreeNode,
  localRoot: TreeNode,
  baseRoot: TreeNode
): { tree: TreeNode; stats: MergeStats } {
  const server = indexTree(cloneTree(serverRoot));
  const local = indexTree(localRoot);
  const base = indexTree(baseRoot);
  const stats = emptyStats();

  local.byId.forEach((localNode, id) => {
    const serverNode = server.byId.get(id);
    if (!serverNode) return;
    const baseNode = base.byId.get(id);
    for (const field of MERGE_FIELDS) {
      applyThreeWayField(serverNode, localNode, baseNode, field, stats);
    }
  });

  attachLocalAdds(server, localRoot, base.byId, stats);
  return { tree: server.root, stats };
}

export function mergeTreesForPublish(
  serverJson: string,
  localJson: string,
  baseJson?: string
): { tree: TreeNode; stats: MergeStats; treeJson: string; usedThreeWay: boolean } {
  const serverRoot = parseTreeJson(serverJson);
  const localRoot = parseTreeJson(localJson);
  let merged: { tree: TreeNode; stats: MergeStats };
  let usedThreeWay = false;
  if (baseJson && baseJson.trim()) {
    try {
      const baseRoot = parseTreeJson(baseJson);
      merged = mergeThreeWay(serverRoot, localRoot, baseRoot);
      usedThreeWay = true;
    } catch {
      merged = mergeConcurrentEdits(serverRoot, localRoot);
    }
  } else {
    merged = mergeConcurrentEdits(serverRoot, localRoot);
  }
  return {
    tree: merged.tree,
    stats: merged.stats,
    treeJson: serializeTree(merged.tree),
    usedThreeWay,
  };
}

function parseActivityList(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function activityKey(entry: unknown): string {
  if (!entry || typeof entry !== 'object') return JSON.stringify(entry);
  const item = entry as Record<string, unknown>;
  return JSON.stringify([
    item.type ?? '',
    item.at ?? '',
    item.sonId ?? '',
    item.personId ?? '',
    item.son ?? '',
    item.father ?? '',
    item.field ?? '',
  ]);
}

export function mergeActivityLogs(serverJson: string, localJson: string): string {
  const server = parseActivityList(serverJson);
  const local = parseActivityList(localJson);
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const entry of [...server, ...local]) {
    const key = activityKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  out.sort((a, b) => {
    const at = String((a as { at?: unknown })?.at ?? '');
    const bt = String((b as { at?: unknown })?.at ?? '');
    if (at < bt) return -1;
    if (at > bt) return 1;
    return 0;
  });
  return JSON.stringify(out, null, 2);
}
