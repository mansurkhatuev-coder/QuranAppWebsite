import { buildStoryScenes, getGenerationDateExcerpt, getStoryPeople } from "../../story.mjs?v=20261015-abdul-1952";
import {
  buildCinematicTimeline,
  CHAPTER_COPY_START_RATIO,
  easeCinematic,
  layoutFamilyTree,
  sampleCinematicTimeline
} from "../../cinematic-timeline.mjs?v=20261029-lineage-detail-medium-1";
import { DEFAULT_FAMILY_HISTORY_PROPS, REMOTION_COMPOSITION } from "./composition-config.mjs";

const VALID_SCOPES = new Set(["all", "path", "branch"]);
export const ACTIVE_CARD_REVEAL_FRAMES = 18;
export const FOCUS_CAMERA_HOLD_RATIO = 0.72;
export const FULL_TREE_FOCUS_CAMERA_HOLD_RATIO = 0.6;
export const FOCUS_CAMERA_ARRIVAL_RATIO = 0.35;
export const FULL_TREE_FOCUS_CAMERA_ARRIVAL_RATIO = 0.55;
export const FULL_TREE_FOCUS_DURATION_SECONDS = 6;
export const FULL_TREE_GENERATION_DURATION_SECONDS = 2.25;
export const FULL_TREE_GENERATION_GROUP_SIZE = 24;
export const FULL_TREE_MAX_CARD_TRAVEL_PX_PER_FRAME = 64;
export const FULL_TREE_CAMERA_SETTLE_FRAMES = 18;
const VIDEO_PACING_VIEWPORTS = [[1280, 720], [720, 1280], [720, 720]];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function transitionProgress(shotCount, transitionFrames, localFrame) {
  if (shotCount <= 1 || transitionFrames <= 1) return 1;
  return easeCinematic(clamp(localFrame / (transitionFrames - 1), 0, 1));
}

function groupFullTreeGenerationScenes(scenes, people, layout) {
  const scenePeople = new Map(scenes.flatMap(scene => (scene.people ?? []).map(person => [person.id, person])));
  const peopleById = new Map(people.map(person => [person.id, person]));
  const xById = new Map(layout.nodes.map(node => [node.id, node.x]));
  const result = [];

  for (let index = 0; index < scenes.length;) {
    const first = scenes[index];
    if (first.type !== "generation") {
      result.push(first);
      index += 1;
      continue;
    }

    const generationScenes = [];
    while (index < scenes.length
      && scenes[index].type === "generation"
      && scenes[index].generation === first.generation) {
      generationScenes.push(scenes[index]);
      index += 1;
    }

    const generationIds = generationScenes.flatMap(scene => scene.personIds)
      .sort((left, right) => (xById.get(left) ?? 0) - (xById.get(right) ?? 0));
    const childrenByParent = new Map();
    for (const childId of generationIds) {
      const parentId = peopleById.get(childId)?.parent;
      if (!parentId) continue;
      const childIds = childrenByParent.get(parentId) ?? [];
      childIds.push(childId);
      childrenByParent.set(parentId, childIds);
    }
    const generationBranches = [...childrenByParent].map(([parentId, childIds]) => ({ parentId, childIds }));
    const groupCount = Math.ceil(generationIds.length / FULL_TREE_GENERATION_GROUP_SIZE);
    for (let start = 0; start < generationIds.length; start += FULL_TREE_GENERATION_GROUP_SIZE) {
      const part = generationIds.slice(start, start + FULL_TREE_GENERATION_GROUP_SIZE);
      const partNumber = Math.floor(start / FULL_TREE_GENERATION_GROUP_SIZE) + 1;
      const hasParts = groupCount > 1;
      result.push({
        ...first,
        id: hasParts ? `generation-${first.generation}-part-${partNumber}` : `generation-${first.generation}`,
        label: hasParts ? `Поколение ${first.generation} · часть ${partNumber}` : `Поколение ${first.generation}`,
        title: `Поколение ${first.generation}`,
        groupStart: start + 1,
        groupEnd: start + part.length,
        groupTotal: generationIds.length,
        personIds: part,
        people: part.map(id => scenePeople.get(id) ?? peopleById.get(id)).filter(Boolean),
        branches: start === 0 ? generationBranches : []
      });
    }
  }

  return result;
}

