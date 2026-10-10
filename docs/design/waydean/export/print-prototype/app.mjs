import { getPrintTreeSource } from "./print-data.mjs";
import { buildPrintLayout, getScopedPeople, recommendPaper } from "./layout.mjs";
import { getPrintPageRule } from "./print-page-size.mjs";
import { embedSvgImageAssets } from "./svg-photo-embed.mjs";

const layoutOptions = {
  marginMm: 12,
  topMarginMm: 38,
  bottomMarginMm: 16,
  nodeWidthMm: 48,
  nodeHeightMm: 34,
  columnGapMm: 18,
  rowGapMm: 10
};

const elements = Object.fromEntries([
  "treeSource", "personSelect", "branchSelect", "personLabel", "branchLabel", "directionSelect", "directionLabel",
  "depthRange", "depthValue", "includePhotos", "includeDates", "includeTitle", "treeTitle", "paperSize", "orientation",
  "autoFormat", "recommendedFormat", "recommendationReason", "applyRecommendation", "paperPreview", "paperStage",
  "previousPage", "nextPage", "pageCounter", "fitPreview", "zoomOut", "zoomValue", "zoomIn", "pageGrid", "tileCount", "tileHint", "personCount",
  "generationCount", "sheetCount", "scopeSummary", "exportStatus", "downloadSvg", "printPdf", "printPages", "privacyCopy"
].map(id => [id, document.getElementById(id)]));

const printHandoffKey = "waydean.print-handoff.v1";
function takePrintHandoff() {
  try {
    const stored = window.sessionStorage.getItem(printHandoffKey);
    window.sessionStorage.removeItem(printHandoffKey);
    const handoff = stored ? JSON.parse(stored) : null;
    return handoff && typeof handoff === "object" ? handoff : null;
  } catch {
    try { window.sessionStorage.removeItem(printHandoffKey); } catch { /* storage can be disabled */ }
    return null;
  }
}

const requestedRoute = new URLSearchParams(window.location.search);
const requestedSource = requestedRoute.get("tree");
const storedHandoff = takePrintHandoff();
const requestedHandoff = storedHandoff?.tree === (requestedSource ?? "demo") ? storedHandoff : null;
const requestedScope = ["person", "branch", "all"].includes(requestedRoute.get("scope"))
  ? requestedRoute.get("scope")
  : ["person", "branch", "all"].includes(requestedHandoff?.scope) ? requestedHandoff.scope : null;
const initialSource = getPrintTreeSource(requestedSource);
const state = {
  scopeType: requestedScope ?? (initialSource.id === "hoti" ? "all" : "person"),
  pageNumber: 1,
  workspaceZoom: 0,
  workspaceZoomMode: "page",
  workspaceBoardKey: "",
  currentLayout: null,
  currentPeople: [],
  currentSvg: "",
  personEdits: new Map(),
  placementEdits: new Map(),
  source: initialSource
};
let requestedRouteFallback = false;

function escapeXml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
  })[character]);
}

