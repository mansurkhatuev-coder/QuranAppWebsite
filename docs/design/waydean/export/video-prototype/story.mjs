const SCOPE_TYPES = new Set(["all", "branch", "path"]);
export const GENERATION_INTERVAL_ESTIMATE_YEARS = 27;

function orderPeople(people) {
  const order = new Map(people.map((person, index) => [person.id, index]));
  return [...people].sort((a, b) => {
    const generationDifference = Number(a.generation ?? 0) - Number(b.generation ?? 0);
    return generationDifference || order.get(a.id) - order.get(b.id);
  });
}

export function getStoryPeople(people, { scopeType = "all", selectedPersonId } = {}) {
  if (!SCOPE_TYPES.has(scopeType)) return [];
  if (scopeType === "all") return orderPeople(people);

  const peopleById = new Map(people.map(person => [person.id, person]));
  if (!peopleById.has(selectedPersonId)) return [];

  if (scopeType === "path") {
    const path = [];
    const visited = new Set();
    let person = peopleById.get(selectedPersonId);
    while (person && !visited.has(person.id)) {
      visited.add(person.id);
      path.unshift(person);
      person = person.parent ? peopleById.get(person.parent) : null;
    }
    return orderPeople(path);
  }

  const childrenByParent = new Map();
  for (const person of people) {
    if (!person.parent) continue;
    const children = childrenByParent.get(person.parent) ?? [];
    children.push(person);
    childrenByParent.set(person.parent, children);
  }

  const branch = [];
  const visited = new Set();
  const pending = [peopleById.get(selectedPersonId)];
  while (pending.length) {
    const person = pending.shift();
    if (!person || visited.has(person.id)) continue;
    visited.add(person.id);
    branch.push(person);
    pending.push(...(childrenByParent.get(person.id) ?? []));
  }
  return orderPeople(branch);
}

