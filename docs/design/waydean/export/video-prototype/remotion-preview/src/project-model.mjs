import { buildStoryScenes, getGenerationDateExcerpt, getStoryPeople } from "../../story.mjs?v=20261015-abdul-1952";
import {
  buildCinematicTimeline,
  CHAPTER_COPY_START_RATIO,
  easeCinematic,
  sampleCinematicTimeline
} from "../../cinematic-timeline.mjs";
import { DEFAULT_FAMILY_HISTORY_PROPS, REMOTION_COMPOSITION } from "./composition-config.mjs";

const VALID_SCOPES = new Set(["all", "path", "branch"]);
export const ACTIVE_CARD_REVEAL_FRAMES = 18;
export const FOCUS_CAMERA_HOLD_RATIO = 0.72;
export const FULL_TREE_FOCUS_CAMERA_HOLD_RATIO = 0.4;
export const FULL_TREE_FOCUS_DURATION_SECONDS = 5;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function transitionProgress(shotCount, transitionFrames, localFrame) {
  if (shotCount <= 1 || transitionFrames <= 1) return 1;
  return easeCinematic(clamp(localFrame / (transitionFrames - 1), 0, 1));
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
  const scenes = buildStoryScenes(sourcePeople, {
    scopeType,
    selectedPersonId,
    includeDates,
    title
  });
  const effectiveSelectedPersonId = people.some(person => person.id === selectedPersonId)
    ? selectedPersonId
    : people.at(-1)?.id ?? "";
  const timeline = buildCinematicTimeline(people, scenes, {
    fps: REMOTION_COMPOSITION.fps,
    focusDurationSeconds: scopeType === "all" ? FULL_TREE_FOCUS_DURATION_SECONDS : undefined
  });

  return {
    people,
    scenes,
    timeline,
    selectedPersonId: effectiveSelectedPersonId,
    scopeType,
    title,
    includeDates
  };
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
  const shot = story.timeline.shots[sample.shotIndex];
  if (!shot) return null;
  const currentNodes = getShotNodes(story, shot);
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
  const localFrame = Math.max(0, Math.floor(Number(frame) || 0) - shot.startFrame);
  const progress = getCinematicFramingTransitionProgress(story, sample.shotIndex, localFrame);
  return blendCinematicFraming(outgoing, incoming, progress);
}