function wrapWords(value, maxCharacters) {
  const words = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (word.length > maxCharacters) {
      if (current) lines.push(current);
      current = "";
      for (let offset = 0; offset < word.length; offset += maxCharacters) lines.push(word.slice(offset, offset + maxCharacters));
      continue;
    }
    if (!current) current = word;
    else if ((current + " " + word).length <= maxCharacters) current += " " + word;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function formatYears(person) {
  if (person.born && person.died) return String(person.born) + "–" + String(person.died);
  if (person.born) return "с " + String(person.born);
  if (person.died) return "до " + String(person.died);
  return "";
}

function getCurrentScope() {
  const depth = Number(elements.depthRange.value);
  if (state.scopeType === "all") return { type: "all" };
  if (state.scopeType === "branch") return { type: "branch", branchId: elements.branchSelect.value, depth };
  return { type: "person", rootId: elements.personSelect.value, direction: elements.directionSelect.value, depth };
}

function getScopeDescription(people) {
  if (state.scopeType === "all") return "Все доступное дерево · " + people.length + " записей";
  if (state.scopeType === "branch") return (state.source.branchLabels[elements.branchSelect.value] || "Выбранная ветвь") + " · глубина " + elements.depthRange.value + " поколений";
  const person = state.source.people.find(item => item.id === elements.personSelect.value);
  const direction = elements.directionSelect.value === "ancestors" ? "старшие поколения" : elements.directionSelect.value === "both" ? "предки и потомки" : "потомки";
  return (person ? person.name : "Выбранный человек") + " · " + direction + " · " + elements.depthRange.value + " поколений";
}

function getSelectedId(people) {
  if (state.scopeType === "person") return elements.personSelect.value;
  if (state.scopeType === "branch") {
    return [...people].sort((a, b) => a.generation - b.generation)[0]?.id ?? null;
  }
  return [...people].sort((a, b) => a.generation - b.generation)[0]?.id ?? null;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function getWorkspacePoint(placement, layout = state.currentLayout) {
  return {
    x: placement.pageX * layout.pageWidthMm + placement.xMm,
    y: placement.pageY * layout.pageHeightMm + placement.yMm
  };
}

function placeInWorkspace(layout, placement, x, y) {
  const pageX = clamp(Math.floor((x + placement.widthMm / 2) / layout.pageWidthMm), 0, layout.pageCountX - 1);
  const pageY = clamp(Math.floor((y + placement.heightMm / 2) / layout.pageHeightMm), 0, layout.pageCountY - 1);
  const localX = clamp(x - pageX * layout.pageWidthMm, layout.leftMarginMm, layout.pageWidthMm - layout.rightMarginMm - placement.widthMm);
  const localY = clamp(y - pageY * layout.pageHeightMm, layout.topMarginMm, layout.pageHeightMm - layout.bottomMarginMm - placement.heightMm);
  return {
    pageX,
    pageY,
    pageNumber: pageY * layout.pageCountX + pageX + 1,
    xMm: localX,
    yMm: localY,
    workspaceXmm: pageX * layout.pageWidthMm + localX,
    workspaceYmm: pageY * layout.pageHeightMm + localY
  };
}

function buildCrossPageNotes(layout) {
  const placementById = new Map(layout.placements.map(item => [item.person.id, item]));
  const notes = new Map();
  for (const placement of layout.placements) {
    const parent = placementById.get(placement.person.parent);
    if (!parent || parent.pageNumber === placement.pageNumber) continue;
    const childPages = notes.get(parent.person.id) ?? new Set();
    childPages.add(placement.pageNumber);
    notes.set(parent.person.id, childPages);
    const parentPages = notes.get(placement.person.id) ?? new Set();
    parentPages.add(parent.pageNumber);
    notes.set(placement.person.id, parentPages);
  }
  return notes;
}

function getPageTreeTransform(layout, placements) {
  if (layout.pageCount !== 1 || placements.length === 0) return "";

  const minX = Math.min(...placements.map(item => item.xMm));
  const minY = Math.min(...placements.map(item => item.yMm));
  const maxX = Math.max(...placements.map(item => item.xMm + item.widthMm));
  const maxY = Math.max(...placements.map(item => item.yMm + item.heightMm));
  const treeWidth = maxX - minX;
  const treeHeight = maxY - minY;
  const innerPaddingMm = 8;
  const fitWidth = Math.max(1, layout.contentWidthMm - innerPaddingMm * 2);
  const fitHeight = Math.max(1, layout.contentHeightMm - innerPaddingMm * 2);
  const scale = Math.min(1.8, fitWidth / treeWidth, fitHeight / treeHeight);
  const centerX = layout.leftMarginMm + layout.contentWidthMm / 2;
  const centerY = layout.topMarginMm + layout.contentHeightMm / 2;
  const translateX = centerX - (minX + treeWidth / 2) * scale;
  const translateY = centerY - (minY + treeHeight / 2) * scale;

  return ' transform="translate(' + translateX.toFixed(3) + ' ' + translateY.toFixed(3) + ') scale(' + scale.toFixed(4) + ')"';
}

function renderSvg(layout, pageNumber, options = {}) {
  const page = layout.pages.find(item => item.pageNumber === pageNumber);
  if (!page) return "";
  const people = layout.placements.filter(item => item.pageNumber === pageNumber);
  const placementById = new Map(layout.placements.map(item => [item.person.id, item]));
  const crossNotes = buildCrossPageNotes(layout);
  const hasManualPositions = layout.placements.some(item => state.placementEdits.has(item.person.id));
  const treeTransform = options.workspace || hasManualPositions ? "" : getPageTreeTransform(layout, people);
  const selectedId = getSelectedId(state.currentPeople);
  const width = layout.pageWidthMm;
  const height = layout.pageHeightMm;
  const title = elements.includeTitle.checked ? elements.treeTitle.value.trim() : "";
  const nameLines = [];
  const relationLines = [];

  for (const placement of people) {
    const parent = placementById.get(placement.person.parent);
    if (parent && parent.pageNumber === pageNumber) {
      const startX = parent.xMm + parent.widthMm / 2;
      const startY = parent.yMm + parent.heightMm;
      const endX = placement.xMm + placement.widthMm / 2;
      const endY = placement.yMm;
      const bendY = (startY + endY) / 2;
      relationLines.push('<path d="M ' + startX + ' ' + startY + ' C ' + startX + ' ' + bendY + ', ' + endX + ' ' + bendY + ', ' + endX + ' ' + endY + '" fill="none" stroke="#9c8355" stroke-width="0.38"/>');
    }
  }

  for (const placement of people) {
    const person = placement.person;
    const x = placement.xMm;
    const y = placement.yMm;
    const w = placement.widthMm;
    const h = placement.heightMm;
    const selected = person.id === selectedId;
    const lines = wrapWords(person.name, 17);
    const years = elements.includeDates.checked ? formatYears(person) : "";
    const pages = [...(crossNotes.get(person.id) ?? [])];
    const isPhotoAvailable = Boolean(person.photoUrl && elements.includePhotos?.checked);
    const avatar = isPhotoAvailable
      ? '<image href="' + escapeXml(person.photoUrl) + '" x="' + (x + w / 2 - 4) + '" y="' + (y + 5) + '" width="8" height="9" preserveAspectRatio="xMidYMid slice"/>'
      : '<circle cx="' + (x + w / 2) + '" cy="' + (y + 10) + '" r="2.8" fill="#b3a88e"/><path d="M ' + (x + w / 2 - 5.4) + ' ' + (y + 19) + ' C ' + (x + w / 2 - 5.2) + ' ' + (y + 15.7) + ', ' + (x + w / 2 - 2.5) + ' ' + (y + 14.5) + ', ' + (x + w / 2) + ' ' + (y + 14.5) + ' C ' + (x + w / 2 + 2.5) + ' ' + (y + 14.5) + ', ' + (x + w / 2 + 5.2) + ' ' + (y + 15.7) + ', ' + (x + w / 2 + 5.4) + ' ' + (y + 19) + ' Z" fill="#b3a88e"/>';
    const nameMarkup = lines.map((line, index) => '<tspan x="' + (x + w / 2) + '" dy="' + (index === 0 ? 0 : 3.25) + '">' + escapeXml(line) + '</tspan>').join("");
    const pageBadges = pages.slice(0, 2).map((otherPage, index) => {
      const badgeX = x + w - 3.8 - index * 6.2;
      return '<g><title>Родственная связь продолжается на листе ' + otherPage + '</title><circle cx="' + badgeX + '" cy="' + (y + 4) + '" r="2.7" fill="#7c6845"/><text x="' + badgeX + '" y="' + (y + 4.9) + '" text-anchor="middle" class="badge-text">' + otherPage + '</text></g>';
    }).join("");
    nameLines.push(
      '<g class="person-card" data-person-id="' + escapeXml(person.id) + '" role="button" tabindex="0" aria-label="Редактировать: ' + escapeXml(person.name) + '">' +
      '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="1.4" fill="' + (selected ? "#e9dec8" : "#e7e0d2") + '" stroke="' + (selected ? "#a7813e" : "#9d9788") + '" stroke-width="' + (selected ? ".75" : ".35") + '"/>' +
      '<path d="M ' + (x + 2) + ' ' + (y + 5) + ' H ' + (x + w - 2) + '" stroke="#c8b78f" stroke-width=".3"/>' +
      '<text x="' + (x + 2.5) + '" y="' + (y + 3.8) + '" class="generation-label">ПОКОЛЕНИЕ ' + placement.generation + '</text>' +
      pageBadges + avatar +
      '<text x="' + (x + w / 2) + '" y="' + (y + 23) + '" text-anchor="middle" class="person-name">' + nameMarkup + '</text>' +
      (years ? '<text x="' + (x + w / 2) + '" y="' + (y + h - 2.5) + '" text-anchor="middle" class="person-years">' + escapeXml(years) + '</text>' : '') +
      '</g>'
    );
  }

  const titleBlock = title
    ? '<text x="' + (width / 2) + '" y="22" text-anchor="middle" class="tree-title">' + escapeXml(title) + '</text>'
    : '<text x="' + (width / 2) + '" y="22" text-anchor="middle" class="tree-title">СЕМЕЙНОЕ ДРЕВО</text>';
  const subtitle = state.scopeType === "all"
    ? "ПОЛНАЯ ЛИНИЯ · " + layout.personCount + " ЧЕЛОВЕК · " + layout.generationCount + " ПОКОЛЕНИЙ"
    : String(layout.personCount) + " ЧЕЛОВЕК · " + layout.generationCount + " ПОКОЛЕНИЙ";

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" class="paper-svg" width="' + width + 'mm" height="' + height + 'mm" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Печатный лист ' + pageNumber + ' из ' + layout.pageCount + '">',
    '<title>' + escapeXml(title || "Семейное древо") + ' · лист ' + pageNumber + '</title>',
    '<style>.paper-title{font-family:Georgia,serif;fill:#35392f;letter-spacing:.08em}.eyebrow{font-family:Arial,sans-serif;fill:#85724f;letter-spacing:.18em;font-size:2.2px}.tree-title{font-family:Georgia,serif;fill:#302f29;font-size:5.5px}.paper-subtitle{font-family:Arial,sans-serif;fill:#81775f;font-size:2.4px;letter-spacing:.13em}.generation-label{font-family:Arial,sans-serif;fill:#917b50;font-size:1.7px;letter-spacing:.13em}.person-name{font-family:Georgia,serif;fill:#30342d;font-size:3.15px}.person-years{font-family:Arial,sans-serif;fill:#6b6a60;font-size:2.4px}.badge-text{font-family:Arial,sans-serif;fill:#fff3d2;font-size:2.2px}</style>',
    '<rect width="' + width + '" height="' + height + '" fill="#f1ebdf"/>',
    '<rect x="5" y="5" width="' + (width - 10) + '" height="' + (height - 10) + '" fill="none" stroke="#a89162" stroke-width=".35"/>',
    '<rect x="7.3" y="7.3" width="' + (width - 14.6) + '" height="' + (height - 14.6) + '" fill="none" stroke="#c8b995" stroke-width=".22"/>',
    '<g class="masthead"><text x="' + (width / 2) + '" y="13" text-anchor="middle" class="eyebrow">WAYDEAN · СЕМЕЙНОЕ ДРЕВО</text>',
    titleBlock,
    '<text x="' + (width / 2) + '" y="28" text-anchor="middle" class="paper-subtitle">' + escapeXml(subtitle) + '</text>',
    '<path d="M ' + (width / 2 - 15) + ' 32 H ' + (width / 2 + 15) + '" stroke="#b99c61" stroke-width=".35"/>',
    '</g><g class="tree-content"' + treeTransform + '>', relationLines.join(""), nameLines.join(""), '</g>',
    '<text x="' + (width / 2) + '" y="' + (height - 9) + '" text-anchor="middle" class="paper-subtitle">ЛИСТ ' + pageNumber + ' ИЗ ' + layout.pageCount + ' · WAYDEAN</text>',
    '</svg>'
  ].join("");
}

function renderWorkspaceSvg(layout) {
  const boardWidthMm = layout.pageWidthMm * layout.pageCountX;
  const boardHeightMm = layout.pageHeightMm * layout.pageCountY;
  const placementById = new Map(layout.placements.map(item => [item.person.id, item]));
  const surfaces = layout.pages.map(page => {
    const x = page.pageX * layout.pageWidthMm;
    const y = page.pageY * layout.pageHeightMm;
    const active = page.pageNumber === state.pageNumber;
    return '<g class="workspace-sheet-surface" transform="translate(' + x + ' ' + y + ')" pointer-events="none">' +
      '<rect width="' + layout.pageWidthMm + '" height="' + layout.pageHeightMm + '" fill="#f1ebdf" stroke="#7d7056" stroke-width="1.1"/>' +
      '<rect x="5" y="5" width="' + (layout.pageWidthMm - 10) + '" height="' + (layout.pageHeightMm - 10) + '" fill="none" stroke="#a89162" stroke-width=".35"/>' +
      '<rect x="7.3" y="7.3" width="' + (layout.pageWidthMm - 14.6) + '" height="' + (layout.pageHeightMm - 14.6) + '" fill="none" stroke="#c8b995" stroke-width=".22"/>' +
      '<text x="' + (layout.pageWidthMm - 12) + '" y="13" text-anchor="end" class="workspace-page-label">ЛИСТ ' + page.pageNumber + '</text>' +
      '<rect class="workspace-page-outline" x=".6" y=".6" width="' + (layout.pageWidthMm - 1.2) + '" height="' + (layout.pageHeightMm - 1.2) + '"' + (active ? ' style="stroke:#be994d;stroke-width:1.7"' : '') + '/>' +
      '</g>';
  }).join("");
  const crossPageLinks = layout.placements.map(placement => {
    const parent = placementById.get(placement.person.parent);
    if (!parent || parent.pageNumber === placement.pageNumber) return "";
    const parentPoint = getWorkspacePoint(parent, layout);
    const childPoint = getWorkspacePoint(placement, layout);
    const startX = parentPoint.x + parent.widthMm / 2;
    const startY = parentPoint.y + parent.heightMm;
    const endX = childPoint.x + placement.widthMm / 2;
    const endY = childPoint.y;
    const bendY = (startY + endY) / 2;
    return '<path class="workspace-cross-link" d="M ' + startX + ' ' + startY + ' C ' + startX + ' ' + bendY + ', ' + endX + ' ' + bendY + ', ' + endX + ' ' + endY + '"/>';
  }).join("");
  const pageContent = layout.pages.map(page => {
    const pageSvg = renderSvg(layout, page.pageNumber, { workspace: true });
    const pageBody = pageSvg.replace(/^<svg\b[^>]*>/, "").replace(/<\/svg>$/, "");
    return '<g class="workspace-page' + (page.pageNumber === state.pageNumber ? ' is-active' : '') + '" data-page-number="' + page.pageNumber + '" transform="translate(' + (page.pageX * layout.pageWidthMm) + ' ' + (page.pageY * layout.pageHeightMm) + ')">' +
      '<rect class="workspace-hit-area" width="' + layout.pageWidthMm + '" height="' + layout.pageHeightMm + '" fill="transparent"/>' + pageBody + '</g>';
  }).join("");

  return '<svg xmlns="http://www.w3.org/2000/svg" class="paper-svg workspace-svg" width="' + boardWidthMm + 'mm" height="' + boardHeightMm + 'mm" viewBox="0 0 ' + boardWidthMm + ' ' + boardHeightMm + '" role="group" aria-label="Общее рабочее поле, ' + layout.pageCount + ' листов">' +
    '<style>.workspace-page>rect:nth-of-type(n+2):nth-of-type(-n+4){visibility:hidden}.workspace-page-label{font-family:Arial,sans-serif;fill:#78633e;font-size:2.25px;letter-spacing:.12em}.workspace-cross-link{fill:none;stroke:#aa8d58;stroke-width:.42;stroke-dasharray:1.4 1.1;opacity:.78;pointer-events:none}.workspace-page-outline{fill:none;stroke:transparent;stroke-width:1.25;pointer-events:none}.workspace-hit-area{fill:transparent;pointer-events:all}.person-card{cursor:grab;touch-action:none}.person-card:active{cursor:grabbing}</style>' +
    surfaces + '<g class="workspace-cross-links" aria-hidden="true">' + crossPageLinks + '</g>' + pageContent + '</svg>';
}

function pluralSheets(value) {
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "листов";
  if (last === 1) return "лист";
  if (last >= 2 && last <= 4) return "листа";
  return "листов";
}

function renderPageGrid(layout) {
  elements.pageGrid.innerHTML = layout.pages.map(page =>
    '<button type="button" class="tile-button' + (page.pageNumber === state.pageNumber ? ' is-active' : '') + '" data-page="' + page.pageNumber + '" aria-label="Открыть лист ' + page.pageNumber + ' из ' + layout.pageCount + '"' + (page.pageNumber === state.pageNumber ? ' aria-current="page"' : '') + '><span>◇</span><small>' + page.pageNumber + '</small></button>'
  ).join("");
  elements.pageGrid.style.gridTemplateColumns = "repeat(" + Math.min(Math.max(layout.pageCountX, 1), 4) + ", minmax(0, 1fr))";
  elements.pageGrid.querySelectorAll("[data-page]").forEach(button => button.addEventListener("click", () => {
    state.pageNumber = Number(button.dataset.page);
    update();
    focusWorkspacePage(state.pageNumber, true, "page");
  }));
}

function setStatus(message, kind = "normal") {
  elements.exportStatus.textContent = message;
  elements.exportStatus.dataset.kind = kind;
}

function renderPrintable(layout) {
  elements.printPages.innerHTML = layout.pages.map(page =>
    '<section class="print-page" style="--page-width:' + page.pageWidthMm + 'mm;--page-height:' + page.pageHeightMm + 'mm">' + renderSvg(layout, page.pageNumber) + '</section>'
  ).join("");
  let style = document.getElementById("printPageStyle");
  if (!style) {
    style = document.createElement("style");
    style.id = "printPageStyle";
    document.head.append(style);
  }
  style.textContent = getPrintPageRule(layout);
}

function update() {
  state.currentPeople = getScopedPeople(state.source.people, getCurrentScope()).map(person => ({
    ...person,
    ...(state.personEdits.get(person.id) ?? {})
  }));
  const recommendation = recommendPaper(state.currentPeople, layoutOptions);
  elements.recommendedFormat.textContent = recommendation.paperSize + " · " + (recommendation.orientation === "landscape" ? "альбомная" : "книжная");
  elements.recommendationReason.textContent = recommendation.reason;
  if (elements.autoFormat.checked) {
    elements.paperSize.value = recommendation.paperSize;
    elements.orientation.value = recommendation.orientation;
  }

  state.currentLayout = buildPrintLayout(state.currentPeople, {
    ...layoutOptions,
    paperSize: elements.paperSize.value,
    orientation: elements.orientation.value
  });
  for (const placement of state.currentLayout.placements) {
    const edit = state.placementEdits.get(placement.person.id);
    if (!edit) continue;
    const positioned = placeInWorkspace(state.currentLayout, placement, edit.workspaceXmm, edit.workspaceYmm);
    Object.assign(placement, positioned);
  }
  state.pageNumber = Math.min(Math.max(1, state.pageNumber), Math.max(state.currentLayout.pageCount, 1));

  if (!state.currentPeople.length) {
    elements.paperPreview.style.setProperty("--paper-ratio", "0.707");
    elements.paperPreview.innerHTML = '<div class="empty-preview"><span>◇</span><strong>В этом охвате нет людей</strong><small>Измени ветвь или глубину поколений.</small></div>';
    elements.pageGrid.innerHTML = "";
    elements.pageCounter.textContent = "Листов нет";
    elements.tileCount.textContent = "0 листов";
    elements.tileHint.textContent = "Выбери другой охват, чтобы построить макет.";
    elements.personCount.textContent = "0";
    elements.generationCount.textContent = "0";
    elements.sheetCount.textContent = "0";
    elements.scopeSummary.textContent = getScopeDescription(state.currentPeople);
    elements.previousPage.disabled = true;
    elements.nextPage.disabled = true;
    state.currentSvg = "";
    elements.printPages.innerHTML = "";
    elements.paperPreview.style.width = "";
    elements.paperPreview.style.height = "";
    return;
  }

  const layout = state.currentLayout;
  const activeSvg = renderSvg(layout, state.pageNumber);
  state.currentSvg = activeSvg;
  elements.paperPreview.innerHTML = renderWorkspaceSvg(layout);
  const boardKey = [layout.paperSize, layout.orientation, layout.pageCountX, layout.pageCountY].join(":");
  const boardChanged = boardKey !== state.workspaceBoardKey;
  state.workspaceBoardKey = boardKey;
  if (state.workspaceZoom === 0 || (boardChanged && ["fit", "page"].includes(state.workspaceZoomMode))) {
    if (state.workspaceZoomMode === "fit") fitWorkspace();
    else fitActivePage();
  } else setWorkspaceDimensions();
  bindCardInteractions();
  elements.paperPreview.setAttribute("aria-label", "Редактируемое общее поле, " + layout.pageCount + " листов");
  elements.pageCounter.textContent = "Лист " + state.pageNumber + " из " + layout.pageCount;
  elements.tileCount.textContent = layout.pageCount + " " + pluralSheets(layout.pageCount);
  elements.tileHint.textContent = layout.pageCount > 1
    ? "Все листы связаны на общем поле. Активный лист открыт крупно; кнопка обзора покажет раскладку целиком."
    : "Макет целиком помещается на один лист.";
  elements.personCount.textContent = String(layout.personCount);
  elements.generationCount.textContent = String(layout.generationCount);
  elements.sheetCount.textContent = String(layout.pageCount);
  elements.scopeSummary.textContent = getScopeDescription(state.currentPeople);
  elements.previousPage.disabled = state.pageNumber <= 1;
  elements.nextPage.disabled = state.pageNumber >= layout.pageCount;
  renderPageGrid(layout);
  updateWorkspaceViewControl();
  renderPrintable(layout);
  setStatus("Макет обновлён. Выбери SVG или PDF, чтобы сохранить его.");
}

const CSS_PIXELS_PER_MM = 96 / 25.4;

function setWorkspaceDimensions() {
  if (!state.currentLayout || !state.workspaceZoom) return;
  const widthMm = state.currentLayout.pageWidthMm * state.currentLayout.pageCountX;
  const heightMm = state.currentLayout.pageHeightMm * state.currentLayout.pageCountY;
  elements.paperPreview.style.width = Math.max(1, widthMm * CSS_PIXELS_PER_MM * state.workspaceZoom) + "px";
  elements.paperPreview.style.height = Math.max(1, heightMm * CSS_PIXELS_PER_MM * state.workspaceZoom) + "px";
  elements.zoomValue.textContent = Math.round(state.workspaceZoom * 100) + "%";
}

function updateWorkspaceViewControl() {
  const showingAllPages = state.workspaceZoomMode === "fit";
  elements.fitPreview.textContent = showingAllPages ? "Лист" : "Все листы";
  elements.fitPreview.title = showingAllPages ? "Приблизить активный лист" : "Показать все листы целиком";
  if (state.currentLayout?.pageCount > 1) {
    elements.tileHint.textContent = showingAllPages
      ? "Общий обзор всех листов. Нажми «Лист», чтобы вернуться к активному листу крупно."
      : "Все листы связаны на общем поле. Кнопка «Все листы» покажет общую раскладку.";
  }
}

function setWorkspaceZoom(nextZoom, clientX, clientY, mode = "manual") {
  if (!state.currentLayout) return;
  const stage = elements.paperStage;
  const previousZoom = state.workspaceZoom;
  const stageRect = stage.getBoundingClientRect();
  const anchorX = clientX ?? (stageRect.left + stage.clientWidth / 2);
  const anchorY = clientY ?? (stageRect.top + stage.clientHeight / 2);
  const paperRect = elements.paperPreview.getBoundingClientRect();
  const paperOffsetX = anchorX - paperRect.left;
  const paperOffsetY = anchorY - paperRect.top;
  state.workspaceZoom = clamp(nextZoom, 0.01, 3.5);
  state.workspaceZoomMode = mode;
  updateWorkspaceViewControl();
  setWorkspaceDimensions();
  if (previousZoom > 0) {
    const ratio = state.workspaceZoom / previousZoom;
    stage.scrollLeft = Math.max(0, stage.scrollLeft + paperOffsetX * (ratio - 1));
    stage.scrollTop = Math.max(0, stage.scrollTop + paperOffsetY * (ratio - 1));
  }
}

function fitWorkspace() {
  const layout = state.currentLayout;
  if (!layout?.pageCount) return;
  const stage = elements.paperStage;
  const availableWidth = Math.max(120, stage.clientWidth - 56);
  const availableHeight = Math.max(120, stage.clientHeight - 56);
  const boardWidthPx = layout.pageWidthMm * layout.pageCountX * CSS_PIXELS_PER_MM;
  const boardHeightPx = layout.pageHeightMm * layout.pageCountY * CSS_PIXELS_PER_MM;
  const scale = Math.min(availableWidth / boardWidthPx, availableHeight / boardHeightPx, 1.5);
  setWorkspaceZoom(scale, undefined, undefined, "fit");
  stage.scrollLeft = 0;
  stage.scrollTop = 0;
}

function fitActivePage() {
  focusWorkspacePage(state.pageNumber, true, "page");
}

function focusWorkspacePage(pageNumber, zoomToPage = false, zoomMode = "manual") {
  const layout = state.currentLayout;
  const page = layout?.pages.find(item => item.pageNumber === pageNumber);
  if (!page) return;
  if (zoomToPage) {
    const stage = elements.paperStage;
    const availableWidth = Math.max(120, stage.clientWidth - 56);
    const availableHeight = Math.max(120, stage.clientHeight - 56);
    const scale = Math.min(
      availableWidth / (layout.pageWidthMm * CSS_PIXELS_PER_MM),
      availableHeight / (layout.pageHeightMm * CSS_PIXELS_PER_MM),
      1.5
    );
    setWorkspaceZoom(scale, undefined, undefined, zoomMode);
  }
  const stage = elements.paperStage;
  const paddingLeft = Number.parseFloat(getComputedStyle(stage).paddingLeft) || 0;
  const paddingTop = Number.parseFloat(getComputedStyle(stage).paddingTop) || 0;
  const pageCenterX = (page.pageX * layout.pageWidthMm + layout.pageWidthMm / 2) * CSS_PIXELS_PER_MM * state.workspaceZoom;
  const pageCenterY = (page.pageY * layout.pageHeightMm + layout.pageHeightMm / 2) * CSS_PIXELS_PER_MM * state.workspaceZoom;
  stage.scrollLeft = Math.max(0, paddingLeft + pageCenterX - stage.clientWidth / 2);
  stage.scrollTop = Math.max(0, paddingTop + pageCenterY - stage.clientHeight / 2);
}

function localSvgPoint(event, svg) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(svg.getScreenCTM().inverse());
}

