import test from "node:test";
import assert from "node:assert/strict";
import {
  EXPORT_WORKSHOP_HANDOFF_KEY,
  createExportWorkshopHandoff,
  readExportWorkshopHandoff,
  updateExportWorkshopHandoff,
  writeExportWorkshopHandoff
} from "./workshop-model.mjs";

const people = [
  { id: "father", name: "Отец", generation: 1, parentId: null, born: 1952, died: 2011 },
  { id: "self", name: "Мансур", generation: 2, parentId: "father", born: 1999, died: null },
  { id: "child", name: "Мухьаммад", generation: 3, parentId: "self", born: 2026, died: null }
];

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

test("shared handoff maps the current path into print and video scopes", () => {
  const handoff = createExportWorkshopHandoff(people, {
    treeId: "hoti",
    scopeType: "path",
    selectedPersonId: "self",
    returnContext: "account",
    returnView: "path",
    returnPersonId: "self"
  });

  assert.equal(handoff.version, 1);
  assert.equal(handoff.treeId, "hoti");
  assert.equal(handoff.print.scope, "person");
  assert.equal(handoff.print.personId, "self");
  assert.equal(handoff.print.direction, "ancestors");
  assert.equal(handoff.video.settings.scopeType, "path");
  assert.equal(handoff.video.settings.selectedPersonId, "self");
  assert.equal(handoff.returnContext, "account");
  assert.equal(handoff.returnView, "path");
  assert.equal(handoff.returnPersonId, "self");
  assert.equal(handoff.printPeople.length, people.length);
});

test("switching export modes updates shared scope and keeps print metadata", () => {
  const original = createExportWorkshopHandoff([
    ...people.slice(0, 2),
    { ...people[2], photoKey: "portrait-4", hasPhoto: true }
  ], {
    treeId: "hoti",
    scopeType: "all",
    selectedPersonId: "self",
    returnContext: "account"
  });
  const updated = updateExportWorkshopHandoff(original, {
    scopeType: "path",
    selectedPersonId: "self",
    printSettings: { scopeType: "person", personId: "self", direction: "ancestors", depth: 3 },
    videoSettings: { title: "Наша история", includeDates: false, aspectRatio: "9:16" }
  });

  assert.equal(updated.scopeType, "path");
  assert.equal(updated.print.scope, "person");
  assert.equal(updated.print.personId, "self");
  assert.equal(updated.video.settings.title, "Наша история");
  assert.equal(updated.video.settings.aspectRatio, "9:16");
  assert.equal(updated.printPeople[2].photoKey, "portrait-4");
  assert.equal(updated.printPeople[2].hasPhoto, true);
});

test("shared handoff round-trips through same-tab storage without query data", () => {
  const storage = createStorage();
  const handoff = createExportWorkshopHandoff(people, {
    treeId: "hoti",
    scopeType: "all",
    selectedPersonId: "self",
    returnContext: "family"
  });

  writeExportWorkshopHandoff(storage, handoff);

  assert.deepEqual(readExportWorkshopHandoff(storage), handoff);
  assert.ok(storage.getItem(EXPORT_WORKSHOP_HANDOFF_KEY).includes("Мансур"));
});

test("public demo can use the shared print and video workshop without changing its tree id", () => {
  const storage = createStorage();
  const handoff = createExportWorkshopHandoff(people, {
    treeId: "drewo-reklama",
    scopeType: "all",
    selectedPersonId: "self",
    returnContext: "family",
    returnView: "all-tree",
    returnPersonId: "self"
  });

  writeExportWorkshopHandoff(storage, handoff);

  assert.equal(readExportWorkshopHandoff(storage).treeId, "drewo-reklama");
  assert.equal(readExportWorkshopHandoff(storage).video.tree.people.length, people.length);
  assert.equal(readExportWorkshopHandoff(storage).print.tree, "drewo-reklama");
});

test("malformed or untrusted handoff is ignored", () => {
  const storage = createStorage();
  storage.setItem(EXPORT_WORKSHOP_HANDOFF_KEY, JSON.stringify({
    version: 1,
    treeId: "https://example.invalid/",
    returnContext: "https://example.invalid/",
    print: {},
    video: {}
  }));

  assert.equal(readExportWorkshopHandoff(storage), null);
  assert.throws(() => createExportWorkshopHandoff(people, { treeId: "../admin" }), /tree/i);
});
