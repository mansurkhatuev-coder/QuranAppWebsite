import { DEFAULT_HOTI_SELECTED_PERSON_ID } from "../../hoti-people.mjs";

export const REMOTION_COMPOSITION = Object.freeze({
  id: "WaydeanFamilyStory",
  width: 1920,
  height: 1080,
  fps: 30
});

export const DEFAULT_VIDEO_ASPECT_RATIO = "16:9";

export const VIDEO_FORMATS = Object.freeze({
  "16:9": Object.freeze({ label: "Широкий", width: 1920, height: 1080 }),
  "9:16": Object.freeze({ label: "Вертикальный", width: 1080, height: 1920 }),
  "1:1": Object.freeze({ label: "Квадрат", width: 1080, height: 1080 })
});

export function getVideoFormat(aspectRatio) {
  return VIDEO_FORMATS[aspectRatio] ?? VIDEO_FORMATS[DEFAULT_VIDEO_ASPECT_RATIO];
}

export const DEFAULT_FAMILY_HISTORY_PROPS = Object.freeze({
  title: "История рода",
  scopeType: "all",
  selectedPersonId: DEFAULT_HOTI_SELECTED_PERSON_ID,
  includeDates: true,
  aspectRatio: DEFAULT_VIDEO_ASPECT_RATIO
});
