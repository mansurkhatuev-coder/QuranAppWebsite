export const CINEMATIC_FPS = 30;
export const SCENE_TRANSITION_FRAMES = 36;
export const CHAPTER_COPY_START_RATIO = 0.68;
export const TREE_WIDTH = 1600;
export const TREE_HEIGHT = 900;
export const TREE_CARD_WIDTH = 176;
export const TREE_CARD_HEIGHT = 90;

const SHOT_SECONDS = {
  opening: 3.2,
  origin: 2.8,
  generation: 2.25,
  branching: 2,
  focus: 3,
  finale: 5
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
function getPersonCardWidth(person, minimumWidth) {
  const name = String(person?.name || "Без имени").trim();
  const longestWord = Math.max(1, ...name.split(/\s+/).map(word => Array.from(word).length));
  const fontSize = name.length > 18 ? 13 : 17;
  const estimatedNameWidth = longestWord * fontSize * 0.68;
  const born = person?.born == null ? "" : String(person.born);
  const died = person?.died == null ? "" : String(person.died);
  const dateLabel = born && died ? `${born} — ${died}` : born ? `род. ${born}` : died ? `ум. ${died}` : "";
  const estimatedDateWidth = dateLabel.length * 6.2;
  return Math.max(minimumWidth, Math.ceil(75 + Math.max(estimatedNameWidth, estimatedDateWidth) + 14));
}

export function easeCinematic(progress) {
  const value = clamp(Number(progress) || 0, 0, 1);
  return value < 0.5
    ? 4 * value * value * value
    : 1 - ((-2 * value + 2) ** 3) / 2;
}

export function layoutFamilyTree(people, {
  width = TREE_WIDTH,
  height = TREE_HEIGHT,
  cardWidth = TREE_CARD_WIDTH,
  cardHeight = TREE_CARD_HEIGHT
} = {}) {
  const records = Array.isArray(people) ? people : [];

  const rows = new Map();
  const peopleById = new Map(records.map(person => [person.id, person]));
  const childrenByParent = new Map();
  for (const person of records) {
    const generation = Number(person.generation ?? 0);
    const row = rows.get(generation) ?? [];
    row.push(person);
    rows.set(generation, row);
    if (person.parent && peopleById.has(person.parent)) {
      const children = childrenByParent.get(person.parent) ?? [];
      children.push(person);
      childrenByParent.set(person.parent, children);
    }
  }
  const generations = [...rows.keys()].sort((a, b) => a - b);
  const columnGap = Math.max(48, Math.round(cardWidth * 0.27));
  const rowGap = Math.max(48, Math.round(cardHeight * 0.53));
  const padY = cardHeight / 2 + 32;
  const rowStep = cardHeight + rowGap;
  const cardWidths = new Map(records.map(person => [person.id, getPersonCardWidth(person, cardWidth)]));
  const widestRow = Math.max(0, ...[...rows.values()].map(row =>
    row.reduce((sum, person) => sum + cardWidths.get(person.id), 0) + Math.max(0, row.length - 1) * columnGap
  ));
  const layoutWidth = Math.max(width, widestRow + 108);
  const layoutHeight = Math.max(height, padY * 2 + Math.max(0, generations.length - 1) * rowStep);
  const generationRow = new Map(generations.map((generation, index) => [generation, index]));
  const preliminaryX = new Map();
  const visiting = new Set();
  let nextLeaf = 0;
  const positionSubtree = person => {
    if (preliminaryX.has(person.id)) return preliminaryX.get(person.id);
    if (visiting.has(person.id)) return nextLeaf++;
    visiting.add(person.id);
    const children = childrenByParent.get(person.id) ?? [];
    let x;
    if (!children.length) {
      x = nextLeaf++;
    } else {
      const childPositions = children.map(positionSubtree);
      x = (childPositions[0] + childPositions.at(-1)) / 2;
    }
    visiting.delete(person.id);
    preliminaryX.set(person.id, x);
    return x;
  };
  for (const person of records) {
    if (!person.parent || !peopleById.has(person.parent)) positionSubtree(person);
  }
  for (const person of records) positionSubtree(person);

  const xById = new Map();
  for (const row of rows.values()) {
    const orderedRow = [...row].sort((a, b) => preliminaryX.get(a.id) - preliminaryX.get(b.id));
    const rowWidth = orderedRow.reduce((sum, person) => sum + cardWidths.get(person.id), 0)
      + Math.max(0, orderedRow.length - 1) * columnGap;
    const startX = (layoutWidth - rowWidth) / 2;
    let cursorX = startX;
    orderedRow.forEach(person => {
      const personWidth = cardWidths.get(person.id);
      xById.set(person.id, cursorX + personWidth / 2);
      cursorX += personWidth + columnGap;
    });
  }

  const nodes = records.map(person => {
    const generation = Number(person.generation ?? 0);
    return {
      id: person.id,
      generation,
      x: xById.get(person.id) ?? layoutWidth / 2,
      y: generations.length <= 1
        ? layoutHeight / 2
        : padY + (generationRow.get(generation) ?? 0) * rowStep,
      width: cardWidths.get(person.id),
      height: cardHeight
    };
  });
  const ids = new Set(nodes.map(node => node.id));
  const edges = records
    .filter(person => person.parent && ids.has(person.parent))
    .map(person => ({
      key: `${person.parent}->${person.id}`,
      parentId: person.parent,
      childId: person.id
    }));

  return { width: layoutWidth, height: layoutHeight, cardWidth, cardHeight, nodes, edges };
}

function boundsForNodes(layout, ids) {
  const idSet = new Set(ids);
  const nodes = layout.nodes.filter(node => idSet.has(node.id));
  if (!nodes.length) {
    return { left: 0, top: 0, right: layout.width, bottom: layout.height };
  }
  return {
    left: Math.min(...nodes.map(node => node.x - node.width / 2)),
    top: Math.min(...nodes.map(node => node.y - node.height / 2)),
    right: Math.max(...nodes.map(node => node.x + node.width / 2)),
    bottom: Math.max(...nodes.map(node => node.y + node.height / 2))
  };
}

function cameraForBounds(bounds, shotType, focusZoomLimit = 4.8) {
  if (shotType === "opening" || shotType === "finale") {
    const boundsWidth = Math.max(1, bounds.right - bounds.left);
    const boundsHeight = Math.max(1, bounds.bottom - bounds.top);
    const zoom = Math.min(1, TREE_WIDTH / boundsWidth, TREE_HEIGHT / boundsHeight);
    return { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2, zoom };
  }
  const padding = shotType === "focus" ? 40 : 124;
  const boxWidth = Math.max(1, bounds.right - bounds.left + padding * 2);
  const boxHeight = Math.max(1, bounds.bottom - bounds.top + padding * 2);
  const zoomLimit = shotType === "focus" ? Math.max(1, Number(focusZoomLimit) || 4.8) : 1.62;
  const minimumZoom = shotType === "branching" ? 0.18 : 1;
  const zoom = clamp(Math.min(TREE_WIDTH / boxWidth, TREE_HEIGHT / boxHeight, zoomLimit), minimumZoom, zoomLimit);
  return {
    x: (bounds.left + bounds.right) / 2,
    y: (bounds.top + bounds.bottom) / 2,
    zoom
  };
}

function selectedPath(people, selectedPersonId) {
  const peopleById = new Map(people.map(person => [person.id, person]));
  const path = [];
  const visited = new Set();
  let person = peopleById.get(selectedPersonId);
  while (person && !visited.has(person.id)) {
    visited.add(person.id);
    path.unshift(person.id);
    person = person.parent ? peopleById.get(person.parent) : null;
  }
  return path;
}

function sceneLineProgress(scene, peopleById, rootGeneration, pathLength, previous) {
  if (scene.type === "origin" || scene.type === "opening") return previous;
  if (scene.type === "generation") {
    const maxGeneration = Math.max(...scene.personIds.map(id => Number(peopleById.get(id)?.generation ?? rootGeneration)));
    return clamp(maxGeneration - rootGeneration, 0, pathLength);
  }
  if (scene.type === "focus" || scene.type === "finale") return pathLength;
  return previous;
}

export function buildCinematicTimeline(people, scenes, {
  fps = CINEMATIC_FPS,
  focusDurationSeconds = SHOT_SECONDS.focus,
  focusZoomLimit = 4.8,
  generationDurationSeconds = SHOT_SECONDS.generation,
  branchingDurationSeconds = SHOT_SECONDS.branching
} = {}) {
  const records = Array.isArray(people) ? people : [];
  const storyScenes = Array.isArray(scenes) ? scenes : [];
  const layout = layoutFamilyTree(records);
  const peopleById = new Map(records.map(person => [person.id, person]));
  const focus = storyScenes.find(scene => scene.type === "focus");
  const selectedPersonId = focus?.personIds?.[0] ?? storyScenes.at(-1)?.personIds?.at(-1);
  const pathIds = selectedPath(records, selectedPersonId);
  const rootGeneration = records.length
    ? Math.min(...records.map(person => Number(person.generation ?? 0)))
    : 0;
  const pathLength = Math.max(0, pathIds.length - 1);
  const fullIds = records.map(person => person.id);
  let previousCamera = cameraForBounds(boundsForNodes(layout, fullIds), "opening");
  let previousLineProgress = 0;
  let previousTreeOffsetY = -100;
  let startFrame = 0;

  const shots = storyScenes.map(scene => {
    const ids = scene.type === "opening" || scene.type === "finale"
      ? fullIds
      : [...(scene.personIds ?? [])];
    const bounds = boundsForNodes(layout, ids);
    const cameraTo = cameraForBounds(bounds, scene.type, focusZoomLimit);
    const lineProgressTo = sceneLineProgress(scene, peopleById, rootGeneration, pathLength, previousLineProgress);
    const treeOffsetTo = scene.type === "opening" || scene.type === "finale" ? -100 : 0;
    const shotSeconds = scene.type === "focus"
      ? Math.max(SHOT_SECONDS.focus, Number(focusDurationSeconds) || SHOT_SECONDS.focus)
      : scene.type === "generation"
        ? Math.max(SHOT_SECONDS.generation, Number(generationDurationSeconds) || SHOT_SECONDS.generation)
        : scene.type === "branching"
          ? Math.max(SHOT_SECONDS.branching, Number(branchingDurationSeconds) || SHOT_SECONDS.branching)
      : SHOT_SECONDS[scene.type] ?? 2.2;
    const durationFrames = Math.max(1, Math.round(shotSeconds * fps));
    const activeEdgeKeys = (scene.branches ?? []).flatMap(branch =>
      branch.childIds.map(childId => `${branch.parentId}->${childId}`)
    );
    const shot = {
      id: scene.id,
      type: scene.type,
      label: scene.label,
      generation: scene.generation,
      title: scene.title,
      caption: scene.caption ?? "",
      personIds: [...(scene.personIds ?? [])],
      startFrame,
      durationFrames,
      cameraFrom: { ...previousCamera },
      cameraTo,
      lineProgressFrom: previousLineProgress,
      lineProgressTo,
      treeOffsetFrom: previousTreeOffsetY,
      treeOffsetTo,
      activeEdgeKeys
    };
    startFrame += durationFrames;
    previousCamera = cameraTo;
    previousLineProgress = lineProgressTo;
    previousTreeOffsetY = treeOffsetTo;
    return shot;
  });

  const contentFrames = startFrame;
  const totalFrames = contentFrames
    + SCENE_TRANSITION_FRAMES * Math.max(0, shots.length - 1);

  return {
    fps,
    totalFrames: contentFrames,
    contentFrames,
    transitionFrames: SCENE_TRANSITION_FRAMES,
    layout,
    pathIds,
    shots
  };
}

function mix(from, to, progress) {
  return from + (to - from) * progress;
}

function sampleCamera(timeline, shotIndex, progress) {
  const shot = timeline.shots[shotIndex];
  const eased = easeCinematic(progress);

  return {
    x: mix(shot.cameraFrom.x, shot.cameraTo.x, eased),
    y: mix(shot.cameraFrom.y, shot.cameraTo.y, eased),
    zoom: mix(shot.cameraFrom.zoom, shot.cameraTo.zoom, eased)
  };
}

export function sampleCinematicTimeline(timeline, frame) {
  if (!timeline?.shots?.length || timeline.totalFrames <= 0) return null;
  const sampleFrame = clamp(Math.floor(Number(frame) || 0), 0, timeline.totalFrames - 1);
  let shotIndex = timeline.shots.findIndex(shot => sampleFrame < shot.startFrame + shot.durationFrames);
  if (shotIndex < 0) shotIndex = timeline.shots.length - 1;
  const shot = timeline.shots[shotIndex];
  const localFrame = sampleFrame - shot.startFrame;
  const progress = shot.durationFrames <= 1 ? 1 : localFrame / (shot.durationFrames - 1);
  const eased = easeCinematic(
    shot.type === "focus" || shot.type === "finale" ? Math.min(1, progress / 0.62) : progress
  );
  const cameraMoveProgress = shot.cameraHoldFrames > 0
    ? clamp(
      (localFrame - shot.cameraHoldFrames) / Math.max(1, shot.durationFrames - 1 - shot.cameraHoldFrames),
      0,
      1
    )
    : shot.type === "focus" || shot.type === "finale"
      ? Math.min(1, progress / 0.62)
      : progress;
  const cameraProgress = easeCinematic(cameraMoveProgress);
  return {
    frame: sampleFrame,
    shotIndex,
    shotId: shot.id,
    shotType: shot.type,
    label: shot.label,
    title: shot.title,
    caption: shot.caption,
    personIds: shot.personIds,
    activeEdgeKeys: shot.activeEdgeKeys,
    progress,
    easedProgress: eased,
    cameraProgress,
    camera: sampleCamera(timeline, shotIndex, cameraMoveProgress),
    treeOffsetY: mix(shot.treeOffsetFrom, shot.treeOffsetTo, eased),
    lineProgress: mix(shot.lineProgressFrom, shot.lineProgressTo, eased)
  };
}
