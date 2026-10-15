import test from "node:test";
import assert from "node:assert/strict";
import { buildExportPreview, normalizeExportSettings } from "./export-studio-model.mjs";

const family = [
  { id: "ancestor", name: "Куди", generation: 1, parent: null, born: 1000, died: null },
  { id: "parent", name: "Гьоймирза", generation: 2, parent: "ancestor", born: null, died: null },
  { id: "selected", name: "Исмаал", generation: 3, parent: "parent", born: null, died: null },
  { id: "sibling", name: "Устмал", generation: 3, parent: "parent", born: null, died: null }
];

test("browser export builds the selected person, title, scope, and dates from the handed-off tree", () => {
  const settings = normalizeExportSettings({
    scopeType: "path",
    selectedPersonId: "selected",
    title: "Моя семья",
    includeDates: false,
    aspectRatio: "9:16"
  }, family);
  const preview = buildExportPreview(settings, family);

  assert.deepEqual(preview.story.people.map(person => person.id), ["ancestor", "parent", "selected"]);
  assert.equal(preview.story.selectedPersonId, "selected");
  assert.equal(preview.story.title, "Моя семья");
  assert.equal(preview.story.includeDates, false);
  assert.equal(preview.frame.aspectRatio, "9:16");
});

test("browser export falls back to a person from the handed-off tree for an unknown selection", () => {
  const settings = normalizeExportSettings({ selectedPersonId: "missing" }, family);
  const preview = buildExportPreview(settings, family);

  assert.equal(settings.selectedPersonId, "sibling");
  assert.equal(preview.story.people.length, family.length);
});
