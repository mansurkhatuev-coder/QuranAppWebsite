import test from "node:test";
import assert from "node:assert/strict";
import { createBrowserVideoHandoff } from "../../../../../drewo/waydean-preview-video-handoff.mjs";
import { buildExportPreview } from "./remotion-preview/src/export-studio-model.mjs";
import { normalizeVideoExportHandoff } from "./remotion-preview/src/browser-export-model.mjs";

const treeRecords = [
  { id: "ancestor", name: "Старший предок", generation: 11, parentId: null, born: 1925 },
  { id: "abdul-khamid", name: "Абдулхамид", generation: 12, parentId: "ancestor", born: 1952, died: 2011 },
  { id: "yakub", name: "Якуб", generation: 12, parentId: "other-branch", born: null },
  { id: "ahmad", name: "Ахмад", generation: 13, parentId: "abdul-khamid", born: 1989 },
  { id: "mansur", name: "Мансур", generation: 13, parentId: "abdul-khamid", born: 1999 },
  { id: "muhammad", name: "Мухаммад", generation: 14, parentId: "mansur", born: 2026 }
];

test("video export preserves Abdulhamid to Mansur to Muhammad and keeps Yakub in his own branch", () => {
  const handoff = createBrowserVideoHandoff(treeRecords, {
    scopeType: "all",
    selectedPersonId: "mansur"
  });
  const normalized = normalizeVideoExportHandoff(handoff);
  const preview = buildExportPreview(normalized.settings, normalized.tree.people);
  const edges = preview.story.timeline.layout.edges;
  const nodesById = new Map(preview.story.timeline.layout.nodes.map(node => [node.id, node]));

  assert.ok(edges.some(edge => edge.parentId === "abdul-khamid" && edge.childId === "mansur"));
  assert.ok(edges.some(edge => edge.parentId === "mansur" && edge.childId === "muhammad"));
  assert.equal(edges.some(edge => edge.parentId === "yakub" && edge.childId === "mansur"), false);
  const siblingMidpoint = (nodesById.get("ahmad").x + nodesById.get("mansur").x) / 2;
  assert.equal(nodesById.get("abdul-khamid").x, siblingMidpoint,
    "a parent card should sit over the center of its children's cards");
  assert.notEqual(nodesById.get("yakub").x, nodesById.get("mansur").x,
    "a person in a separate branch must not appear directly above Mansur");

  const myPath = buildExportPreview({ ...normalized.settings, scopeType: "path" }, normalized.tree.people);
  assert.deepEqual(myPath.story.people.map(person => person.id), ["ancestor", "abdul-khamid", "mansur"]);
});
