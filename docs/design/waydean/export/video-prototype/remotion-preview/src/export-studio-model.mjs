import { buildRemotionStory } from "./project-model.mjs";
import {
  DEFAULT_FAMILY_HISTORY_PROPS,
  DEFAULT_VIDEO_ASPECT_RATIO,
  getVideoFormat,
  REMOTION_COMPOSITION,
  VIDEO_FORMATS
} from "./composition-config.mjs";

export const EXPORT_SETTINGS_STORAGE_KEY = "waydean.video-export.settings.v1";

export const DEFAULT_EXPORT_SETTINGS = Object.freeze({
  ...DEFAULT_FAMILY_HISTORY_PROPS
});

const SCOPE_TYPES = new Set(["all", "path", "branch"]);
const ASPECT_RATIOS = new Set(Object.keys(VIDEO_FORMATS));

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
      : input.includeDates === true
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
