function route(parent, child, startY, bendY, endY) {
  if (parent.centerX === child.centerX) return `M${parent.centerX} ${startY} V${endY}`;
  return `M${parent.centerX} ${startY} V${bendY} H${child.centerX} V${endY}`;
}

export function connectorPaths(positions, childrenByParent, related, cardHeight) {
  const lines = [];
  for (const [parentId, parent] of positions) {
    const children = (childrenByParent.get(parentId) || [])
      .map(person => ({ id: person.id, point: positions.get(person.id) }))
      .filter(child => child.point);
    if (!children.length) continue;

    const startY = parent.centerY + cardHeight / 2;
    const endY = children[0].point.centerY - cardHeight / 2;
    const bendY = Math.round((startY + endY) / 2);
    const active = child => related && related.has(parentId) && related.has(child.id);
    const allActive = related && children.every(active);
    let d;
    if (children.length === 1) {
      d = route(parent, children[0].point, startY, bendY, endY);
    } else {
      const centers = [parent.centerX, ...children.map(child => child.point.centerX)];
      const minX = Math.min(...centers);
      const maxX = Math.max(...centers);
      const drops = children.map(child => `M${child.point.centerX} ${bendY} V${child.point.centerY - cardHeight / 2}`);
      d = [`M${parent.centerX} ${startY} V${bendY}`, `M${minX} ${bendY} H${maxX}`, ...drops].join(' ');
    }
    lines.push({ d, className: `tree-line${related ? allActive ? ' active' : ' dimmed' : ''}` });

    if (related && !allActive) {
      for (const child of children.filter(active)) {
        lines.push({
          d: route(parent, child.point, startY, bendY, child.point.centerY - cardHeight / 2),
          className: 'tree-line active'
        });
      }
    }
  }
  return lines;
}
