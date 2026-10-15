import test from "node:test";
import assert from "node:assert/strict";
import { HOTI_PEOPLE } from "./hoti-people.mjs";
import { buildStoryScenes, formatLifeDates, getGenerationDateExcerpt } from "./story.mjs";

test("life date labels show known years without an unknown-year question mark", () => {
  assert.equal(formatLifeDates({ born: 1999, died: null }), "род. 1999");
  assert.equal(formatLifeDates({ born: null, died: 1850 }), "ум. 1850");
  assert.equal(formatLifeDates({ born: 1999, died: 2024 }), "1999 — 2024");
  assert.equal(formatLifeDates({ born: null, died: null }), "Даты не указаны");
});

test("generation date excerpts use known birth years and clearly mark 27-year estimates", () => {
  const people = [
    { id: "grandfather", name: "Отец", generation: 1, parent: null, born: null, died: null },
    { id: "mansur", name: "Мансур", generation: 2, parent: "grandfather", born: 1999, died: null },
    { id: "son", name: "Сын", generation: 3, parent: "mansur", born: 2026, died: null }
  ];

  assert.equal(getGenerationDateExcerpt(people, 1), "Ориентир: ≈1972 · шаг 27 лет");
  assert.equal(getGenerationDateExcerpt(people, 2), "Известные годы: 1999");
  assert.equal(getGenerationDateExcerpt(people, 3), "Известные годы: 2026");

  const scenes = buildStoryScenes(people, { scopeType: "all", selectedPersonId: "son" });
  assert.equal(scenes.find(scene => scene.type === "origin").caption, "Ориентир: ≈1972 · шаг 27 лет");
  assert.equal(scenes.find(scene => scene.type === "generation" && scene.generation === 2).caption, "Известные годы: 1999");
  assert.equal(scenes.find(scene => scene.type === "generation" && scene.generation === 3).caption, "Известные годы: 2026");
});

test("generation date captions disappear when dates are disabled", () => {
  const people = [
    { id: "mansur", name: "Мансур", generation: 1, parent: null, born: 1999, died: null },
    { id: "son", name: "Сын", generation: 2, parent: "mansur", born: 2026, died: null }
  ];
  const scenes = buildStoryScenes(people, { scopeType: "all", selectedPersonId: "son", includeDates: false });

  assert.equal(scenes.find(scene => scene.type === "origin").caption, undefined);
  assert.equal(scenes.find(scene => scene.type === "generation").caption, undefined);
});

test("video preserves Abdul-Khamid's real dates and uses his birth year for nearby estimates", () => {
  const person = HOTI_PEOPLE.find(record => record.id === "abdul-khamid");
  const scenes = buildStoryScenes(HOTI_PEOPLE, { scopeType: "path", selectedPersonId: "mansur" });
  const scenePerson = scenes.flatMap(scene => scene.people ?? []).find(record => record.id === "abdul-khamid");
  const precedingGeneration = scenes.find(scene => scene.type === "generation" && scene.generation === 11);

  assert.equal(person?.born, 1952);
  assert.equal(person?.died, 2011);
  assert.equal(scenePerson?.dates, "1952 — 2011");
  assert.equal(precedingGeneration?.caption, "Ориентир: ≈1925 · шаг 27 лет");
});
