export const PAPER_SIZES = Object.freeze({
  A4: Object.freeze({ width: 210, height: 297 }),
  A3: Object.freeze({ width: 297, height: 420 }),
  A2: Object.freeze({ width: 420, height: 594 }),
  A1: Object.freeze({ width: 594, height: 841 }),
  A0: Object.freeze({ width: 841, height: 1189 })
});

const PAPER_ORDER = ["A4", "A3", "A2", "A1", "A0"];
const ORIENTATIONS = ["portrait", "landscape"];

export function getScopedPeople(people, scope = { type: "all" }) {
  if (!Array.isArray(people) || people.length === 0) return [];
  if (scope.type === "all") return [...people];
  if (scope.type === "branch") {
    const root = people.find(person => person.id === scope.branchId);
    if (root) {
      const generationCount = scope.depth === undefined
        ? Number.POSITIVE_INFINITY
        : Math.max(1, Math.floor(Number(scope.depth) || 1));
      const selectedIds = new Set([root.id]);
      let frontier = [root.id];
      for (let level = 0; level < generationCount - 1 && frontier.length; level += 1) {
        const parents = new Set(frontier);
        frontier = people.filter(person => parents.has(person.parent) && !selectedIds.has(person.id)).map(person => person.id);
        frontier.forEach(id => selectedIds.add(id));
      }
      return people.filter(person => selectedIds.has(person.id));
    }

    const branchPeople = people.filter(person => person.branch === scope.branchId);
    if (scope.depth === undefined || branchPeople.length === 0) return branchPeople;
    const firstGeneration = Math.min(...branchPeople.map(person => Number(person.generation) || 1));
    const generationCount = Math.max(1, Math.floor(Number(scope.depth) || 1));
    const lastGeneration = firstGeneration + generationCount - 1;
    return branchPeople.filter(person => Number(person.generation) <= lastGeneration);
  }

  const root = people.find(person => person.id === scope.rootId);
  if (!root) return [];

  const depth = Math.max(1, Math.floor(Number(scope.depth) || 1));
  const selectedIds = new Set([root.id]);
  if (scope.direction === "descendants" || scope.direction === "both") {
    let frontier = [root.id];
    const descendantLevels = scope.direction === "both" ? Math.ceil((depth - 1) / 2) : depth - 1;
    for (let level = 0; level < descendantLevels && frontier.length; level += 1) {
      const parents = new Set(frontier);
      frontier = people.filter(person => parents.has(person.parent) && !selectedIds.has(person.id)).map(person => person.id);
      frontier.forEach(id => selectedIds.add(id));
    }
  }
  if (scope.direction === "ancestors" || scope.direction === "both") {
    let cursor = root;
    const ancestorLevels = scope.direction === "both" ? Math.floor((depth - 1) / 2) : depth - 1;
    for (let level = 0; level < ancestorLevels && cursor?.parent; level += 1) {
      cursor = people.find(person => person.id === cursor.parent);
      if (!cursor) break;
      selectedIds.add(cursor.id);
    }
  }
  return people.filter(person => selectedIds.has(person.id));
}

