import {
  PRINT_HANDOFF_KEY,
  VIDEO_HANDOFF_KEY,
  readExportWorkshopHandoff,
  updateExportWorkshopHandoff,
  writeExportWorkshopHandoff
} from "./workshop-model.mjs?v=shared-export-1";

const tabs = [...document.querySelectorAll('[role="tab"][data-mode]')];
const frame = document.getElementById("workshop-frame");
const error = document.getElementById("workshop-error");
const context = document.getElementById("workshop-context");
const announcer = document.getElementById("workshop-announcer");
const handoff = readExportWorkshopHandoff(window.sessionStorage);
const requestedMode = new URLSearchParams(window.location.search).get("mode");
let activeMode = requestedMode === "video" ? "video" : "print";

function treeReturnHref(value) {
  const url = new URL("/drewo/waydean-preview.html", window.location.href);
  if (value?.returnContext === "account" || value?.returnContext === "family") {
    url.searchParams.set("source", value.returnContext);
  }
  if (value?.treeId === "demo") url.searchParams.set("fixture", "master");
  url.searchParams.set("state", value?.returnView || "all-tree");
  url.searchParams.set("workshopReturn", "1");
  return url.href;
}

function setError(message) {
  error.hidden = !message;
  error.textContent = message;
}

function currentPrintSettings() {
  const document = frame.contentDocument;
  if (!document) return null;
  const scopeType = document.querySelector('[data-scope][aria-pressed="true"]')?.dataset.scope;
  const personId = document.getElementById("personSelect")?.value;
  const branchId = document.getElementById("branchSelect")?.value;
  const direction = document.getElementById("directionSelect")?.value;
  const depth = Number(document.getElementById("depthRange")?.value);
  if (!scopeType || !Number.isFinite(depth)) return null;
  return {
    scopeType,
    ...(scopeType === "person" ? { personId } : {}),
    ...(scopeType === "branch" ? { branchId } : {}),
    direction,
    depth
  };
}

function printSelectionToSharedScope(settings, previous) {
  if (settings.scopeType === "all") return { scopeType: "all", selectedPersonId: previous.selectedPersonId };
  if (settings.scopeType === "branch") return { scopeType: "branch", selectedPersonId: settings.branchId };
  return {
    scopeType: settings.direction === "ancestors" ? "path" : "branch",
    selectedPersonId: settings.personId
  };
}

function currentVideoSettings() {
  const document = frame.contentDocument;
  const videoRoot = document?.getElementById("browser-export-root");
  try {
    const saved = JSON.parse(window.localStorage.getItem("waydean.video-export.settings.v1") ?? "{}");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null;
    return {
      title: document?.getElementById("browser-export-title")?.value ?? saved.title ?? "История рода",
      includeDates: document?.getElementById("browser-export-dates")?.checked ?? (saved.includeDates !== false),
      aspectRatio: document?.querySelector("[data-ratio][aria-pressed='true']")?.dataset.ratio ?? saved.aspectRatio,
      scopeType: videoRoot?.dataset.scopeType ?? saved.scopeType,
      selectedPersonId: videoRoot?.dataset.selectedPersonId ?? saved.selectedPersonId
    };
  } catch {
    return null;
  }
}

function videoSelectionToPrintSettings(scopeType, selectedPersonId, previous) {
  if (scopeType === "all") return { ...previous, scopeType: "all" };
  if (scopeType === "path") {
    return { ...previous, scopeType: "person", personId: selectedPersonId, direction: "ancestors" };
  }
  return { ...previous, scopeType: "branch", branchId: selectedPersonId };
}