export function buildRemotionStory(options = {}) {
  const sourcePeople = Array.isArray(options.people) && options.people.length
    ? options.people
    : [];
  const scopeType = VALID_SCOPES.has(options.scopeType)
    ? options.scopeType
    : DEFAULT_FAMILY_HISTORY_PROPS.scopeType;
  const suppliedId = typeof options.selectedPersonId === "string" ? options.selectedPersonId : "";
  const defaultSelectedPersonId = [...sourcePeople]
    .sort((left, right) => Number(left.generation ?? 0) - Number(right.generation ?? 0)).at(-1)?.id ?? "";
  const selectedPersonId = sourcePeople.some(person => person.id === suppliedId)
    ? suppliedId
    : defaultSelectedPersonId;
  const title = typeof options.title === "string" && options.title.trim()
    ? options.title.trim().slice(0, 80)
    : DEFAULT_FAMILY_HISTORY_PROPS.title;
  const includeDates = options.includeDates !== false;
  const people = getStoryPeople(sourcePeople, { scopeType, selectedPersonId });
  let scenes = buildStoryScenes(sourcePeople, {
    scopeType,
    selectedPersonId,
    includeDates,
    title
  });
  const effectiveSelectedPersonId = people.some(person => person.id === selectedPersonId)
    ? selectedPersonId
    : people.at(-1)?.id ?? "";
  if (scopeType === "all") {
    const layout = layoutFamilyTree(people);
    scenes = groupFullTreeGenerationScenes(scenes, people, layout)
      .filter(scene => scene.type !== "branching");
  }
  const timeline = buildCinematicTimeline(people, scenes, {
    fps: REMOTION_COMPOSITION.fps,
    focusDurationSeconds: scopeType === "all" ? FULL_TREE_FOCUS_DURATION_SECONDS : undefined,
    generationDurationSeconds: scopeType === "all" ? FULL_TREE_GENERATION_DURATION_SECONDS : undefined,
    branchingDurationSeconds: scopeType === "all" ? 2 : undefined,
    focusZoomLimit: scopeType === "all" ? 2.8 : undefined
  });

  const story = {
    people,
    scenes,
    timeline,
    selectedPersonId: effectiveSelectedPersonId,
    scopeType,
    title,
    includeDates
  };
  if (scopeType === "all") paceFullTreeTimeline(story);
  return story;
}

export function formatPersonDateLabel(person, includeDates = true) {
  if (!includeDates) return "";
  if (person?.born == null && person?.died == null) return "даты неизвестны";
  if (person?.born != null && person?.died != null) return `${person.born} — ${person.died}`;
  if (person?.born != null) return `род. ${person.born}`;
  return `ум. ${person.died}`;
}