export function buildPrintLayout(people, options = {}) {
  const paperSize = PAPER_SIZES[options.paperSize] ? options.paperSize : "A4";
  const orientation = options.orientation === "landscape" ? "landscape" : "portrait";
  const page = PAPER_SIZES[paperSize];
  const pageWidthMm = orientation === "landscape" ? page.height : page.width;
  const pageHeightMm = orientation === "landscape" ? page.width : page.height;
  const marginMm = Math.max(6, Number(options.marginMm) || 12);
  const leftMarginMm = Math.max(6, Number(options.leftMarginMm) || marginMm);
  const rightMarginMm = Math.max(6, Number(options.rightMarginMm) || marginMm);
  const topMarginMm = Math.max(6, Number(options.topMarginMm) || marginMm);
  const bottomMarginMm = Math.max(6, Number(options.bottomMarginMm) || marginMm);
  const nodeWidthMm = Math.max(32, Number(options.nodeWidthMm) || 42);
  const nodeHeightMm = Math.max(24, Number(options.nodeHeightMm) || 29);
  const columnGapMm = Math.max(8, Number(options.columnGapMm) || 20);
  const rowGapMm = Math.max(8, Number(options.rowGapMm) || 18);
  const contentWidthMm = Math.max(nodeWidthMm, pageWidthMm - leftMarginMm - rightMarginMm);
  const contentHeightMm = Math.max(nodeHeightMm, pageHeightMm - topMarginMm - bottomMarginMm);
  const columnPitch = nodeWidthMm + columnGapMm;
  const rowPitch = nodeHeightMm + rowGapMm;
  let columnsPerPage = Math.max(1, Math.floor((contentWidthMm + columnGapMm) / columnPitch));
  const rowsPerPage = Math.max(1, Math.floor((contentHeightMm + rowGapMm) / rowPitch));

  if (!Array.isArray(people) || people.length === 0) {
    return {
      paperSize, orientation, pageWidthMm, pageHeightMm, marginMm,
      leftMarginMm, rightMarginMm, topMarginMm, bottomMarginMm,
      contentWidthMm, contentHeightMm, pageCountX: 0, pageCountY: 0, pageCount: 0,
      pages: [], placements: [], generationCount: 0, personCount: 0
    };
  }

  const personById = new Map(people.map(person => [person.id, person]));
  const childrenByParent = new Map();
  for (const person of people) {
    if (!personById.has(person.parent)) continue;
    const children = childrenByParent.get(person.parent) ?? [];
    children.push(person);
    childrenByParent.set(person.parent, children);
  }

  let nextLeafColumn = 0;
  const columnById = new Map();
  const visited = new Set();
  function assignColumn(person, ancestry = new Set()) {
    if (visited.has(person.id)) return columnById.get(person.id) ?? nextLeafColumn;
    if (ancestry.has(person.id)) {
      const fallbackColumn = nextLeafColumn++;
      columnById.set(person.id, fallbackColumn);
      visited.add(person.id);
      return fallbackColumn;
    }

    const nextAncestry = new Set(ancestry);
    nextAncestry.add(person.id);
    const children = childrenByParent.get(person.id) ?? [];
    if (children.length === 0) {
      const column = nextLeafColumn++;
      columnById.set(person.id, column);
      visited.add(person.id);
      return column;
    }

    const childColumns = children.map(child => assignColumn(child, nextAncestry));
    const column = childColumns.reduce((total, value) => total + value, 0) / childColumns.length;
    columnById.set(person.id, column);
    visited.add(person.id);
    return column;
  }

  const roots = people.filter(person => !personById.has(person.parent));
  for (const root of roots) assignColumn(root);
  for (const person of people) {
    if (!visited.has(person.id)) assignColumn(person);
  }

  const maxCardColumn = (contentWidthMm - nodeWidthMm) / columnPitch;
  const allCardsFitPageWidth = columns => [...columnById.values()].every(column => {
    const pageX = Math.floor(column / columns);
    const columnOnPage = column - pageX * columns;
    return columnOnPage <= maxCardColumn;
  });
  while (columnsPerPage > 1 && !allCardsFitPageWidth(columnsPerPage)) columnsPerPage -= 1;

  const generations = [...new Set(people.map((person, index) => Number.isFinite(Number(person.generation)) ? Number(person.generation) : index + 1))].sort((a, b) => a - b);
  const generationRow = new Map(generations.map((generation, index) => [generation, index]));
  const pageCountX = Math.max(1, Math.ceil(nextLeafColumn / columnsPerPage));
  const pageCountY = Math.max(1, Math.ceil(generations.length / rowsPerPage));
  const pageCount = pageCountX * pageCountY;
  const pages = Array.from({ length: pageCount }, (_, index) => ({
    pageNumber: index + 1,
    pageX: index % pageCountX,
    pageY: Math.floor(index / pageCountX),
    pageCount,
    pageWidthMm,
    pageHeightMm
  }));

  const placements = people.map((person, index) => {
    const generation = Number.isFinite(Number(person.generation)) ? Number(person.generation) : index + 1;
    const column = columnById.get(person.id) ?? index;
    const row = generationRow.get(generation) ?? 0;
    const pageX = Math.floor(column / columnsPerPage);
    const pageY = Math.floor(row / rowsPerPage);
    const pageNumber = pageY * pageCountX + pageX + 1;
    return {
      person,
      generation,
      column,
      row,
      pageX,
      pageY,
      pageNumber,
      xMm: leftMarginMm + column * columnPitch - pageX * columnsPerPage * columnPitch,
      yMm: topMarginMm + row * rowPitch - pageY * rowsPerPage * rowPitch,
      widthMm: nodeWidthMm,
      heightMm: nodeHeightMm
    };
  });

  return {
    paperSize, orientation, pageWidthMm, pageHeightMm, marginMm,
    leftMarginMm, rightMarginMm, topMarginMm, bottomMarginMm,
    contentWidthMm, contentHeightMm, columnsPerPage, rowsPerPage,
    pageCountX, pageCountY, pageCount, pages, placements,
    generationCount: generations.length, personCount: people.length
  };
}

export function recommendPaper(people, options = {}) {
  const candidates = [];
  for (const paperSize of PAPER_ORDER) {
    for (const orientation of ORIENTATIONS) {
      candidates.push({ paperSize, orientation, layout: buildPrintLayout(people, { ...options, paperSize, orientation }) });
    }
  }

  const singleSheet = candidates.find(candidate => candidate.layout.pageCount === 1);
  if (singleSheet) {
    return {
      ...singleSheet,
      reason: `Макет помещается на один лист ${singleSheet.paperSize} ${singleSheet.orientation === "landscape" ? "в альбомной ориентации" : "в книжной ориентации"}.`
    };
  }

  const best = candidates.reduce((chosen, candidate) => {
    if (!chosen || candidate.layout.pageCount < chosen.layout.pageCount) return candidate;
    return chosen;
  }, null);
  if (!best) {
    return { paperSize: "A4", orientation: "portrait", layout: buildPrintLayout([], {}), reason: "Нет людей для построения макета." };
  }
  return {
    ...best,
    reason: `Полное дерево сохранено; для выбранного охвата потребуется ${best.layout.pageCount} листов ${best.paperSize}.`
  };
}
