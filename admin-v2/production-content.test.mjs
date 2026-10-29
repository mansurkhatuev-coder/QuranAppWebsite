import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { buildDuaPublication } = require("./production-content.js");

test("Dua publication preserves records and increments the live manifest versions", () => {
  const support = { id: "support-1", category: "support_dua", text: "نَصّ", title: "Дуа", tags: ["one"] };
  const general = { id: "general-1", category: "general_dua", text: "نَصّ ٢", title: "Азкар" };
  const result = buildDuaPublication([support, general], {
    version: 8,
    packs: {
      support_dua: { version: 3, url: "/data/support-dua.json" },
      general_dua: { version: 5, url: "/data/general-dua.json" },
    },
  }, "2026-10-29T12:30:00.000Z");

  assert.deepEqual(result.supportDua, [support]);
  assert.deepEqual(result.generalDua, [general]);
  assert.deepEqual(result.manifest, {
    version: 9,
    publishedAt: "2026-10-29T12:30:00.000Z",
    packs: {
      support_dua: { version: 4, url: "/data/support-dua.json", itemCount: 1 },
      general_dua: { version: 6, url: "/data/general-dua.json", itemCount: 1 },
    },
  });
  assert.deepEqual(support.tags, ["one"]);
});

test("Dua publication refuses missing IDs, blank Arabic text, unsupported kinds, and duplicate IDs", () => {
  for (const records of [
    [{ category: "support_dua", text: "نَصّ" }],
    [{ id: "x", category: "support_dua", text: "  " }],
    [{ id: "x", category: "azkar", text: "نَصّ" }],
    [
      { id: "x", category: "support_dua", text: "نَصّ" },
      { id: "x", category: "general_dua", text: "نَصّ" },
    ],
  ]) assert.throws(() => buildDuaPublication(records, null, "2026-10-29T12:30:00.000Z"));
});
