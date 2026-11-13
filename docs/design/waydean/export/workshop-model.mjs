import { createBrowserVideoHandoff, VIDEO_HANDOFF_KEY } from "../../../../drewo/waydean-preview-video-handoff.mjs";

export const EXPORT_WORKSHOP_HANDOFF_KEY = "waydean.export-workshop.handoff.v1";
export const PRINT_HANDOFF_KEY = "waydean.print-handoff.v1";
export { VIDEO_HANDOFF_KEY };

const TREE_IDS = new Set(["demo", "hoti", "drewo-reklama"]);
const SCOPE_TYPES = new Set(["all", "path", "branch"]);
const RETURN_CONTEXTS = new Set(["account", "family", "preview"]);
const RETURN_VIEWS = new Set(["path", "branch", "all-tree"]);
const PRINT_DIRECTIONS = new Set(["both", "ancestors", "descendants"]);
const MAX_DEPTH = 30;

function normalizeDepth(value, fallback = 5) {
  const depth = Number(value);
  return Number.isFinite(depth) ? Math.min(MAX_DEPTH, Math.max(1, Math.trunc(depth))) : fallback;
}

function normalizeTreePeople(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 5000) return null;
  return value.map(person => ({
    id: String(person?.id ?? "").trim(),
    name: String(person?.name ?? "").trim(),
    generation: Number(person?.generation),
    parentId: person?.parentId == null ? null : String(person.parentId),
    born: person?.born ?? null,
    died: person?.died ?? null
  }));
}

function normalizePrintPeople(value, videoPeople) {
  const rows = Array.isArray(value) ? value : videoPeople;
  if (rows.length !== videoPeople.length) return null;
  const expectedIds = new Set(videoPeople.map(person => person.id));
  const normalized = rows.map(person => ({
    id: String(person?.id ?? "").trim(),
    name: String(person?.name ?? "").trim(),
    generation: Number(person?.generation),
    parentId: person?.parentId == null ? null : String(person.parentId),
    born: person?.born ?? null,
    died: person?.died ?? null,
    teip: String(person?.teip ?? "").slice(0, 80),
    photoKey: person?.photoKey == null ? null : String(person.photoKey).slice(0, 120),
    hasPhoto: person?.hasPhoto === true || person?.photo === true
  }));
  if (normalized.some(person => !expectedIds.has(person.id) || !person.name)) return null;
  return normalized;
}

function normalizeWorkshopHandoff(value) {
  if (!value || typeof value !== "object" || value.version !== 1 || !TREE_IDS.has(value.treeId)) return null;
  const people = normalizeTreePeople(value.video?.tree?.people);
  if (!people || people.some(person => !person.id || !person.name)) return null;
  const printPeople = normalizePrintPeople(value.printPeople, people);
  if (!printPeople) return null;
  const ids = new Set(people.map(person => person.id));
  if (ids.size !== people.length) return null;

  const scopeType = SCOPE_TYPES.has(value.scopeType) ? value.scopeType : null;
  const selectedPersonId = ids.has(String(value.selectedPersonId ?? "")) ? String(value.selectedPersonId) : null;
  const returnPersonId = ids.has(String(value.returnPersonId ?? "")) ? String(value.returnPersonId) : null;
  const returnView = RETURN_VIEWS.has(value.returnView) ? value.returnView : "all-tree";
  const returnContext = RETURN_CONTEXTS.has(value.returnContext) ? value.returnContext : null;
  if (!scopeType || !returnContext || (scopeType !== "all" && !selectedPersonId)) return null;

  const print = value.print;
  if (!print || print.tree !== value.treeId || !["all", "person", "branch"].includes(print.scope)) return null;
  const printPersonId = print.personId == null ? null : String(print.personId);
  const printBranchId = print.branchId == null ? null : String(print.branchId);
  const direction = PRINT_DIRECTIONS.has(print.direction) ? print.direction : "both";
  const printDepth = normalizeDepth(print.depth);
  if (print.scope === "person" && (!printPersonId || !ids.has(printPersonId))) return null;
  if (print.scope === "branch" && (!printBranchId || !ids.has(printBranchId))) return null;

  let video;
  try {
    video = createBrowserVideoHandoff(people, {
      scopeType,
      selectedPersonId,
      title: String(value.video?.settings?.title ?? "История рода").slice(0, 80),
      includeDates: value.video?.settings?.includeDates !== false,
      aspectRatio: value.video?.settings?.aspectRatio
    });
  } catch {
    return null;
  }

  return {
    version: 1,
    treeId: value.treeId,
    scopeType,
    selectedPersonId,
    selectedPersonName: String(value.selectedPersonName ?? people.find(person => person.id === selectedPersonId)?.name ?? "").slice(0, 120),
    returnContext,
    returnView,
    ...(returnPersonId ? { returnPersonId } : {}),
    printPeople,
    print: {
      tree: value.treeId,
      scope: print.scope,
      ...(printPersonId ? { personId: printPersonId } : {}),
      ...(printBranchId ? { branchId: printBranchId } : {}),
      direction,
      depth: printDepth
    },
    video
  };
}