export function formatLifeDates(person, { includeDates = true } = {}) {
  if (!includeDates) return "";
  const born = person.born == null ? null : String(person.born);
  const died = person.died == null ? null : String(person.died);
  if (born && died) return `${born} — ${died}`;
  if (born) return `род. ${born}`;
  if (died) return `ум. ${died}`;
  return "Даты не указаны";
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function getGenerationDateExcerpt(people, generation, {
  intervalYears = GENERATION_INTERVAL_ESTIMATE_YEARS,
  latestGenerationYear = 2026
} = {}) {
  const records = Array.isArray(people) ? people : [];
  const targetGeneration = Number(generation);
  if (!Number.isFinite(targetGeneration)) return "";

  const yearsByGeneration = new Map();
  for (const person of records) {
    const personGeneration = Number(person.generation ?? 0);
    const born = person.born == null ? Number.NaN : Number(person.born);
    if (!Number.isFinite(personGeneration) || !Number.isFinite(born)) continue;
    const years = yearsByGeneration.get(personGeneration) ?? [];
    years.push(born);
    yearsByGeneration.set(personGeneration, years);
  }

  const knownYears = yearsByGeneration.get(targetGeneration) ?? [];
  if (knownYears.length) {
    const first = Math.min(...knownYears);
    const last = Math.max(...knownYears);
    return `Известные годы: ${first}${first === last ? "" : `–${last}`}`;
  }

  const datedGenerations = [...yearsByGeneration.entries()]
    .map(([personGeneration, years]) => ({ generation: personGeneration, year: median(years) }))
    .sort((left, right) => {
      const distance = Math.abs(left.generation - targetGeneration) - Math.abs(right.generation - targetGeneration);
      return distance || left.generation - right.generation;
    });
  const interval = Math.max(1, Number(intervalYears) || GENERATION_INTERVAL_ESTIMATE_YEARS);
  const anchor = datedGenerations[0];
  const allGenerations = records.map(person => Number(person.generation ?? 0)).filter(Number.isFinite);
  const latestGeneration = allGenerations.length ? Math.max(...allGenerations) : targetGeneration;
  const estimatedYear = anchor
    ? Math.round(anchor.year + (targetGeneration - anchor.generation) * interval)
    : Math.round(Number(latestGenerationYear) + (targetGeneration - latestGeneration) * interval);

  return `Ориентир: ≈${estimatedYear} · шаг ${interval} лет`;
}

export function getReviewWarnings(people) {
  return {
    missingPhotoCount: people.filter(person => !person.photoUrl).length,
    uncertainDateCount: people.filter(person => person.born == null || person.died == null).length,
    longNameIds: people.filter(person => String(person.name ?? "").trim().length > 26).map(person => person.id)
  };
}

export function buildStoryScenes(people, {
  scopeType = "all",
  selectedPersonId,
  includeDates = true,
  title = "История рода"
} = {}) {
  const scopedPeople = getStoryPeople(people, { scopeType, selectedPersonId });
  if (!scopedPeople.length) return [];

  const selectedPerson = scopedPeople.find(person => person.id === selectedPersonId) ?? scopedPeople.at(-1);
  const generations = [...new Set(scopedPeople.map(person => Number(person.generation ?? 0)))].sort((a, b) => a - b);
  const firstGeneration = generations[0];
  const originPeople = scopedPeople.filter(person => Number(person.generation ?? 0) === firstGeneration);
  const scenes = [
    {
      id: "opening",
      type: "opening",
      label: "Пролог",
      title: title.trim() || "История рода",
      caption: "Память, переданная через поколения",
      personIds: []
    },
    {
      id: "origin",
      type: "origin",
      label: scopeType === "branch" ? "Начало ветви" : "Истоки рода",
      title: scopeType === "branch" ? "Начало выбранной ветви" : "Старший известный предок",
      ...(includeDates ? { caption: getGenerationDateExcerpt(people, firstGeneration) } : {}),
      personIds: originPeople.map(person => person.id),
      people: originPeople.map(person => ({ id: person.id, name: person.name, dates: formatLifeDates(person, { includeDates }) }))
    }
  ];

  for (const generation of generations.slice(1)) {
    const generationPeople = scopedPeople.filter(person => Number(person.generation ?? 0) === generation);
    const groups = [];
    for (let index = 0; index < generationPeople.length; index += 3) groups.push(generationPeople.slice(index, index + 3));
    groups.forEach((group, index) => {
      const hasParts = groups.length > 1;
      scenes.push({
        id: hasParts ? `generation-${generation}-part-${index + 1}` : `generation-${generation}`,
        type: "generation",
        generation,
        label: hasParts ? `Поколение ${generation} · часть ${index + 1}` : `Поколение ${generation}`,
        title: `Поколение ${generation}`,
        ...(includeDates ? { caption: getGenerationDateExcerpt(people, generation) } : {}),
        groupStart: index * 3 + 1,
        groupEnd: index * 3 + group.length,
        groupTotal: generationPeople.length,
        personIds: group.map(person => person.id),
        people: group.map(person => ({ id: person.id, name: person.name, dates: formatLifeDates(person, { includeDates }) }))
      });
    });
  }

  const scopedIds = new Set(scopedPeople.map(person => person.id));
  const childrenByParent = new Map();
  for (const person of scopedPeople) {
    if (!person.parent || !scopedIds.has(person.parent)) continue;
    const children = childrenByParent.get(person.parent) ?? [];
    children.push(person.id);
    childrenByParent.set(person.parent, children);
  }
  const branches = [...childrenByParent.entries()]
    .filter(([, childIds]) => childIds.length > 1)
    .map(([parentId, childIds]) => ({ parentId, childIds }));

  branches.forEach((branch, index) => {
    const parent = scopedPeople.find(person => person.id === branch.parentId);
    scenes.push({
      id: `branching-${branch.parentId}`,
      type: "branching",
      label: `Ветвь ${index + 1}`,
      title: `От ${parent.name} — к потомкам`,
      personIds: [branch.parentId, ...branch.childIds],
      branches: [branch]
    });
  });

  scenes.push(
    {
      id: "focus",
      type: "focus",
      label: "Главный герой",
      title: "Связь поколений",
      caption: "Путь от старшего предка к потомку",
      personIds: [selectedPerson.id],
      people: [{ id: selectedPerson.id, name: selectedPerson.name, dates: formatLifeDates(selectedPerson, { includeDates }) }]
    },
    {
      id: "finale",
      type: "finale",
      label: "Общий план",
      title: "Древо продолжается",
      caption: `${scopedPeople.length} человек · ${generations.length} поколений`,
      personIds: scopedPeople.map(person => person.id),
      branches: [...childrenByParent.entries()].map(([parentId, childIds]) => ({ parentId, childIds }))
    }
  );

  return scenes;
}
