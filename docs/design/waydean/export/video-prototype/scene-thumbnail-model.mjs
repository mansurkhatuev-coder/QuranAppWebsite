const THUMBNAIL_WIDTH = 260;
const THUMBNAIL_HEIGHT = 74;
const THUMBNAIL_INSET = 8;
const MAX_CONTEXT_NODES = 24;

function treeBounds(nodes) {
  const xs = nodes.map(node => Number(node.x) || 0);
  const ys = nodes.map(node => Number(node.y) || 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  let width = Math.max(260, maxX - minX);
  let height = Math.max(120, maxY - minY);
  const ratio = (THUMBNAIL_WIDTH - THUMBNAIL_INSET * 2) / (THUMBNAIL_HEIGHT - THUMBNAIL_INSET * 2);

  width += Math.max(52, width * 0.08);
  height += Math.max(36, height * 0.12);
  if (width / height < ratio) width = height * ratio;
  else height = width / ratio;

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return {
    left: centerX - width / 2,
    top: centerY - height / 2,
    width,
    height
  };
}

export function buildSceneThumbnail(story, shot, {
  width = THUMBNAIL_WIDTH,
  height = THUMBNAIL_HEIGHT
} = {}) {
  const layout = story?.timeline?.layout;
  const layoutNodes = Array.isArray(layout?.nodes) ? layout.nodes : [];
  const layoutEdges = Array.isArray(layout?.edges) ? layout.edges : [];
  const people = Array.isArray(story?.people) ? story.people : [];
  if (!layoutNodes.length) return { width, height, overview: false, nodes: [], edges: [] };

  const isOverview = shot?.type === "opening" || shot?.type === "finale";
  const nodeById = new Map(layoutNodes.map(node => [node.id, node]));
  const personById = new Map(people.map(person => [person.id, person]));
  const childrenByParent = new Map();
  for (const person of people) {
    if (!person.parent || !nodeById.has(person.parent) || !nodeById.has(person.id)) continue;
    const children = childrenByParent.get(person.parent) ?? [];
    children.push(person.id);
    childrenByParent.set(person.parent, children);
  }

  const focusIds = new Set((shot?.personIds ?? []).filter(id => nodeById.has(id)));
  const emphasisIds = isOverview
    ? new Set(shot?.type === "finale" && story?.selectedPersonId ? [story.selectedPersonId] : [])
    : focusIds;
  const visibleIds = isOverview ? new Set(nodeById.keys()) : new Set(focusIds);
  if (!isOverview) {
    for (const id of focusIds) {
      const person = personById.get(id);
      if (!person?.parent || !nodeById.has(person.parent)) {
        for (const childId of childrenByParent.get(id) ?? []) visibleIds.add(childId);
        continue;
      }
      visibleIds.add(person.parent);
      for (const siblingId of childrenByParent.get(person.parent) ?? []) visibleIds.add(siblingId);
    }
  }

  let selectedNodes = [...visibleIds].map(id => nodeById.get(id)).filter(Boolean);
  if (!isOverview && selectedNodes.length > MAX_CONTEXT_NODES) {
    const focusNodes = [...focusIds].map(id => nodeById.get(id)).filter(Boolean);
    const focusX = focusNodes.reduce((sum, node) => sum + node.x, 0) / Math.max(1, focusNodes.length);
    const focusY = focusNodes.reduce((sum, node) => sum + node.y, 0) / Math.max(1, focusNodes.length);
    selectedNodes = selectedNodes
      .sort((a, b) => Number(focusIds.has(b.id)) - Number(focusIds.has(a.id))
        || Math.hypot(a.x - focusX, (a.y - focusY) * 1.4) - Math.hypot(b.x - focusX, (b.y - focusY) * 1.4))
      .slice(0, MAX_CONTEXT_NODES);
  }

  const bounds = treeBounds(selectedNodes);
  const scale = Math.min(
    (width - THUMBNAIL_INSET * 2) / bounds.width,
    (height - THUMBNAIL_INSET * 2) / bounds.height
  );
  const drawnNodes = selectedNodes.map(node => ({
    id: node.id,
    x: width / 2 + (node.x - (bounds.left + bounds.width / 2)) * scale,
    y: height / 2 + (node.y - (bounds.top + bounds.height / 2)) * scale,
    focus: emphasisIds.has(node.id)
  }));
  const drawnIds = new Set(drawnNodes.map(node => node.id));
  const pathEdges = new Set((story?.timeline?.pathIds ?? []).slice(1).map((id, index) => {
    const previousId = story.timeline.pathIds[index];
    return `${previousId}->${id}`;
  }));
  const activeEdgeKeys = new Set(shot?.activeEdgeKeys ?? []);
  const edges = layoutEdges
    .filter(edge => drawnIds.has(edge.parentId) && drawnIds.has(edge.childId))
    .map(edge => ({
      key: edge.key,
      parentId: edge.parentId,
      childId: edge.childId,
      active: isOverview
        || activeEdgeKeys.has(edge.key)
        || focusIds.has(edge.parentId)
        || focusIds.has(edge.childId)
        || ((shot?.type === "focus" || shot?.type === "finale") && pathEdges.has(edge.key))
    }));

  return { width, height, overview: isOverview, nodes: drawnNodes, edges };
}