function bindCardInteractions() {
  const svg = elements.paperPreview.querySelector("svg.workspace-svg");
  if (!svg) return;
  let drag = null;
  let suppressClick = false;

  svg.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    const card = event.target.closest?.(".person-card[data-person-id]");
    if (!card) return;
    const placement = state.currentLayout.placements.find(item => item.person.id === card.dataset.personId);
    if (!placement) return;
    const point = localSvgPoint(event, svg);
    const workspacePoint = getWorkspacePoint(placement);
    drag = {
      card,
      pointerId: event.pointerId,
      personId: placement.person.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPointX: point.x,
      startPointY: point.y,
      startX: workspacePoint.x,
      startY: workspacePoint.y,
      originalLocalX: placement.xMm,
      originalLocalY: placement.yMm,
      moved: false,
      nextPlacement: null
    };
    svg.setPointerCapture(event.pointerId);
  });

  svg.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) < 4) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.card.remove();
      svg.append(drag.card);
    }
    const point = localSvgPoint(event, svg);
    const placement = state.currentLayout.placements.find(item => item.person.id === drag.personId);
    if (!placement) return;
    const next = placeInWorkspace(state.currentLayout, placement,
      drag.startX + point.x - drag.startPointX,
      drag.startY + point.y - drag.startPointY);
    drag.nextPlacement = next;
    const visualX = next.workspaceXmm - drag.originalLocalX;
    const visualY = next.workspaceYmm - drag.originalLocalY;
    drag.card.setAttribute("transform", "translate(" + visualX + " " + visualY + ")");
  });

  svg.addEventListener("pointerup", event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const finished = drag;
    drag = null;
    if (finished.moved && finished.nextPlacement) {
      state.placementEdits.set(finished.personId, {
        workspaceXmm: finished.nextPlacement.workspaceXmm,
        workspaceYmm: finished.nextPlacement.workspaceYmm
      });
      state.pageNumber = finished.nextPlacement.pageNumber;
      suppressClick = true;
      window.setTimeout(() => { suppressClick = false; }, 300);
      update();
    } else {
      suppressClick = true;
      window.setTimeout(() => { suppressClick = false; }, 300);
      openPersonEditor(finished.personId);
    }
  });

  svg.addEventListener("pointercancel", () => { drag = null; update(); });
  svg.addEventListener("click", event => {
    if (Date.now() < ignoreWorkspaceClickUntil) return;
    if (suppressClick) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const card = event.target.closest?.(".person-card[data-person-id]");
    if (card) {
      openPersonEditor(card.dataset.personId);
      return;
    }
    const page = event.target.closest?.(".workspace-page[data-page-number]");
    if (page) {
      state.pageNumber = Number(page.dataset.pageNumber);
      update();
      focusWorkspacePage(state.pageNumber);
    }
  });
  svg.addEventListener("keydown", event => {
    const card = event.target.closest?.(".person-card[data-person-id]");
    if (card && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openPersonEditor(card.dataset.personId);
    }
  });
}