export function createExportWorkshopHandoff(records, options = {}) {
  const treeId = String(options.treeId ?? "");
  if (!TREE_IDS.has(treeId)) throw new TypeError("Export workshop tree must be demo, hoti, or drewo-reklama");
  if (!Array.isArray(records) || records.length === 0 || records.length > 5000) {
    throw new TypeError("Export workshop needs a non-empty tree snapshot");
  }

  const ids = new Set(records.map(person => String(person?.id ?? "").trim()).filter(Boolean));
  if (ids.size !== records.length) throw new TypeError("Export workshop tree contains invalid or duplicate IDs");
  const scopeType = SCOPE_TYPES.has(options.scopeType) ? options.scopeType : "all";
  const selectedPersonId = ids.has(String(options.selectedPersonId ?? ""))
    ? String(options.selectedPersonId)
    : String(records.at(-1).id);
  const returnContext = RETURN_CONTEXTS.has(options.returnContext) ? options.returnContext : "preview";
  const suppliedPrint = options.printSettings && typeof options.printSettings === "object" ? options.printSettings : null;
  const printScope = suppliedPrint?.scopeType ?? (scopeType === "all" ? "all" : scopeType === "branch" ? "branch" : "person");
  const print = printScope === "all"
    ? { tree: treeId, scope: "all", direction: "both", depth: normalizeDepth(suppliedPrint?.depth ?? options.depth, 5) }
    : printScope === "branch"
      ? {
          tree: treeId,
          scope: "branch",
          branchId: ids.has(String(suppliedPrint?.branchId ?? "")) ? String(suppliedPrint.branchId) : selectedPersonId,
          direction: "both",
          depth: normalizeDepth(suppliedPrint?.depth ?? options.depth, 5)
        }
      : {
          tree: treeId,
          scope: "person",
          personId: ids.has(String(suppliedPrint?.personId ?? "")) ? String(suppliedPrint.personId) : selectedPersonId,
          direction: PRINT_DIRECTIONS.has(suppliedPrint?.direction)
            ? suppliedPrint.direction
            : scopeType === "path" ? "ancestors" : "both",
          depth: normalizeDepth(suppliedPrint?.depth ?? options.depth, scopeType === "path" ? 30 : 5)
        };
  const video = createBrowserVideoHandoff(records, {
    scopeType,
    selectedPersonId,
    title: options.videoSettings?.title ?? options.title ?? "История рода",
    includeDates: (options.videoSettings?.includeDates ?? options.includeDates) !== false,
    aspectRatio: options.videoSettings?.aspectRatio ?? options.aspectRatio ?? "16:9"
  });
  const printPeople = (Array.isArray(options.printPeople) ? options.printPeople : records).map(person => ({
    id: String(person.id),
    name: String(person.name ?? "Без имени").trim() || "Без имени",
    generation: Number(person.generation),
    parentId: person.parentId == null ? null : String(person.parentId),
    born: person.born ?? null,
    died: person.died ?? null,
    teip: String(person.teip ?? "").slice(0, 80),
    photoKey: person.photoKey == null ? null : String(person.photoKey).slice(0, 120),
    hasPhoto: person.hasPhoto === true || person.photo === true
  }));

  return normalizeWorkshopHandoff({
    version: 1,
    treeId,
    scopeType,
    selectedPersonId,
    selectedPersonName: records.find(person => String(person.id) === selectedPersonId)?.name ?? "",
    returnContext,
    returnView: RETURN_VIEWS.has(options.returnView) ? options.returnView : "all-tree",
    ...(ids.has(String(options.returnPersonId ?? "")) ? { returnPersonId: String(options.returnPersonId) } : {}),
    printPeople,
    print,
    video
  });
}

export function updateExportWorkshopHandoff(handoff, patch = {}) {
  const people = handoff?.video?.tree?.people;
  return createExportWorkshopHandoff(people, {
    treeId: handoff?.treeId,
    scopeType: patch.scopeType ?? handoff?.scopeType,
    selectedPersonId: patch.selectedPersonId ?? handoff?.selectedPersonId,
    returnContext: handoff?.returnContext,
    returnView: handoff?.returnView,
    returnPersonId: handoff?.returnPersonId,
    printSettings: patch.printSettings ?? handoff?.print,
    videoSettings: patch.videoSettings ?? handoff?.video?.settings,
    printPeople: handoff?.printPeople,
    depth: handoff?.print?.depth
  });
}

export function writeExportWorkshopHandoff(storage, handoff) {
  if (!storage || typeof storage.setItem !== "function") {
    throw new TypeError("Export workshop session storage is unavailable");
  }
  const normalized = normalizeWorkshopHandoff(handoff);
  if (!normalized) throw new TypeError("Export workshop handoff is invalid");
  storage.setItem(EXPORT_WORKSHOP_HANDOFF_KEY, JSON.stringify(normalized));
  return normalized;
}

export function readExportWorkshopHandoff(storage) {
  try {
    const raw = storage?.getItem?.(EXPORT_WORKSHOP_HANDOFF_KEY);
    return raw ? normalizeWorkshopHandoff(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
