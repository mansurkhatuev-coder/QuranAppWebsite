import test from "node:test";
import assert from "node:assert/strict";
import { searchVideoPeople } from "./person-search.mjs";

const people = [
  { id: "abdul-khamid", name: "Абдул-Хьамид", generation: 12, born: 1952, died: 2011 },
  { id: "mansur", name: "Мансур", parentName: "Абдул-Хьамид", generation: 13, born: 1999, died: null },
  { id: "mukhammad-mansur", name: "Мухьаммад", generation: 14, born: 2026, died: null }
];

test("video person search matches names, generations, dates, and IDs without case sensitivity", () => {
  assert.deepEqual(searchVideoPeople(people, "МАНСУР").people.map(person => person.id), ["mansur"]);
  assert.deepEqual(searchVideoPeople(people, "поколение 12").people.map(person => person.id), ["abdul-khamid"]);
  assert.deepEqual(searchVideoPeople(people, "1952").people.map(person => person.id), ["abdul-khamid"]);
  assert.deepEqual(searchVideoPeople(people, "mukhammad-mansur").people.map(person => person.id), ["mukhammad-mansur"]);
  assert.deepEqual(searchVideoPeople(people, "хьамид").people.map(person => person.id), ["abdul-khamid", "mansur"]);
});

test("video person search limits visible options while preserving the total match count", () => {
  const manyPeople = Array.from({ length: 45 }, (_, index) => ({
    id: `person-${index}`,
    name: `Человек ${index}`,
    generation: 1
  }));

  assert.deepEqual(searchVideoPeople(manyPeople, "человек", { limit: 12 }), {
    people: manyPeople.slice(0, 12),
    total: 45
  });
});