function openPersonEditor(personId) {
  const person = state.currentPeople.find(item => item.id === personId);
  if (!person) return;
  let dialog = document.getElementById("personEditor");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "personEditor";
    dialog.className = "person-editor";
    dialog.innerHTML = '<form method="dialog"><h2>Карточка человека</h2><label>Имя<input name="name" required maxlength="120"></label><label>Год рождения<input name="born" inputmode="numeric" maxlength="12"></label><label>Год смерти<input name="died" inputmode="numeric" maxlength="12"></label><div class="editor-actions"><button type="button" data-cancel>Отмена</button><button type="submit">Сохранить в макете</button></div></form>';
    document.body.append(dialog);
    dialog.querySelector("[data-cancel]").addEventListener("click", () => dialog.close());
    dialog.addEventListener("submit", event => {
      event.preventDefault();
      const id = dialog.dataset.personId;
      const [name, born, died] = ["name", "born", "died"].map(field => dialog.elements[field].value.trim());
      if (!name) return;
      state.personEdits.set(id, { name, born, died });
      dialog.close();
      update();
      setStatus("Изменения сохранены только в макете этой вкладки.", "success");
    });
  }
  dialog.dataset.personId = personId;
  for (const field of ["name", "born", "died"]) dialog.elements[field].value = person[field] ?? "";
  if (typeof dialog.showModal === "function") dialog.showModal();
}

