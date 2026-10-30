import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_EXPORT_SETTINGS, normalizeExportSettings, VIDEO_SPEED_OPTIONS } from "./export-studio-model.mjs";

const people = [{ id: "mansur", name: "Мансур", generation: 13, parent: null }];

test("video export preferences default to a valid background and preserve a selected background", () => {
  assert.equal(DEFAULT_EXPORT_SETTINGS.backgroundId, "towers");
  assert.equal(normalizeExportSettings({}, people).backgroundId, "towers");
  assert.equal(normalizeExportSettings({ backgroundId: "village" }, people).backgroundId, "village");
});

test("invalid video background preference falls back to the default preset", () => {
  assert.equal(normalizeExportSettings({ backgroundId: "outside-origin-url" }, people).backgroundId, "towers");
});

test("video export speed defaults to normal and preserves valid wide-range presets", () => {
  assert.equal(VIDEO_SPEED_OPTIONS[0], 0.25);
  assert.equal(VIDEO_SPEED_OPTIONS.at(-1), 8);
  assert.equal(VIDEO_SPEED_OPTIONS.length, 32);
  assert.equal(DEFAULT_EXPORT_SETTINGS.speed, 1);
  assert.equal(normalizeExportSettings({}, people).speed, 1);
  assert.equal(normalizeExportSettings({ speed: 4 }, people).speed, 4);
  assert.equal(normalizeExportSettings({ speed: 8 }, people).speed, 8);
  assert.equal(normalizeExportSettings({ speed: 99 }, people).speed, 8);
  assert.equal(normalizeExportSettings({ speed: 0.1 }, people).speed, 0.25);
  assert.equal(normalizeExportSettings({ speed: "fast" }, people).speed, 1);
});
