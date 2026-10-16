import test from "node:test";
import assert from "node:assert/strict";
import { excludePagePersonIds, getPagePersonIds, restorePageExclusions, snapPlacementToPeers } from "./workspace-editing.mjs";

test("getPagePersonIds returns only people currently placed on the requested sheet", () => {
  const layout = {
    placements: [
      { person: { id: "root" }, pageNumber: 1 },
      { person: { id: "child-a" }, pageNumber: 2 },
      { person: { id: "child-b" }, pageNumber: 2 }
    ]
  };

  assert.deepEqual(getPagePersonIds(layout, 2), ["child-a", "child-b"]);
  assert.deepEqual(getPagePersonIds(layout, 3), []);
});

test("excluding a sheet keeps prior exclusions and only adds its placed people", () => {
  const layout = {
    placements: [
      { person: { id: "root" }, pageNumber: 1 },
      { person: { id: "child-a" }, pageNumber: 2 },
      { person: { id: "child-b" }, pageNumber: 2 }
    ]
  };
  const previous = new Set(["already-excluded"]);
  const next = excludePagePersonIds(previous, layout, 2);

  assert.deepEqual([...next].sort(), ["already-excluded", "child-a", "child-b"]);
  assert.deepEqual([...previous], ["already-excluded"]);
});

test("sheet exclusions restore only for the same print scope and valid people", () => {
  assert.deepEqual(
    [...restorePageExclusions(["person-a", "stale-person"], "scope-a", "scope-a", new Set(["person-a"]))],
    ["person-a"]
  );
  assert.deepEqual([...restorePageExclusions(["person-a"], "scope-a", "scope-b", new Set(["person-a"]))], []);
});

test("snapPlacementToPeers aligns card centers and returns visible guide coordinates", () => {
  const result = snapPlacementToPeers(
    { x: 33, y: 21, width: 20, height: 10 },
    [{ x: 35, y: 20, width: 20, height: 10 }],
    3
  );

  assert.equal(result.x, 35);
  assert.equal(result.y, 20);
  assert.deepEqual(result.guides, { x: 45, y: 25 });
});

test("snapPlacementToPeers leaves a card alone outside the snap threshold", () => {
  const result = snapPlacementToPeers(
    { x: 28, y: 40, width: 20, height: 10 },
    [{ x: 35, y: 20, width: 20, height: 10 }],
    2
  );

  assert.equal(result.x, 28);
  assert.equal(result.y, 40);
  assert.deepEqual(result.guides, {});
});
