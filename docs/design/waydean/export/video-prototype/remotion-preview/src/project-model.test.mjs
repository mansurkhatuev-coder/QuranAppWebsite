import test from "node:test";
import assert from "node:assert/strict";
import { formatPersonDateLabel, getTreeViewportOpacity } from "./project-model.mjs";

test("video person labels show a known birth without an unknown death marker", () => {
  assert.equal(formatPersonDateLabel({ born: 1999, died: null }), "род. 1999");
  assert.equal(formatPersonDateLabel({ born: null, died: 1850 }), "ум. 1850");
  assert.equal(formatPersonDateLabel({ born: 1999, died: 2024 }), "1999 — 2024");
  assert.equal(formatPersonDateLabel({ born: null, died: null }), "даты неизвестны");
  assert.equal(formatPersonDateLabel({ born: 1999, died: null }, false), "");
});

test("full-tree video keeps context cards visible until the frame clips them", () => {
  const viewport = { width: 100, height: 100 };
  const cardAtFrameEdge = { left: -2, top: 35, right: 28, bottom: 65 };

  assert.equal(getTreeViewportOpacity("all", 1, cardAtFrameEdge, viewport, 1), 1);
  assert.equal(getTreeViewportOpacity("path", 0.26, cardAtFrameEdge, viewport, 1), 0);
});