export function splitPersonName(value, maxLineLength = 12) {
  const words = String(value || "Без имени").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (line && line.length + 1 + word.length > maxLineLength) {
      lines.push(line);
      line = "";
    }
    if (word.length > maxLineLength) {
      if (line) lines.push(line);
      lines.push(word);
      line = "";
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

export { getGenerationDateExcerpt };

export function getScenePresentation(shotType) {
  const isWide = shotType === "opening" || shotType === "finale";
  return {
    treeOffsetY: isWide ? -100 : 0,
    contextCardOpacity: shotType === "focus" ? 0.3 : 0.26,
    contextLineOpacity: 0.54
  };
}

export function getShotIndexAtFrame(story, frame) {
  const shots = story?.timeline?.shots ?? [];
  if (!shots.length) return -1;
  const value = clamp(Math.floor(Number(frame) || 0), 0, Math.max(0, story.timeline.totalFrames - 1));
  const index = shots.findIndex(shot => value < shot.startFrame + shot.durationFrames);
  return index < 0 ? shots.length - 1 : index;
}

export function getSceneTransitionProgress(story, shotIndex, localFrame) {
  const shots = story?.timeline?.shots ?? [];
  if (shotIndex <= 0) return 1;
  return transitionProgress(shots.length, story.timeline.transitionFrames, localFrame);
}

function getCinematicFramingTransitionProgress(story, shotIndex, localFrame) {
  const shots = story?.timeline?.shots ?? [];
  const shot = shots[shotIndex];
  if (!shot) return 1;
  if (shot.type === "focus") {
    const holdRatio = story.scopeType === "all"
      ? FULL_TREE_FOCUS_CAMERA_HOLD_RATIO
      : FOCUS_CAMERA_HOLD_RATIO;
    const holdFrame = Math.floor(Math.max(0, shot.durationFrames - 1) * holdRatio);
    return transitionProgress(shots.length, Math.max(1, shot.durationFrames - holdFrame), localFrame - holdFrame);
  }
  const framingFrames = shot.type === "finale"
    ? Math.max(1, getChapterCopyStartFrame(shot) + 1)
    : shot.durationFrames;
  return transitionProgress(shots.length, framingFrames, localFrame);
}

export function getScenePersonEmphasis(story, shotIndex, localFrame, personId) {
  const shots = story?.timeline?.shots ?? [];
  const current = shots[shotIndex];
  if (!current) return 0;
  const isCurrent = current.personIds.includes(personId);
  // All scopes use one continuous tree canvas. Once a card has entered the
  // story, keep it visible; the camera and frame edge should carry it away.
  const alreadyRevealed = shots.slice(0, shotIndex).some(shot => shot.personIds.includes(personId));
  if (alreadyRevealed) return 1;
  if (shotIndex <= 0) return isCurrent ? 1 : 0;
  const previous = shots[shotIndex - 1];
  const wasPrevious = previous.personIds.includes(personId);
  if (isCurrent && wasPrevious) return 1;
  if (!isCurrent && !wasPrevious) return 0;
  const progress = getSceneTransitionProgress(story, shotIndex, localFrame);
  return isCurrent ? progress : 1 - progress;
}

export function shouldRenderVideoPersonCard(story, shotIndex, personId, overview) {
  if (!overview) return true;
  const shots = story?.timeline?.shots ?? [];
  const throughShot = Math.max(0, Math.floor(Number(shotIndex) || 0) + 1);
  return shots.slice(0, throughShot).some(shot => shot.personIds?.includes(personId));
}

export function getFullTreeEdgeRevealProgress(story, shotIndex, localFrame, edgeKey) {
  if (story?.scopeType !== "all" || !edgeKey) return 0;
  const shots = story?.timeline?.shots ?? [];
  const revealShotIndex = shots.findIndex(shot => shot.activeEdgeKeys?.includes(edgeKey));
  if (revealShotIndex < 0 || shotIndex < revealShotIndex) return 0;
  if (shotIndex > revealShotIndex) return 1;
  const shot = shots[revealShotIndex];
  const revealFrames = Math.max(1, Math.floor(shot.durationFrames * 0.62));
  const linearProgress = clamp((Number(localFrame) || 0) / revealFrames, 0, 1);
  return linearProgress * linearProgress * (3 - 2 * linearProgress);
}

export function getVideoCardDetailProgress(renderedWidthPx, keepLineageDetailed = false) {
  const width = Number(renderedWidthPx);
  if (!Number.isFinite(width)) return 0;
  if (keepLineageDetailed === true) {
    const lineageProgress = clamp((width - 26) / (34 - 26), 0, 1);
    return lineageProgress * lineageProgress * (3 - 2 * lineageProgress);
  }
  const progress = clamp((width - 36) / (160 - 36), 0, 1);
  return progress * progress * (3 - 2 * progress);
}

export function getVideoCardContentProgress(renderedWidthPx, keepLineageDetailed = false) {
  const width = Number(renderedWidthPx);
  if (!Number.isFinite(width)) return 0;
  const fadeStart = 88;
  const fadeEnd = keepLineageDetailed ? 120 : 128;
  const progress = clamp((width - fadeStart) / (fadeEnd - fadeStart), 0, 1);
  return progress * progress * (3 - 2 * progress);
}

export function isSelectedLineagePerson(story, personId) {
  return story?.scopeType === "all"
    && Array.isArray(story?.timeline?.pathIds)
    && story.timeline.pathIds.includes(personId);
}

export function getSceneEdgeEmphasis(story, shotIndex, localFrame, edgeKey) {
  const shots = story?.timeline?.shots ?? [];
  const current = shots[shotIndex];
  if (!current) return 0;
  const isCurrent = current.activeEdgeKeys.includes(edgeKey);
  const alreadyRevealed = shots.slice(0, shotIndex).some(shot => shot.activeEdgeKeys.includes(edgeKey));
  if (alreadyRevealed) return 1;
  if (shotIndex <= 0) return isCurrent ? 1 : 0;
  const wasPrevious = shots[shotIndex - 1].activeEdgeKeys.includes(edgeKey);
  if (isCurrent && wasPrevious) return 1;
  if (!isCurrent && !wasPrevious) return 0;
  const progress = getSceneTransitionProgress(story, shotIndex, localFrame);
  return isCurrent ? progress : 1 - progress;
}

export function getSelectedCardReveal(shotType, localFrame) {
  if (shotType !== "focus" && shotType !== "finale") return 0;
  const progress = clamp((Number(localFrame) || 0) / ACTIVE_CARD_REVEAL_FRAMES, 0, 1);
  return progress * progress * (3 - 2 * progress);
}

export function getCameraFitScale(zoom) {
  return clamp(0.76 + (Number(zoom) - 1) * 0.32, 0.55, 1);
}

export function getTreeViewportOpacity(scopeType, alpha) {
  const normalizedAlpha = clamp(Number(alpha) || 0, 0, 1);
  // Keep video cards and connectors intact as the camera moves; the exported frame clips them naturally.
  return normalizedAlpha;
}

export function getCinematicFraming(frameWidth, frameHeight, camera, targetNodes, treeOffsetY = 0) {
  const safeWidth = Math.max(1, Number(frameWidth) || REMOTION_COMPOSITION.width);
  const safeHeight = Math.max(1, Number(frameHeight) || REMOTION_COMPOSITION.height);
  const viewWidth = safeWidth * (5 / 6);
  const viewHeight = safeHeight * (5 / 6);
  const centerX = viewWidth / 2;
  const aspectRatio = safeWidth / safeHeight;
  const focusCenterRatio = aspectRatio < 0.75 ? 0.29 : aspectRatio < 1.3 ? 0.33 : 0.38;
  const safeTop = viewHeight * 0.04;
  const safeBottom = viewHeight * 0.66;
  const centerY = viewHeight * focusCenterRatio;
  const naturalScale = Number(camera.zoom) * getCameraFitScale(camera.zoom);
  const nodes = Array.isArray(targetNodes) ? targetNodes : [];

  let scale = naturalScale;
  if (nodes.length > 0) {
    const left = Math.min(...nodes.map(node => node.x - node.width / 2));
    const right = Math.max(...nodes.map(node => node.x + node.width / 2));
    const top = Math.min(...nodes.map(node => node.y - node.height / 2));
    const bottom = Math.max(...nodes.map(node => node.y + node.height / 2));
    const contentWidth = Math.max(1, right - left);
    const contentHeight = Math.max(1, bottom - top);
    const widthLimit = viewWidth * 0.82 / contentWidth;
    const heightLimit = (safeBottom - safeTop) / contentHeight;
    scale = Math.min(naturalScale, widthLimit, heightLimit);

    let translateX = centerX - camera.x * scale;
    if (aspectRatio <= 1) {
      const scaledLeft = left * scale + translateX;
      if (scaledLeft < viewWidth * 0.09) translateX += viewWidth * 0.09 - scaledLeft;
      const scaledRight = right * scale + translateX;
      if (scaledRight > viewWidth * 0.91) translateX -= scaledRight - viewWidth * 0.91;
    }
    let translateY = centerY - camera.y * scale + treeOffsetY;
    const scaledTop = top * scale + translateY;
    if (scaledTop < safeTop) translateY += safeTop - scaledTop;
    const scaledBottom = bottom * scale + translateY;
    if (scaledBottom > safeBottom) translateY -= scaledBottom - safeBottom;
    return {
      viewWidth,
      viewHeight,
      scale,
      translateX,
      translateY
    };
  }

  return {
    viewWidth,
    viewHeight,
    scale,
    translateX: centerX - camera.x * scale,
    translateY: centerY - camera.y * scale + treeOffsetY
  };
}

export function getCinematicTitleFontSize(baseFontSize, title, availableWidth) {
  const baseSize = Math.max(1, Number(baseFontSize) || 1);
  const safeWidth = Math.max(1, Number(availableWidth) || 1);
  const characters = Array.from(String(title ?? "").trim());
  if (!characters.length) return baseSize;

  const words = characters.join("").split(/\s+/).filter(Boolean);
  const longestWordLength = words.reduce((longest, word) => Math.max(longest, Array.from(word).length), 0);
  const nonWhitespaceLength = characters.filter(character => !/\s/u.test(character)).length;
  // Reserve extra width for wide glyphs in a long unbroken word; ordinary phrases keep their original scale.
  const estimatedWidthInEm = Math.max(longestWordLength * 1.28, nonWhitespaceLength * 0.62);
  const threeLineFontSize = safeWidth * 3 / Math.max(1, estimatedWidthInEm);

  return Math.min(baseSize, threeLineFontSize);
}

export function getCinematicTitleSafeZone(frameHeight, titleLength = 0) {
  const safeHeight = Math.max(1, Number(frameHeight) || REMOTION_COMPOSITION.height);
  // Long custom headings can wrap to several rows, so extend their dark title field upward slightly.
  const topRatio = Number(titleLength) >= 40 ? 0.51 : 0.53;
  const top = Math.round(safeHeight * topRatio);
  return { top, height: safeHeight - top };
}

export function getBackgroundScale(frame, totalFrames) {
  const progress = totalFrames <= 1 ? 1 : clamp(frame / (totalFrames - 1), 0, 1);
  return 1.025 + easeCinematic(progress) * 0.07;
}

export function getChapterCopyStartFrame(shot) {
  return Math.floor(Math.max(0, shot.durationFrames - 1) * CHAPTER_COPY_START_RATIO);
}

export function getChapterCopyTransitionOpacities(progress) {
  const value = clamp(Number(progress) || 0, 0, 1);
  const smoothStep = input => input * input * (3 - 2 * input);
  const outgoingProgress = smoothStep(clamp(value / 0.42, 0, 1));
  const incomingProgress = smoothStep(clamp((value - 0.58) / 0.42, 0, 1));
  return {
    outgoing: 1 - outgoingProgress,
    incoming: incomingProgress
  };
}

export function sampleRemotionFrame(story, frame) {
  return sampleCinematicTimeline(story?.timeline, frame);
}

function getShotNodes(story, shot) {
  const nodesById = new Map((story?.timeline?.layout?.nodes ?? []).map(node => [node.id, node]));
  return (shot?.personIds ?? []).map(id => nodesById.get(id)).filter(Boolean);
}

export function blendCinematicFraming(outgoing, incoming, progress) {
  const amount = clamp(Number(progress) || 0, 0, 1);
  return {
    viewWidth: incoming.viewWidth,
    viewHeight: incoming.viewHeight,
    scale: outgoing.scale + (incoming.scale - outgoing.scale) * amount,
    translateX: outgoing.translateX + (incoming.translateX - outgoing.translateX) * amount,
    translateY: outgoing.translateY + (incoming.translateY - outgoing.translateY) * amount
  };
}

export function getCinematicFramingForFrame(story, frameWidth, frameHeight, frame) {
  const sample = sampleRemotionFrame(story, frame);
  if (!sample) return null;
  const shots = story.timeline.shots;
  const shot = shots[sample.shotIndex];
  if (!shot) return null;
  const currentNodes = getShotNodes(story, shot);
  const current = getCinematicFraming(
    frameWidth,
    frameHeight,
    shot.cameraTo,
    currentNodes,
    shot.treeOffsetTo
  );
  const localFrame = Math.max(0, Math.floor(Number(frame) || 0) - shot.startFrame);

  if (shot.type === "opening") return current;

  const previousShot = shots[sample.shotIndex - 1];
  const previous = previousShot
    ? getCinematicFraming(
      frameWidth,
      frameHeight,
      previousShot.cameraTo,
      getShotNodes(story, previousShot),
      previousShot.treeOffsetTo
    )
    : current;

  if (shot.type === "origin" || shot.type === "generation" || shot.type === "branching") {
    return blendCinematicFraming(previous, current, sample.cameraProgress);
  }

  if (shot.type === "focus") {
    const nextShot = shots[sample.shotIndex + 1];
    const finale = getCinematicFraming(
      frameWidth,
      frameHeight,
      nextShot?.cameraTo ?? shot.cameraTo,
      nextShot ? getShotNodes(story, nextShot) : currentNodes,
      nextShot?.treeOffsetTo ?? shot.treeOffsetTo
    );
    const holdRatio = story.scopeType === "all"
      ? FULL_TREE_FOCUS_CAMERA_HOLD_RATIO
      : FOCUS_CAMERA_HOLD_RATIO;
    const arrivalRatio = story.scopeType === "all"
      ? FULL_TREE_FOCUS_CAMERA_ARRIVAL_RATIO
      : FOCUS_CAMERA_ARRIVAL_RATIO;
    const lastFrame = Math.max(1, shot.durationFrames - 1);
    const arrivalFrame = Math.max(1, Math.floor(lastFrame * arrivalRatio));
    const exitStartFrame = Math.max(arrivalFrame, Math.floor(lastFrame * holdRatio));
    if (localFrame <= arrivalFrame) {
      return blendCinematicFraming(previous, current, easeCinematic(localFrame / arrivalFrame));
    }
    if (localFrame <= exitStartFrame) return current;
    const exitDuration = Math.max(1, lastFrame - exitStartFrame);
    const exitProgress = easeCinematic(clamp((localFrame - exitStartFrame) / exitDuration, 0, 1));
    return blendCinematicFraming(current, finale, exitProgress);
  }

  if (shot.type === "finale") return current;

  const outgoing = getCinematicFraming(
    frameWidth,
    frameHeight,
    shot.cameraTo,
    currentNodes,
    shot.treeOffsetFrom
  );
  const nextShot = story.timeline.shots[sample.shotIndex + 1];
  const incoming = getCinematicFraming(
    frameWidth,
    frameHeight,
    nextShot?.cameraTo ?? shot.cameraTo,
    nextShot ? getShotNodes(story, nextShot) : currentNodes,
    shot.treeOffsetTo
  );
  const progress = getCinematicFramingTransitionProgress(story, sample.shotIndex, localFrame);
  return blendCinematicFraming(outgoing, incoming, progress);
}

function getShotFraming(story, shot, frameWidth, frameHeight) {
  const nodes = getShotNodes(story, shot);
  return getCinematicFraming(frameWidth, frameHeight, shot.cameraTo, nodes, shot.treeOffsetTo);
}

function getRenderedNodeBounds(node, framing, frameWidth, frameHeight) {
  const outputScale = Math.min(frameWidth / framing.viewWidth, frameHeight / framing.viewHeight);
  const width = node.width * framing.scale * outputScale;
  const height = node.height * framing.scale * outputScale;
  const centerX = (node.x * framing.scale + framing.translateX) * outputScale;
  const centerY = (node.y * framing.scale + framing.translateY) * outputScale;
  return {
    centerX,
    centerY,
    width,
    height,
    visible: centerX + width / 2 >= 0 && centerX - width / 2 <= frameWidth
      && centerY + height / 2 >= 0 && centerY - height / 2 <= frameHeight
  };
}

function maxCardTravelBetween(from, to, nodes, frameWidth, frameHeight, { fromVisibleOnly = false } = {}) {
  const outputScale = Math.min(frameWidth / to.viewWidth, frameHeight / to.viewHeight);
  let maximum = Math.hypot(
    (to.translateX - from.translateX) * outputScale,
    (to.translateY - from.translateY) * outputScale
  );

  for (const node of nodes) {
    const start = getRenderedNodeBounds(node, from, frameWidth, frameHeight);
    const end = getRenderedNodeBounds(node, to, frameWidth, frameHeight);
    const startIsRelevant = start.visible && Math.max(start.width, start.height) >= 12;
    const endIsRelevant = end.visible && Math.max(end.width, end.height) >= 12;
    const visuallyRelevant = fromVisibleOnly ? startIsRelevant : startIsRelevant || endIsRelevant;
    if (!visuallyRelevant) continue;
    const dx = end.centerX - start.centerX;
    const dy = end.centerY - start.centerY;
    const sizeChange = Math.hypot((end.width - start.width) / 2, (end.height - start.height) / 2);
    maximum = Math.max(maximum, Math.hypot(dx, dy) + sizeChange);
  }
  return maximum;
}

function requiredFramesForTravel(distance) {
  return Math.max(1, Math.ceil(distance * 3 / FULL_TREE_MAX_CARD_TRAVEL_PX_PER_FRAME));
}

function paceFullTreeTimeline(story) {
  const timeline = story.timeline;
  const nodes = timeline.layout.nodes;
  const shots = timeline.shots;

  for (let index = 0; index < shots.length; index += 1) {
    const shot = shots[index];
    if (!["origin", "generation", "branching", "focus"].includes(shot.type)) continue;
    const previous = shots[index - 1] ?? shot;
    const cameraHoldFrames = index > 0 && ["origin", "generation", "branching"].includes(shot.type)
      ? FULL_TREE_CAMERA_SETTLE_FRAMES
      : 0;
    let requiredDuration = shot.durationFrames;

    for (const [frameWidth, frameHeight] of VIDEO_PACING_VIEWPORTS) {
      const from = getShotFraming(story, previous, frameWidth, frameHeight);
      const current = getShotFraming(story, shot, frameWidth, frameHeight);
      if (shot.type === "focus") {
        const next = shots[index + 1];
        const finale = next ? getShotFraming(story, next, frameWidth, frameHeight) : current;
        const arrivalRatio = FULL_TREE_FOCUS_CAMERA_ARRIVAL_RATIO;
        const holdRatio = FULL_TREE_FOCUS_CAMERA_HOLD_RATIO;
        const arrivalTravel = requiredFramesForTravel(maxCardTravelBetween(from, current, nodes, frameWidth, frameHeight));
        const exitTravel = requiredFramesForTravel(maxCardTravelBetween(current, finale, nodes, frameWidth, frameHeight, {
          fromVisibleOnly: true
        }));
        requiredDuration = Math.max(
          requiredDuration,
          Math.ceil(arrivalTravel / arrivalRatio) + 1,
          Math.ceil(exitTravel / (1 - holdRatio)) + 1
        );
      } else {
        const travel = requiredFramesForTravel(maxCardTravelBetween(from, current, nodes, frameWidth, frameHeight));
        requiredDuration = Math.max(requiredDuration, cameraHoldFrames + travel + 1);
      }
    }

    shot.durationFrames = requiredDuration;
    shot.cameraHoldFrames = cameraHoldFrames;
  }

  let nextStartFrame = 0;
  for (const shot of shots) {
    shot.startFrame = nextStartFrame;
    nextStartFrame += shot.durationFrames;
  }
  timeline.contentFrames = nextStartFrame;
  timeline.totalFrames = nextStartFrame;
}
