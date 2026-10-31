import { buildRemotionStory } from "./project-model.mjs?v=20261031-aligned-family-layout-1";
import {
  DEFAULT_FAMILY_HISTORY_PROPS,
  DEFAULT_VIDEO_ASPECT_RATIO,
  getVideoFormat,
  REMOTION_COMPOSITION,
  VIDEO_FORMATS
} from "./composition-config.mjs";
import { DEFAULT_VIDEO_BACKGROUND_ID, isVideoBackgroundId } from "./video-backgrounds.mjs";

export const EXPORT_SETTINGS_STORAGE_KEY = "waydean.video-export.settings.v1";
export const VIDEO_SPEED_MIN = 0.25;
export const VIDEO_SPEED_MAX = 8;
export const VIDEO_SPEED_STEP = 0.25;
export const VIDEO_SPEED_OPTIONS = Object.freeze(Array.from(
  { length: (VIDEO_SPEED_MAX - VIDEO_SPEED_MIN) / VIDEO_SPEED_STEP + 1 },
  (_, index) => VIDEO_SPEED_MIN + index * VIDEO_SPEED_STEP
));

export const DEFAULT_EXPORT_SETTINGS = Object.freeze({
  ...DEFAULT_FAMILY_HISTORY_PROPS,
  backgroundId: DEFAULT_VIDEO_BACKGROUND_ID,
  speed: 1
});

const SCOPE_TYPES = new Set(["all", "path", "branch"]);
const ASPECT_RATIOS = new Set(Object.keys(VIDEO_FORMATS));

export function normalizeVideoSpeed(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  const stepped = Math.round(numeric / VIDEO_SPEED_STEP) * VIDEO_SPEED_STEP;
  return Math.min(VIDEO_SPEED_MAX, Math.max(VIDEO_SPEED_MIN, Number(stepped.toFixed(2))));
}

function defaultPersonId(people) {
  return [...people]
    .sort((left, right) => Number(left.generation ?? 0) - Number(right.generation ?? 0))
    .at(-1)?.id ?? "";
}

export function normalizeExportSettings(input = {}, people = []) {
  const sourcePeople = Array.isArray(people) ? people : [];
  const peopleIds = new Set(sourcePeople.map(person => person.id));
  const suppliedTitle = typeof input.title === "string" ? input.title.trim() : "";
  const title = (suppliedTitle || DEFAULT_FAMILY_HISTORY_PROPS.title).slice(0, 80).trim();

  return {
    title: title || DEFAULT_FAMILY_HISTORY_PROPS.title,
    scopeType: SCOPE_TYPES.has(input.scopeType)
      ? input.scopeType
      : DEFAULT_FAMILY_HISTORY_PROPS.scopeType,
    selectedPersonId: peopleIds.has(input.selectedPersonId)
      ? input.selectedPersonId
      : defaultPersonId(sourcePeople),
    aspectRatio: ASPECT_RATIOS.has(input.aspectRatio)
      ? input.aspectRatio
      : DEFAULT_VIDEO_ASPECT_RATIO,
    includeDates: input.includeDates === undefined
      ? DEFAULT_FAMILY_HISTORY_PROPS.includeDates
      : input.includeDates === true,
    backgroundId: isVideoBackgroundId(input.backgroundId)
      ? input.backgroundId
      : DEFAULT_VIDEO_BACKGROUND_ID,
    speed: normalizeVideoSpeed(input.speed ?? DEFAULT_EXPORT_SETTINGS.speed)
  };
}

export function buildExportPreview(input = DEFAULT_EXPORT_SETTINGS, people = []) {
  const sourcePeople = Array.isArray(people) ? people : [];
  const settings = normalizeExportSettings(input, sourcePeople);
  const story = buildRemotionStory({ ...settings, people: sourcePeople });
  const generations = new Set(story.people.map(person => Number(person.generation ?? 0)));
  const dimensions = getVideoFormat(settings.aspectRatio);

  return {
    settings,
    story,
    peopleCount: story.people.length,
    generationCount: generations.size,
    sceneCount: story.timeline.shots.length,
    durationFrames: story.timeline.totalFrames,
    durationSeconds: story.timeline.totalFrames / REMOTION_COMPOSITION.fps,
    fps: REMOTION_COMPOSITION.fps,
    frame: {
      width: dimensions.width,
      height: dimensions.height,
      aspectRatio: settings.aspectRatio,
      status: "review-candidate"
    }
  };
}