function captureActiveSelection() {
  let next = readExportWorkshopHandoff(window.sessionStorage);
  if (!next) throw new Error("Не найден снимок выбранного дерева. Вернитесь к древу и откройте мастерскую ещё раз.");

  if (activeMode === "print") {
    const printSettings = currentPrintSettings();
    if (printSettings) {
      const selection = printSelectionToSharedScope(printSettings, next);
      next = updateExportWorkshopHandoff(next, { ...selection, printSettings });
    }
  } else {
    const videoSettings = currentVideoSettings();
    if (videoSettings) {
      const scopeType = videoSettings.scopeType;
      const selectedPersonId = videoSettings.selectedPersonId;
      const validId = next.video.tree.people.some(person => person.id === selectedPersonId);
      if (["all", "path", "branch"].includes(scopeType) && (scopeType === "all" || validId)) {
        next = updateExportWorkshopHandoff(next, {
          scopeType,
          selectedPersonId: validId ? selectedPersonId : next.selectedPersonId,
          videoSettings,
          printSettings: videoSelectionToPrintSettings(scopeType, validId ? selectedPersonId : next.selectedPersonId, next.print)
        });
      }
    }
  }

  writeExportWorkshopHandoff(window.sessionStorage, next);
  return next;
}

function printFrameUrl(value) {
  const url = new URL("./print-prototype/", window.location.href);
  url.searchParams.set("tree", value.treeId);
  url.searchParams.set("scope", value.print.scope);
  url.searchParams.set("direction", value.print.direction);
  url.searchParams.set("depth", String(value.print.depth));
  url.searchParams.set("workshop", "1");
  return url.href;
}

function videoFrameUrl(value) {
  const url = new URL("./video-prototype/browser-export.html", window.location.href);
  url.searchParams.set("source", "tree");
  url.searchParams.set("workshop", "1");
  return url.href;
}

function seedFrameHandoffs(value) {
  window.sessionStorage.setItem(PRINT_HANDOFF_KEY, JSON.stringify(value.print));
  window.sessionStorage.setItem(VIDEO_HANDOFF_KEY, JSON.stringify(value.video));
}

function activateMode(nextMode, { capture = true, focus = false } = {}) {
  if (!handoff || !["video", "print"].includes(nextMode)) return;
  let current = handoff;
  try {
    if (capture) current = captureActiveSelection();
    seedFrameHandoffs(current);
  } catch (cause) {
    setError(cause?.message || "Не удалось сохранить параметры мастерской. Попробуйте ещё раз.");
    return;
  }

  activeMode = nextMode;
  tabs.forEach(tab => {
    const selected = tab.dataset.mode === nextMode;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  frame.title = nextMode === "video" ? "Создание видео семейного древа" : "Настройка печатного макета семейного древа";
  frame.src = nextMode === "video" ? videoFrameUrl(current) : printFrameUrl(current);
  setError("");
  const url = new URL(window.location.href);
  url.searchParams.set("mode", nextMode);
  window.history.replaceState(window.history.state, "", url);
  announcer.textContent = nextMode === "video" ? "Открыт экспорт видео" : "Открыт печатный макет";
  if (focus) tabs.find(tab => tab.dataset.mode === nextMode)?.focus();
}

function handleTabKeydown(event) {
  if (!event.key.startsWith("Arrow")) return;
  event.preventDefault();
  const nextIndex = (tabs.indexOf(event.currentTarget) + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
  tabs[nextIndex].focus();
  activateMode(tabs[nextIndex].dataset.mode, { focus: false });
}

document.getElementById("workshop-back").href = treeReturnHref(handoff);
document.querySelector(".workshop-brand").href = treeReturnHref(handoff);
context.textContent = handoff
  ? `${handoff.selectedPersonName || "Семейное дерево"} · ${handoff.video.tree.people.length} записей · параметры общие для печати и видео`
  : "Нет данных текущего дерева";

tabs.forEach(tab => {
  tab.addEventListener("click", () => activateMode(tab.dataset.mode));
  tab.addEventListener("keydown", handleTabKeydown);
});
frame.addEventListener("load", () => setError(""));

if (!handoff) {
  frame.hidden = true;
  setError("Не удалось получить снимок семейного древа для экспорта. Вернитесь к древу и откройте мастерскую ещё раз.");
} else {
  document.querySelector(".workshop-tabs").hidden = false;
  activateMode(activeMode, { capture: false });
}
