export type HubTreeMetrics = {
  people: number;
  photos: number;
  withYears: number;
  withBio: number;
  maxDepth: number;
};

// Return aggregates only; never forward the family snapshot to the cabinet.
export function hubTreeMetrics(raw: string | undefined): HubTreeMetrics | null {
  if (!raw) return null;
  try {
    const root: unknown = JSON.parse(raw);
    const stats = { people: 0, photos: 0, withYears: 0, withBio: 0, maxDepth: 0 };
    const stack: Array<[unknown, number]> = [[root, 1]];
    while (stack.length) {
      const [value, depth] = stack.pop()!;
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      const node = value as Record<string, unknown>;
      if (typeof node.id !== 'string' || !node.id.trim()) return null;
      stats.people++;
      if (node.photo) stats.photos++;
      if (node.born || node.died) stats.withYears++;
      if (node.bio || node.note) stats.withBio++;
      stats.maxDepth = Math.max(stats.maxDepth, depth);
      if (node.sons != null && !Array.isArray(node.sons)) return null;
      if (Array.isArray(node.sons)) {
        for (const child of node.sons) stack.push([child, depth + 1]);
      }
    }
    return stats;
  } catch {
    return null;
  }
}