function populateSelects() {
  elements.personSelect.innerHTML = state.source.people.map(person =>
    '<option value="' + escapeXml(person.id) + '">' + escapeXml(person.name) + (person.born ? " · " + person.born : "") + '</option>'
  ).join("");
  const branches = Object.keys(state.source.branchLabels);
  elements.branchSelect.innerHTML = branches.map(branch =>
    '<option value="' + escapeXml(branch) + '">' + escapeXml(state.source.branchLabels[branch] || branch) + '</option>'
  ).join("");
  elements.personSelect.value = state.source.id === "demo" ? "p06" : state.source.people[0]?.id ?? "";
  elements.branchSelect.value = branches[0] ?? "";
  elements.depthRange.max = String(Math.max(1, state.source.generationCount));
  elements.depthRange.value = String(Math.min(3, state.source.generationCount));
  elements.depthValue.textContent = elements.depthRange.value;
  document.getElementById("depthMaxLabel").textContent = state.source.generationCount + " поколений";
}

function applyRequestedRoute() {
  if (!requestedScope) return;

  if (requestedScope === "person") {
    const requestedPersonId = requestedHandoff?.personId;
    const personExists = Boolean(requestedPersonId && state.source.people.some(person => person.id === requestedPersonId));
    if (!personExists) {
      state.scopeType = "all";
      requestedRouteFallback = true;
      return;
    }
    elements.personSelect.value = requestedPersonId;

    const direction = requestedRoute.get("direction") || requestedHandoff?.direction;
    if (["descendants", "ancestors", "both"].includes(direction)) elements.directionSelect.value = direction;
  }

  if (requestedScope === "branch") {
    const requestedBranch = requestedRoute.get("branch") || requestedHandoff?.branchId;
    if (requestedBranch && ![...elements.branchSelect.options].some(option => option.value === requestedBranch)) {
      state.scopeType = "all";
      requestedRouteFallback = true;
      return;
    }
    if (requestedBranch) elements.branchSelect.value = requestedBranch;
  }

  const depth = Number(requestedRoute.get("depth") || requestedHandoff?.depth);
  if (Number.isFinite(depth) && depth > 0) {
    const maxDepth = Number(elements.depthRange.max);
    elements.depthRange.value = String(Math.min(maxDepth, Math.max(1, Math.floor(depth))));
    elements.depthValue.textContent = elements.depthRange.value;
  }
}

