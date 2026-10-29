import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_EXPORT_SETTINGS, normalizeExportSettings } from "./export-studio-model.mjs";

const people = [{ id: "mansur", name: "Мансур", generation: 13, parent: null }];

test("video export preferences default to a valid background and preserve a selected background", () => {
  assert.equal(DEFAULT_EXPORT_SETTINGS.backgroundId, "towers");
  assert.equal(normalizeExportSettings({}, people).backgroundId, "towers");
  assert.equal(normalizeExportSettings({ backgroundId: "eagle" }, people).backgroundId, "eagle");
});

test("invalid video background preference falls back to the default preset", () => {
  assert.equal(normalizeExportSettings({ backgroundId: "outside-origin-url" }, people).backgroundId, "towers");
});
