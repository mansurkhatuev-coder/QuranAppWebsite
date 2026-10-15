export const VIDEO_HANDOFF_KEY = 'waydean.video-export.handoff.v1';

const scopes = new Set(['all', 'path', 'branch']);
const aspectRatios = new Set(['16:9', '9:16', '1:1']);

function nullableYear(value) {
  if (value == null || value === '') return null;
  const year = Number(value);
  return Number.isFinite(year) ? year : null;
}

function renderPerson(person) {
  if (!person || typeof person !== 'object' || Array.isArray(person)) {
    throw new TypeError('Each tree person must be an object');
  }
  const id = String(person.id ?? '').trim();
  if (!id) throw new TypeError('Each tree person must have an ID');

  const rawGeneration = Number(person.generation);
  return {
    id,
    name: String(person.name ?? '').trim() || 'Без имени',
    generation: Number.isFinite(rawGeneration) && rawGeneration > 0 ? Math.trunc(rawGeneration) : 1,
    parentId: person.parentId == null || person.parentId === '' ? null : String(person.parentId),
    born: nullableYear(person.born),
    died: nullableYear(person.died)
  };
}

/** Create a small, same-device-only snapshot for the browser video exporter. */
export function createBrowserVideoHandoff(records, options = {}) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new TypeError('Video export needs a non-empty tree snapshot');
  }

  const people = records.map(renderPerson);
  const ids = new Set(people.map(person => person.id));
  if (ids.size !== people.length) throw new TypeError('Tree snapshot contains duplicate person IDs');

  const scopeType = scopes.has(options.scopeType) ? options.scopeType : 'all';
  const requestedPersonId = options.selectedPersonId == null ? null : String(options.selectedPersonId);
  const selectedPersonId = requestedPersonId && ids.has(requestedPersonId) ? requestedPersonId : null;
  const title = String(options.title ?? '').trim().slice(0, 80) || 'История рода';
  const aspectRatio = aspectRatios.has(options.aspectRatio) ? options.aspectRatio : '16:9';

  return {
    version: 1,
    tree: { people },
    settings: {
      scopeType,
      selectedPersonId,
      title,
      includeDates: options.includeDates === true,
      aspectRatio
    }
  };
}
