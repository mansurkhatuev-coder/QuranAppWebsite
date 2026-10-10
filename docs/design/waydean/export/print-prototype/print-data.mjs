import { PROTOTYPE_PEOPLE } from "../../fixtures/prototype-people.mjs";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const mayReadHoti = typeof window !== "undefined" && LOOPBACK_HOSTS.has(window.location.hostname);
const HOTI_TREE_URL = new URL("../../../../../drewo/family-tree.json", import.meta.url);

function normalizeYear(value) {
  if (value == null || value === "") return null;
  const year = Number(value);
  return Number.isFinite(year) ? year : null;
}

async function loadLocalHotiPeople() {
  if (!mayReadHoti) return [];

  try {
    const response = await fetch(HOTI_TREE_URL, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) return [];
    const root = await response.json();
    if (!root || typeof root !== "object" || Array.isArray(root)) return [];

    const people = [];
    const seen = new Set();
    function visit(person, parent, generation) {
      if (!person || typeof person !== "object" || Array.isArray(person)) return;
      const id = String(person.id ?? "").trim();
      if (!id || seen.has(id)) return;
      seen.add(id);

      const hasPhoto = person.photo != null && person.photo !== false && String(person.photo).trim() !== "";
      people.push({
        id,
        name: String(person.name ?? "").trim().replace(/1/g, "I") || "Без имени",
        born: normalizeYear(person.born),
        died: normalizeYear(person.died),
        parent,
        generation,
        photo: hasPhoto,
        photoUrl: hasPhoto
          ? new URL(`../../../../../drewo/photos/${encodeURIComponent(id)}-thumb.jpg`, import.meta.url).href
          : null
      });

      const children = Array.isArray(person.sons) ? person.sons : [];
      children.forEach(child => visit(child, id, generation + 1));
    }

    visit(root, null, 1);
    return people;
  } catch {
    return [];
  }
}

const HOTI_PEOPLE = await loadLocalHotiPeople();

const DEMO_BRANCH_LABELS = Object.freeze({
  main: "Основная линия",
  west: "Западная ветвь",
  east: "Восточная ветвь"
});

function getGenerationCount(people) {
  return new Set(people.map(person => Number(person.generation)).filter(Number.isFinite)).size;
}

function getParentLinkCount(people) {
  const ids = new Set(people.map(person => person.id));
  return people.reduce((count, person) => count + Number(ids.has(person.parent)), 0);
}

function getBranchLabels(people, source) {
  if (source === "hoti") {
    const parentIds = new Set(people.map(person => person.parent).filter(Boolean));
    return Object.fromEntries(people
      .filter(person => parentIds.has(person.id))
      .map(person => [person.id, `Линия ${person.name}`]));
  }

  const labels = new Map();
  for (const person of people) {
    if (!person.branch || labels.has(person.branch)) continue;
    if (source === "demo") {
      labels.set(person.branch, DEMO_BRANCH_LABELS[person.branch] ?? `Линия ${person.branch}`);
    } else if (person.branch === "stem") {
      labels.set(person.branch, "Основной ствол");
    } else {
      labels.set(person.branch, `Линия ${person.name}`);
    }
  }
  return Object.fromEntries(labels);
}

function createSource(id, people, label) {
  const printPeople = people.map(person => ({
    ...person,
    photoUrl: person.photoUrl ?? (id === "demo" && person.photo ? `../${person.photo}` : null)
  }));

  return Object.freeze({
    id,
    label,
    people: printPeople,
    personCount: printPeople.length,
    generationCount: getGenerationCount(printPeople),
    parentLinkCount: getParentLinkCount(printPeople),
    branchLabels: getBranchLabels(printPeople, id)
  });
}

const SOURCES = Object.freeze({
  demo: createSource("demo", PROTOTYPE_PEOPLE, "Демонстрационное дерево · 12 человек"),
  hoti: createSource("hoti", HOTI_PEOPLE, "HOTI · локальный снимок, только чтение")
});

export function getPrintTreeSource(id = "demo") {
  return id === "hoti" && HOTI_PEOPLE.length ? SOURCES.hoti : SOURCES.demo;
}