function changeTreeSource(sourceId) {
  state.source = getPrintTreeSource(sourceId);
  state.personEdits.clear();
  state.placementEdits.clear();
  state.scopeType = state.source.id === "hoti" ? "all" : "person";
  state.pageNumber = 1;
  populateSelects();
  syncScopeControls();
  const url = new URL(window.location.href);
  if (state.source.id === "hoti") url.searchParams.set("tree", "hoti");
  else url.searchParams.delete("tree");
  window.history.replaceState(null, "", url);
  update();
  updateSourceCopy();
  setStatus(state.source.id === "hoti"
    ? "Древо HOTI готово к макету."
    : "Демонстрационное древо готово к макету.");
}

function updateSourceCopy() {
  elements.privacyCopy.textContent = "Правки макета действуют в этой вкладке и не меняют исходные данные.";
  document.getElementById("footerDataMode").textContent = state.source.id === "hoti"
    ? "Источник: HOTI"
    : "Источник: демонстрационное дерево";
}

function syncScopeControls() {
  const isPerson = state.scopeType === "person";
  const isBranch = state.scopeType === "branch";
  elements.personLabel.classList.toggle("is-hidden", !isPerson);
  elements.personSelect.classList.toggle("is-hidden", !isPerson);
  elements.branchLabel.classList.toggle("is-hidden", !isBranch);
  elements.branchSelect.classList.toggle("is-hidden", !isBranch);
  elements.directionLabel.classList.toggle("is-hidden", !isPerson);
  elements.directionSelect.classList.toggle("is-hidden", !isPerson);
  elements.depthRange.disabled = state.scopeType === "all";
  document.querySelectorAll("[data-scope]").forEach(button => {
    const active = button.dataset.scope === state.scopeType;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function fileStem() {
  const source = elements.includeTitle.checked ? elements.treeTitle.value : "waydean-tree";
  const safe = source.toLocaleLowerCase("ru-RU").replace(/[^a-z0-9а-яё]+/giu, "-").replace(/^-|-$/g, "");
  return (safe || "waydean-tree") + "-" + elements.paperSize.value.toLowerCase() + "-page-" + state.pageNumber;
}

async function exportSvg() {
  if (!state.currentSvg) return;
  setStatus("Подготавливаю SVG с фотографиями.");
  try {
    const demoAssets = new URL("../../assets/demo/", import.meta.url);
    const portableSvg = await embedSvgImageAssets(state.currentSvg, async href => {
      const url = new URL(href, document.baseURI);
      if (url.origin !== location.origin || !url.pathname.startsWith(demoAssets.pathname)) {
        throw new Error("Only local demo portraits can be embedded.");
      }
      return fetch(url.href, { credentials: "same-origin" });
    });
    downloadBlob(new Blob([portableSvg], { type: "image/svg+xml;charset=utf-8" }), fileStem() + ".svg");
    setStatus("SVG создан; фотографии встроены в файл.", "success");
  } catch {
    setStatus("Не удалось подготовить SVG. Повтори попытку.", "error");
  }
}

function printPdf() {
  if (!state.currentLayout?.pageCount) return;
  setStatus("Открыл печатный диалог. Выбери «Сохранить как PDF» для всех листов.");
  window.requestAnimationFrame(() => window.print());
}

elements.treeSource.value = state.source.id;
if (getPrintTreeSource("hoti").id !== "hoti") {
  elements.treeSource.querySelector('option[value="hoti"]')?.remove();
  document.getElementById("treeSourceHint").textContent = "Здесь доступно демонстрационное дерево.";
}
elements.treeSource.addEventListener("change", event => changeTreeSource(event.currentTarget.value));
populateSelects();
applyRequestedRoute();
updateSourceCopy();
syncScopeControls();
document.querySelectorAll("[data-scope]").forEach(button => button.addEventListener("click", () => {
  state.scopeType = button.dataset.scope;
  state.pageNumber = 1;
  syncScopeControls();
  update();
}));

for (const control of [elements.personSelect, elements.branchSelect, elements.directionSelect, elements.depthRange, elements.includePhotos, elements.includeDates, elements.includeTitle, elements.treeTitle]) {
  control.addEventListener("input", update);
  control.addEventListener("change", update);
}

elements.paperSize.addEventListener("change", () => { elements.autoFormat.checked = false; update(); });
elements.orientation.addEventListener("change", () => { elements.autoFormat.checked = false; update(); });
elements.autoFormat.addEventListener("change", update);
elements.applyRecommendation.addEventListener("click", () => {
  if (!state.currentPeople.length) return;
  const recommendation = recommendPaper(state.currentPeople, layoutOptions);
  elements.paperSize.value = recommendation.paperSize;
  elements.orientation.value = recommendation.orientation;
  elements.autoFormat.checked = true;
  update();
});
elements.depthRange.addEventListener("input", () => { elements.depthValue.value = elements.depthRange.value; });
elements.previousPage.addEventListener("click", () => {
  state.pageNumber = Math.max(1, state.pageNumber - 1);
  update();
  focusWorkspacePage(state.pageNumber, true, "page");
});
elements.nextPage.addEventListener("click", () => {
  state.pageNumber = Math.min(state.currentLayout.pageCount, state.pageNumber + 1);
  update();
  focusWorkspacePage(state.pageNumber, true, "page");
});
elements.zoomOut.addEventListener("click", () => setWorkspaceZoom(state.workspaceZoom / 1.2));
elements.zoomIn.addEventListener("click", () => setWorkspaceZoom(state.workspaceZoom * 1.2));
elements.fitPreview.addEventListener("click", () => {
  if (state.workspaceZoomMode === "fit") {
    fitActivePage();
    setStatus("Активный лист увеличен; остальные листы остаются на общем поле.");
  } else {
    fitWorkspace();
    setStatus("Все листы показаны целиком в рабочем поле.");
  }
});

let stagePan = null;
let ignoreWorkspaceClickUntil = 0;
elements.paperStage.addEventListener("pointerdown", event => {
  if (event.button !== 0 || event.target.closest?.(".person-card")) return;
  stagePan = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    scrollLeft: elements.paperStage.scrollLeft,
    scrollTop: elements.paperStage.scrollTop,
    pageNumber: Number(event.target.closest?.(".workspace-page[data-page-number]")?.dataset.pageNumber) || null,
    moved: false
  };
  elements.paperStage.classList.add("is-panning");
  elements.paperStage.setPointerCapture(event.pointerId);
});
elements.paperStage.addEventListener("pointermove", event => {
  if (!stagePan || event.pointerId !== stagePan.pointerId) return;
  const dx = event.clientX - stagePan.startX;
  const dy = event.clientY - stagePan.startY;
  if (Math.hypot(dx, dy) > 4) stagePan.moved = true;
  if (!stagePan.moved) return;
  elements.paperStage.scrollLeft = stagePan.scrollLeft - dx;
  elements.paperStage.scrollTop = stagePan.scrollTop - dy;
});
elements.paperStage.addEventListener("pointerup", event => {
  if (!stagePan || event.pointerId !== stagePan.pointerId) return;
  const clicked = stagePan;
  if (clicked.moved) ignoreWorkspaceClickUntil = Date.now() + 250;
  stagePan = null;
  elements.paperStage.classList.remove("is-panning");
  if (!clicked.moved && clicked.pageNumber && clicked.pageNumber !== state.pageNumber) {
    state.pageNumber = clicked.pageNumber;
    update();
    focusWorkspacePage(state.pageNumber);
  }
});
elements.paperStage.addEventListener("pointercancel", () => {
  stagePan = null;
  elements.paperStage.classList.remove("is-panning");
});
elements.paperStage.addEventListener("wheel", event => {
  event.preventDefault();
  const factor = Math.exp(-event.deltaY * .001);
  setWorkspaceZoom(state.workspaceZoom * factor, event.clientX, event.clientY);
}, { passive: false });
window.addEventListener("resize", () => {
  if (state.workspaceZoomMode === "fit") fitWorkspace();
  else if (state.workspaceZoomMode === "page") fitActivePage();
});
elements.downloadSvg.addEventListener("click", exportSvg);
elements.printPdf.addEventListener("click", printPdf);
window.addEventListener("afterprint", () => setStatus("Печатный диалог закрыт. Настройки и превью сохранены в этой вкладке."));

update();
if (requestedRouteFallback) setStatus("Выбор из предыдущего экрана не найден в этом наборе; открыто всё доступное дерево.");
