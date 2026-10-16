import { getPrintTreeSource } from "./print-data.mjs";
import { buildPrintLayout, getScopedPeople, recommendPaper } from "./layout.mjs";
import { getPrintPageRule } from "./print-page-size.mjs";
import { embedSvgImageAssets } from "./svg-photo-embed.mjs";
import { getPosterMastheadLayout } from "./poster-masthead-layout.mjs";
import { getConnectorPath, getNameTextLength, getPersonCardLayout, wrapPersonName } from "./person-card-layout.mjs?v=workspace-21";
import { renderPersonCardFrame, PRINT_CARD_STYLES } from "./print-card-style.mjs?v=workspace-21";
import { clampWorkspaceZoom, getViewportFitZoom } from "./workspace-zoom.mjs?v=workspace-21";
import { excludePagePersonIds, getPagePersonIds, restorePageExclusions, snapPlacementToPeers } from "./workspace-editing.mjs?v=workspace-3";
import qrcode from "./vendor/qrcode-generator/qrcode.mjs";
import { stringToBytes as utf8StringToBytes } from "./vendor/qrcode-generator/qrcode_UTF8.mjs";

const TREE_ACCESS_URL = "https://waydean.ru/drewo/";
qrcode.stringToBytes = utf8StringToBytes;
const treeQrCode = qrcode(0, "H");
treeQrCode.addData(TREE_ACCESS_URL, "Byte");
treeQrCode.make();

const layoutOptions = {
  marginMm: 12,
  topMarginMm: 38,
  bottomMarginMm: 16,
  nodeWidthMm: 48,
  nodeHeightMm: 34,
  columnGapMm: 18,
  rowGapMm: 10
};

const PRINT_THEMES = Object.freeze({
  heritage: Object.freeze({
    key: "heritage", backgroundAsset: "./assets/backgrounds/mountain-heritage.jpg", overlay: "#07100f", overlayOpacity: .44,
    frame: "#a8874c", innerFrame: "#5b5039", title: "#f0dfb7", eyebrow: "#c0a875", subtitle: "#c5b58f",
    generation: "#d2bd8d", name: "#f2ead8", years: "#c9b991", card: "#0d1715", selectedCard: "#172019",
    cardInner: "#e6ebdc", cardBorder: "#e6ebdc", cardOpacity: .42, selectedCardOpacity: .68, portraitBorder: "#d0b06b", portraitBg: "#17211e", selectedBorder: "#f0c96b", rule: "#c4a770", connector: "#c29b4e",
    silhouette: "#aa9a73", badge: "#806431", badgeText: "#fff1c5", pageLabel: "#e0cd9e",
    pageIndex: "#202925", selectedPageIndex: "#3b321f", pageIndexBorder: "#806b40", selectedPageBorder: "#c49a47"
  }),
  dawn: Object.freeze({
    key: "dawn", backgroundAsset: "./assets/backgrounds/quiet-dawn-river.jpg", overlay: "#101411", overlayOpacity: .50,
    frame: "#b08c4c", innerFrame: "#68583b", title: "#f2e2bf", eyebrow: "#d0b273", subtitle: "#c9bd9e",
    generation: "#d6c091", name: "#f4ecd9", years: "#d1c29e", card: "#101916", selectedCard: "#1a211b",
    cardInner: "#e9ecdf", cardBorder: "#e9ecdf", cardOpacity: .44, selectedCardOpacity: .7, portraitBorder: "#d8b673", portraitBg: "#19211e", selectedBorder: "#f2ce78", rule: "#cfb87f", connector: "#d3aa57",
    silhouette: "#ad9a6d", badge: "#8c6d36", badgeText: "#fff4d7", pageLabel: "#ecdaae",
    pageIndex: "#232922", selectedPageIndex: "#42351e", pageIndexBorder: "#8b7446", selectedPageBorder: "#d5a94e"
  }),
  lake: Object.freeze({
    key: "lake", backgroundAsset: "./assets/backgrounds/moonlit-lake.jpg", overlay: "#071018", overlayOpacity: .42,
    frame: "#a8874c", innerFrame: "#4d5149", title: "#eee1c1", eyebrow: "#c0aa77", subtitle: "#c5c2ae",
    generation: "#c7bd98", name: "#eee6d4", years: "#c4c0a8", card: "#111a20", selectedCard: "#1a2327",
    cardInner: "#dfe5df", cardBorder: "#dfe5df", cardOpacity: .4, selectedCardOpacity: .66, portraitBorder: "#c8b581", portraitBg: "#192328", selectedBorder: "#e6c979", rule: "#b8ad8a", connector: "#c39c55",
    silhouette: "#a69a76", badge: "#78643b", badgeText: "#fff1cc", pageLabel: "#dfd2aa",
    pageIndex: "#1c2528", selectedPageIndex: "#383323", pageIndexBorder: "#716744", selectedPageBorder: "#be994d"
  })
});

const elements = Object.fromEntries([
  "treeSource", "personSelect", "branchSelect", "personLabel", "branchLabel", "directionSelect", "directionLabel",
  "depthRange", "depthValue", "includePhotos", "includeDates", "includeTitle", "includeQr", "treeTitle", "paperSize", "orientation",
  "autoFormat", "recommendedFormat", "recommendationReason", "applyRecommendation", "paperPreview", "paperStage",
  "previousPage", "nextPage", "pageCounter", "fitPreview", "zoomOut", "zoomValue", "zoomIn", "pageGrid", "tileCount", "tileHint", "personCount",
  "generationCount", "sheetCount", "scopeSummary", "exportStatus", "downloadSvg", "downloadWorkspaceSvg", "downloadTreeJson", "printPdf", "printPages", "privacyCopy", "undoDraft", "redoDraft", "resetDraft"
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
  excludedPersonIds: new Set(),
  excludedScopeKey: null,
  undoStack: [],
  redoStack: [],
  lastDraftSnapshot: null,
  historyGroup: null,
  lastHistoryGroup: null,
  lastHistoryAt: 0,
  draftTouched: false,
  source: initialSource,
  designTheme: "heritage",
  cardStyle: "glass"
};
let requestedRouteFallback = false;
let restoredDraft = false;
let draftStorageUnavailable = false;

function getDraftStorageKey(source = state.source) {
  return "waydean.print-draft.v1:" + source.id;
}

function getPrintTheme() {
  return PRINT_THEMES[state.designTheme] ?? PRINT_THEMES.heritage;
}

function syncPrintThemeButtons() {
  document.querySelectorAll("[data-print-theme]").forEach(button => {
    const active = button.dataset.printTheme === state.designTheme;
    button.setAttribute("aria-pressed", String(active));
  });
}

function syncPrintCardStyleButtons() {
  document.querySelectorAll("[data-print-card-style]").forEach(button => {
    const active = button.dataset.printCardStyle === state.cardStyle;
    button.setAttribute("aria-pressed", String(active));
  });
}

function readPrintDraft(source = state.source) {
  try {
    const raw = window.localStorage.getItem(getDraftStorageKey(source));
    const draft = raw ? JSON.parse(raw) : null;
    return draft?.version === 1 && draft.sourceId === source.id ? draft : null;
  } catch {
    draftStorageUnavailable = true;
    return null;
  }
}

function restorePrintDraft(draft) {
  if (!draft) return false;
  const validIds = new Set(state.source.people.map(person => person.id));
  const personEdits = Object.entries(draft.personEdits ?? {}).flatMap(([id, edit]) => {
    if (!validIds.has(id) || !edit || typeof edit !== "object") return [];
    const restoredEdit = {
      name: String(edit.name ?? "").slice(0, 120),
      born: String(edit.born ?? "").slice(0, 12),
      died: String(edit.died ?? "").slice(0, 12)
    };
    if (Object.hasOwn(edit, "teip")) restoredEdit.teip = String(edit.teip ?? "").slice(0, 80);
    return [[id, restoredEdit]];
  });
  const placementEdits = Object.entries(draft.placementEdits ?? {}).flatMap(([id, position]) => {
    if (!validIds.has(id) || !position || !Number.isFinite(position.workspaceXmm) || !Number.isFinite(position.workspaceYmm)) return [];
    return [[id, { workspaceXmm: position.workspaceXmm, workspaceYmm: position.workspaceYmm }]];
  });
  const excludedPersonIds = new Set((Array.isArray(draft.excludedPersonIds) ? draft.excludedPersonIds : []).filter(id => validIds.has(id)));
  state.personEdits = new Map(personEdits);
  state.placementEdits = new Map(placementEdits);
  state.draftTouched = true;

  const settings = draft.settings ?? {};
  if (["person", "branch", "all"].includes(settings.scopeType)) state.scopeType = settings.scopeType;
  if ([...elements.personSelect.options].some(option => option.value === settings.personId)) elements.personSelect.value = settings.personId;
  if ([...elements.branchSelect.options].some(option => option.value === settings.branchId)) elements.branchSelect.value = settings.branchId;
  if (["descendants", "ancestors", "both"].includes(settings.direction)) elements.directionSelect.value = settings.direction;
  if (Number.isFinite(settings.depth)) elements.depthRange.value = String(clamp(Math.floor(settings.depth), 1, Number(elements.depthRange.max)));
  elements.depthValue.textContent = elements.depthRange.value;
  if (typeof settings.includePhotos === "boolean") elements.includePhotos.checked = settings.includePhotos;
  if (typeof settings.includeDates === "boolean") elements.includeDates.checked = settings.includeDates;
  if (typeof settings.includeTitle === "boolean") elements.includeTitle.checked = settings.includeTitle;
  if (typeof settings.includeQr === "boolean") elements.includeQr.checked = settings.includeQr;
  if (typeof settings.treeTitle === "string") elements.treeTitle.value = settings.treeTitle.slice(0, 60);
  if (["A4", "A3", "A2", "A1", "A0"].includes(settings.paperSize)) elements.paperSize.value = settings.paperSize;
  if (["portrait", "landscape"].includes(settings.orientation)) elements.orientation.value = settings.orientation;
  if (typeof settings.autoFormat === "boolean") elements.autoFormat.checked = settings.autoFormat;
  if (Object.hasOwn(PRINT_THEMES, settings.designTheme)) state.designTheme = settings.designTheme;
  if (Object.hasOwn(PRINT_CARD_STYLES, settings.cardStyle)) state.cardStyle = settings.cardStyle;
  if (Number.isFinite(settings.pageNumber)) state.pageNumber = Math.max(1, Math.floor(settings.pageNumber));
  state.excludedScopeKey = JSON.stringify(getCurrentScope());
  state.excludedPersonIds = restorePageExclusions([...excludedPersonIds], draft.excludedScopeKey, state.excludedScopeKey, validIds);
  syncPrintThemeButtons();
  syncPrintCardStyleButtons();
  return true;
}

function savePrintDraft() {
  if (!state.source || !elements.treeTitle || !state.draftTouched) return;
  const draft = {
    version: 1,
    sourceId: state.source.id,
    personEdits: Object.fromEntries(state.personEdits),
    placementEdits: Object.fromEntries(state.placementEdits),
    excludedPersonIds: [...state.excludedPersonIds],
    excludedScopeKey: state.excludedScopeKey,
    settings: {
      scopeType: state.scopeType,
      personId: elements.personSelect.value,
      branchId: elements.branchSelect.value,
      direction: elements.directionSelect.value,
      depth: Number(elements.depthRange.value),
      includePhotos: elements.includePhotos.checked,
      includeDates: elements.includeDates.checked,
      includeTitle: elements.includeTitle.checked,
      includeQr: elements.includeQr.checked,
      treeTitle: elements.treeTitle.value,
      paperSize: elements.paperSize.value,
      orientation: elements.orientation.value,
      autoFormat: elements.autoFormat.checked,
      designTheme: state.designTheme,
      cardStyle: state.cardStyle,
      pageNumber: state.pageNumber
    }
  };
  try {
    window.localStorage.setItem(getDraftStorageKey(), JSON.stringify(draft));
    draftStorageUnavailable = false;
  } catch {
    draftStorageUnavailable = true;
  }
  updateDraftCopy();
}

function createPrintDraftSnapshot() {
  const sortEntries = entries => Object.fromEntries([...entries].sort(([left], [right]) => left.localeCompare(right)));
  return JSON.stringify({
    personEdits: sortEntries(state.personEdits),
    placementEdits: sortEntries(state.placementEdits),
    excludedPersonIds: [...state.excludedPersonIds].sort(),
    excludedScopeKey: state.excludedScopeKey,
    settings: {
      scopeType: state.scopeType,
      personId: elements.personSelect.value,
      branchId: elements.branchSelect.value,
      direction: elements.directionSelect.value,
      depth: Number(elements.depthRange.value),
      includePhotos: elements.includePhotos.checked,
      includeDates: elements.includeDates.checked,
      includeTitle: elements.includeTitle.checked,
      includeQr: elements.includeQr.checked,
      treeTitle: elements.treeTitle.value,
      paperSize: elements.paperSize.value,
      orientation: elements.orientation.value,
      autoFormat: elements.autoFormat.checked,
      designTheme: state.designTheme,
      cardStyle: state.cardStyle,
      pageNumber: state.pageNumber
    }
  });
}

function syncDraftHistoryControls() {
  elements.undoDraft.disabled = state.undoStack.length === 0;
  elements.redoDraft.disabled = state.redoStack.length === 0;
}

function trackDraftHistory() {
  const snapshot = createPrintDraftSnapshot();
  if (state.lastDraftSnapshot === null) {
    state.lastDraftSnapshot = snapshot;
    state.historyGroup = null;
    syncDraftHistoryControls();
    return;
  }
  if (!state.draftTouched) {
    state.lastDraftSnapshot = snapshot;
    state.historyGroup = null;
    syncDraftHistoryControls();
    return;
  }
  if (snapshot !== state.lastDraftSnapshot) {
    const now = Date.now();
    const coalesce = state.historyGroup && state.historyGroup === state.lastHistoryGroup && now - state.lastHistoryAt < 700;
    if (!coalesce) {
      state.undoStack.push(state.lastDraftSnapshot);
      if (state.undoStack.length > 40) state.undoStack.shift();
    }
    state.redoStack.length = 0;
    state.lastHistoryGroup = state.historyGroup;
    state.lastHistoryAt = now;
    state.lastDraftSnapshot = snapshot;
  }
  state.historyGroup = null;
  syncDraftHistoryControls();
}

function clearDraftHistory() {
  state.undoStack.length = 0;
  state.redoStack.length = 0;
  state.lastDraftSnapshot = null;
  state.historyGroup = null;
  state.lastHistoryGroup = null;
  state.lastHistoryAt = 0;
  syncDraftHistoryControls();
}

function applyDraftHistory(targetStack, oppositeStack, statusMessage) {
  const snapshot = targetStack.pop();
  if (!snapshot) return;
  const current = createPrintDraftSnapshot();
  if (snapshot === current) {
    syncDraftHistoryControls();
    return;
  }
  oppositeStack.push(current);
  if (oppositeStack.length > 40) oppositeStack.shift();
  state.lastDraftSnapshot = snapshot;
  state.historyGroup = null;
  state.lastHistoryGroup = null;
  state.draftTouched = true;
  restorePrintDraft({ version: 1, sourceId: state.source.id, ...JSON.parse(snapshot) });
  syncScopeControls();
  update();
  setStatus(statusMessage, "success");
}

function undoPrintDraft() {
  applyDraftHistory(state.undoStack, state.redoStack, "Предыдущее действие отменено.");
}

function redoPrintDraft() {
  applyDraftHistory(state.redoStack, state.undoStack, "Действие повторено.");
}

function markDraftChanged(historyGroup = null) {
  state.draftTouched = true;
  state.historyGroup = historyGroup;
}

function updateDraftCopy() {
  elements.privacyCopy.textContent = draftStorageUnavailable
    ? "Черновик доступен только в этой вкладке: браузер не разрешил локальное сохранение. Исходное древо не меняется."
    : "После первого изменения черновик автоматически сохраняется локально для этого адреса. Исходное древо и его фото не меняются.";
}

function escapeXml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
  })[character]);
}

let printNameMeasureContext;
function measurePrintNameWidth(value) {
  printNameMeasureContext ??= document.createElement("canvas").getContext("2d");
  if (!printNameMeasureContext) return NaN;
  printNameMeasureContext.font = '600 4.65px "Palatino Linotype", Georgia, serif';
  return printNameMeasureContext.measureText(value).width;
}

function renderSheetBackground(theme, width, height, suffix, viewport = {}) {
  const id = ("waydean-print-" + theme.key + "-" + suffix).replace(/[^a-z0-9_-]/gi, "-");
  const boardWidth = viewport.boardWidth ?? width;
  const boardHeight = viewport.boardHeight ?? height;
  const offsetX = viewport.offsetX ?? 0;
  const offsetY = viewport.offsetY ?? 0;
  return '<defs><clipPath id="' + id + '-clip"><rect width="' + width + '" height="' + height + '"/></clipPath></defs>' +
    '<g clip-path="url(#' + id + '-clip)"><image href="' + theme.backgroundAsset + '" x="' + (-offsetX) + '" y="' + (-offsetY) + '" width="' + boardWidth + '" height="' + boardHeight + '" preserveAspectRatio="xMidYMid slice"/>' +
    '<rect width="' + width + '" height="' + height + '" fill="' + theme.overlay + '" opacity="' + theme.overlayOpacity + '"/></g>';
}

function renderSheetArtwork(theme, width, height, suffix, viewport = {}) {
  return renderSheetBackground(theme, width, height, suffix, viewport) +
    '<rect x="5" y="5" width="' + (width - 10) + '" height="' + (height - 10) + '" fill="none" stroke="' + theme.frame + '" stroke-width=".35"/>' +
    '<rect x="7.3" y="7.3" width="' + (width - 14.6) + '" height="' + (height - 14.6) + '" fill="none" stroke="' + theme.innerFrame + '" stroke-width=".22"/>';
}

function renderTreeQr(x, y, size, theme) {
  const modules = treeQrCode.getModuleCount();
  const quietZone = 4;
  const moduleScale = size / (modules + quietZone * 2);
  const path = [];
  for (let row = 0; row < modules; row += 1) {
    for (let column = 0; column < modules; column += 1) {
      if (treeQrCode.isDark(row, column)) path.push('M' + column + ' ' + row + 'h1v1h-1z');
    }
  }
  const center = size / 2;
  const markSize = size * .09;
  return '<g class="tree-qr" transform="translate(' + x + ' ' + y + ')" pointer-events="none"><title>Открыть семейное дерево на waydean.ru. Потребуется пароль семьи.</title>' +
    '<rect width="' + size + '" height="' + size + '" rx="1.1" fill="#f4eedf" stroke="' + theme.frame + '" stroke-width=".38"/>' +
    '<g transform="translate(' + (quietZone * moduleScale) + ' ' + (quietZone * moduleScale) + ') scale(' + moduleScale + ')"><path d="' + path.join("") + '" fill="#111817" shape-rendering="crispEdges"/></g>' +
    '<circle cx="' + center + '" cy="' + center + '" r="' + markSize + '" fill="#f4eedf" stroke="' + theme.frame + '" stroke-width=".48"/>' +
    '<path d="M ' + center + ' ' + (center + markSize * .58) + ' V ' + (center - markSize * .48) + ' M ' + center + ' ' + (center - markSize * .05) + ' L ' + (center - markSize * .56) + ' ' + (center - markSize * .52) + ' M ' + center + ' ' + (center - markSize * .2) + ' L ' + (center + markSize * .56) + ' ' + (center - markSize * .68) + '" fill="none" stroke="#17211e" stroke-width=".72" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="' + center + '" cy="' + (center - markSize * .55) + '" r=".43" fill="' + theme.frame + '"/><circle cx="' + (center - markSize * .56) + '" cy="' + (center - markSize * .52) + '" r=".43" fill="' + theme.frame + '"/><circle cx="' + (center + markSize * .56) + '" cy="' + (center - markSize * .68) + '" r=".43" fill="' + theme.frame + '"/>' +
    '<text x="' + center + '" y="' + (size + 2.2) + '" text-anchor="middle" fill="' + theme.eyebrow + '" font-family="Arial,sans-serif" font-size="1.45" font-weight="700" letter-spacing=".08em">ОТКРЫТЬ ДРЕВО</text>' +
    '<text x="' + center + '" y="' + (size + 4) + '" text-anchor="middle" fill="' + theme.subtitle + '" font-family="Arial,sans-serif" font-size="1.15" letter-spacing=".04em">WAYDEAN.RU/DREWO</text></g>';
}

function renderPosterMasthead(layout, theme, page = null) {
  const boardWidthMm = layout.pageWidthMm * layout.pageCountX;
  const title = elements.includeTitle.checked ? elements.treeTitle.value.trim() : "СЕМЕЙНОЕ ДРЕВО";
  const subtitle = state.scopeType === "all"
    ? "ПОЛНАЯ ЛИНИЯ · " + layout.personCount + " ЧЕЛОВЕК · " + layout.generationCount + " ПОКОЛЕНИЙ"
    : String(layout.personCount) + " ЧЕЛОВЕК · " + layout.generationCount + " ПОКОЛЕНИЙ";
  const mastheadLayout = getPosterMastheadLayout(layout, { title, subtitle });
  const { titleSize, eyebrowSize, subtitleSize, centerX, dividerHalfWidthMm } = mastheadLayout;
  const qrBelongsOnPage = !page || (page.pageX === layout.pageCountX - 1 && page.pageY === 0);
  const qr = elements.includeQr.checked && qrBelongsOnPage ? renderTreeQr(boardWidthMm - 40, 3.4, 32, theme) : "";
  const masthead = '<g class="poster-masthead" pointer-events="none">' +
    '<text x="' + centerX + '" y="10.5" text-anchor="middle" fill="' + theme.eyebrow + '" font-family="Arial,sans-serif" font-size="' + eyebrowSize + '" font-weight="600" letter-spacing=".22em">WAYDEAN · СЕМЕЙНОЕ ДРЕВО</text>' +
    '<text x="' + centerX + '" y="23" text-anchor="middle" fill="' + theme.title + '" font-family="Georgia,serif" font-size="' + titleSize + '" font-weight="500">' + escapeXml(title) + '</text>' +
    '<text x="' + centerX + '" y="30.5" text-anchor="middle" fill="' + theme.subtitle + '" font-family="Arial,sans-serif" font-size="' + subtitleSize + '" letter-spacing=".14em">' + escapeXml(subtitle) + '</text>' +
    '<path d="M ' + (centerX - dividerHalfWidthMm) + ' 34.3 H ' + (centerX + dividerHalfWidthMm) + '" stroke="' + theme.frame + '" stroke-width=".45"/>' +
    '</g>' + qr;
  if (!page) return masthead;
  const offsetX = page.pageX * layout.pageWidthMm;
  const offsetY = page.pageY * layout.pageHeightMm;
  const clipId = 'poster-header-page-' + page.pageNumber;
  return '<defs><clipPath id="' + clipId + '"><rect width="' + layout.pageWidthMm + '" height="' + layout.pageHeightMm + '"/></clipPath></defs>' +
    '<g clip-path="url(#' + clipId + ')"><g transform="translate(' + -offsetX + ' ' + -offsetY + ')">' + masthead + '</g></g>';
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
  const theme = getPrintTheme();
  const artwork = options.workspace ? "" : renderSheetArtwork(theme, width, height, (options.thumbnail ? "thumbnail-" : "page-") + pageNumber, {
    boardWidth: layout.pageWidthMm * layout.pageCountX,
    boardHeight: layout.pageHeightMm * layout.pageCountY,
    offsetX: page.pageX * width,
    offsetY: page.pageY * height
  });
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
      relationLines.push('<path d="' + getConnectorPath(startX, startY, endX, endY) + '" fill="none" stroke="' + theme.connector + '" stroke-width="0.38" stroke-linecap="square" stroke-linejoin="round"/>');
    }
  }

  for (const placement of people) {
    const person = placement.person;
    const x = placement.xMm;
    const y = placement.yMm;
    const w = placement.widthMm;
    const h = placement.heightMm;
    const selected = Boolean(options.interactive) && person.id === selectedId;
    const fullName = String(person.name ?? "").trim() || "Без имени";
    const years = elements.includeDates.checked ? formatYears(person) : "";
    const teip = String(person.teip ?? "").trim();
    const widthLayout = getPersonCardLayout({ x, y, width: w, height: h, hasDates: Boolean(years), hasTeip: Boolean(teip) });
    const maxNameCharacters = Math.max(7, Math.min(12, Math.floor(widthLayout.textLimit / 2.5)));
    const lines = wrapPersonName(fullName, maxNameCharacters);
    if (lines.length > 2) {
      lines.splice(2);
      lines[1] = lines[1].replace(/[.…]*$/, "") + "…";
    }
    const teipLabel = teip ? "Тейп: " + teip : "";
    const shortTeipLabel = teipLabel.length > 23 ? teipLabel.slice(0, 22) + "…" : teipLabel;
    const card = getPersonCardLayout({ x, y, width: w, height: h, nameLines: lines.length, hasDates: Boolean(years), hasTeip: Boolean(teip) });
    const pages = [...(crossNotes.get(person.id) ?? [])];
    const isPhotoAvailable = !options.thumbnail && Boolean(person.photoUrl && elements.includePhotos?.checked);
    const portraitX = card.portraitX;
    const portraitY = card.portraitY;
    const portraitDiameter = card.portraitRadius * 2;
    const portraitClipId = "print-portrait-" + Array.from(String(person.id), character => character.codePointAt(0).toString(16)).join("-");
    const avatar = isPhotoAvailable
      ? '<defs><clipPath id="' + portraitClipId + '"><circle cx="' + portraitX + '" cy="' + portraitY + '" r="' + card.portraitRadius + '"/></clipPath></defs>' +
        '<circle cx="' + portraitX + '" cy="' + portraitY + '" r="' + card.portraitRingRadius + '" fill="' + theme.portraitBg + '" stroke="' + theme.portraitBorder + '" stroke-width=".28"/>' +
        '<image href="' + escapeXml(person.photoUrl) + '" x="' + (portraitX - card.portraitRadius) + '" y="' + (portraitY - card.portraitRadius) + '" width="' + portraitDiameter + '" height="' + portraitDiameter + '" preserveAspectRatio="xMidYMid slice" clip-path="url(#' + portraitClipId + ')"/>' +
        '<circle cx="' + portraitX + '" cy="' + portraitY + '" r="' + card.portraitRadius + '" fill="none" stroke="' + theme.cardInner + '" stroke-width=".3"/>'
      : '<circle cx="' + portraitX + '" cy="' + portraitY + '" r="' + card.portraitRingRadius + '" fill="' + theme.portraitBg + '" stroke="' + theme.portraitBorder + '" stroke-width=".28"/>' +
        '<circle cx="' + portraitX + '" cy="' + portraitY + '" r="' + card.portraitRadius + '" fill="' + theme.portraitBg + '"/>' +
        '<circle cx="' + portraitX + '" cy="' + (portraitY - 1.7 * card.scale) + '" r="' + (1.55 * card.scale) + '" fill="' + theme.silhouette + '"/>' +
        '<path d="M ' + (portraitX - 3.45 * card.scale) + ' ' + (portraitY + 3.45 * card.scale) + ' C ' + (portraitX - 3.35 * card.scale) + ' ' + (portraitY + 1.15 * card.scale) + ', ' + (portraitX - 1.8 * card.scale) + ' ' + (portraitY + .1 * card.scale) + ', ' + portraitX + ' ' + (portraitY + .1 * card.scale) + ' C ' + (portraitX + 1.8 * card.scale) + ' ' + (portraitY + .1 * card.scale) + ', ' + (portraitX + 3.35 * card.scale) + ' ' + (portraitY + 1.15 * card.scale) + ', ' + (portraitX + 3.45 * card.scale) + ' ' + (portraitY + 3.45 * card.scale) + ' Z" fill="' + theme.silhouette + '"/>';
    const nameMarkup = lines.map((line, index) => {
      const textLength = getNameTextLength(measurePrintNameWidth(line), card.textLimit);
      const fitAttributes = textLength ? ' textLength="' + textLength + '" lengthAdjust="spacingAndGlyphs"' : '';
      return '<tspan x="' + card.nameX + '" dy="' + (index === 0 ? 0 : card.nameLineGap) + '"' + fitAttributes + '>' + escapeXml(line) + '</tspan>';
    }).join("");
    const pageBadges = pages.slice(0, 2).map((otherPage, index) => {
      const badgeX = x + w - 3.8 - index * 6.2;
      return '<g><title>Родственная связь продолжается на листе ' + otherPage + '</title><circle cx="' + badgeX + '" cy="' + (y + 4) + '" r="2.7" fill="' + theme.badge + '"/><text x="' + badgeX + '" y="' + (y + 4.9) + '" text-anchor="middle" class="badge-text">' + otherPage + '</text></g>';
    }).join("");
    const interactionAttributes = options.interactive
      ? ' data-person-id="' + escapeXml(person.id) + '" role="button" tabindex="0" aria-label="Редактировать: ' + escapeXml(person.name) + '"'
      : "";
    nameLines.push(
      '<g class="person-card"' + interactionAttributes + '><title>' + escapeXml(fullName + (years ? ' · ' + years : '') + (teipLabel ? ' · ' + teipLabel : '')) + '</title>' +
      '<rect x="' + (x + .55) + '" y="' + (y + .75) + '" width="' + w + '" height="' + h + '" rx="1.8" fill="#000000" opacity=".18"/>' +
      renderPersonCardFrame({ styleKey: state.cardStyle, x, y, width: w, height: h, theme, selected }) +
      '<text x="' + card.generationX + '" y="' + card.generationY + '" text-anchor="start" class="generation-label">ПОКОЛЕНИЕ ' + placement.generation + '</text>' +
      '<path d="M ' + card.generationX + ' ' + card.ruleY + ' H ' + (x + w - 3.2) + '" stroke="' + theme.rule + '" stroke-opacity=".62" stroke-width=".18"/>' +
      pageBadges + avatar +
      '<text x="' + card.nameX + '" y="' + card.nameY + '" text-anchor="' + card.nameAnchor + '" class="person-name">' + nameMarkup + '</text>' +
      (years ? '<text x="' + card.nameX + '" y="' + card.dateY + '" text-anchor="start" class="person-years">' + escapeXml(years) + '</text>' : '') +
      (teip ? '<text x="' + card.nameX + '" y="' + card.teipY + '" text-anchor="start" class="person-teip"><title>' + escapeXml(teipLabel) + '</title>' + escapeXml(shortTeipLabel) + '</text>' : '') +
      '</g>'
    );
  }

  const subtitle = state.scopeType === "all"
    ? "ПОЛНАЯ ЛИНИЯ · " + layout.personCount + " ЧЕЛОВЕК · " + layout.generationCount + " ПОКОЛЕНИЙ"
    : String(layout.personCount) + " ЧЕЛОВЕК · " + layout.generationCount + " ПОКОЛЕНИЙ";
  const pageMasthead = options.workspace || options.posterMasthead ? "" :
    '<g class="masthead"><text x="' + (width / 2) + '" y="13" text-anchor="middle" class="eyebrow">WAYDEAN · СЕМЕЙНОЕ ДРЕВО</text>' +
    '<text x="' + (width / 2) + '" y="22" text-anchor="middle" class="tree-title">' + escapeXml(title || "СЕМЕЙНОЕ ДРЕВО") + '</text>' +
    '<text x="' + (width / 2) + '" y="28" text-anchor="middle" class="paper-subtitle">' + escapeXml(subtitle) + '</text>' +
    '<path d="M ' + (width / 2 - 15) + ' 32 H ' + (width / 2 + 15) + '" stroke="' + theme.frame + '" stroke-width=".35"/></g>';
  const posterMasthead = options.posterMasthead ? renderPosterMasthead(layout, theme, page) : "";
  const qrMarkup = !options.workspace && !options.thumbnail && !options.posterMasthead && options.includeQr !== false && elements.includeQr.checked
    ? renderTreeQr(width - 40, 3.4, 32, theme)
    : "";

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" class="paper-svg" width="' + width + 'mm" height="' + height + 'mm" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Печатный лист ' + pageNumber + ' из ' + layout.pageCount + '">',
    '<title>' + escapeXml(title || "Семейное древо") + ' · лист ' + pageNumber + '</title>',
    '<style>.paper-title{font-family:Georgia,serif;fill:' + theme.title + ';letter-spacing:.08em}.eyebrow{font-family:Arial,sans-serif;fill:' + theme.eyebrow + ';letter-spacing:.18em;font-size:2.2px}.tree-title{font-family:Georgia,serif;fill:' + theme.title + ';font-size:5.5px}.paper-subtitle{font-family:Arial,sans-serif;fill:' + theme.subtitle + ';font-size:2.4px;letter-spacing:.13em}.generation-label{font-family:Arial,sans-serif;fill:' + theme.generation + ';font-size:1.8px;font-weight:700;letter-spacing:.16em}.person-name{font-family:\'Palatino Linotype\',Georgia,serif;fill:' + theme.name + ';font-size:4.65px;font-weight:600}.person-years{font-family:Arial,sans-serif;fill:' + theme.years + ';font-size:2.65px;font-weight:600;letter-spacing:.08em}.person-teip{font-family:Arial,sans-serif;fill:' + theme.years + ';font-size:2.15px;font-weight:500;letter-spacing:.035em}.badge-text{font-family:Arial,sans-serif;fill:' + theme.badgeText + ';font-size:2.2px}</style>',
    artwork,
    pageMasthead, posterMasthead, qrMarkup,
    '<g class="tree-content"' + treeTransform + '>', relationLines.join(""), nameLines.join(""), '</g>',
    options.workspace ? "" : '<text x="' + (width / 2) + '" y="' + (height - 9) + '" text-anchor="middle" class="paper-subtitle">ЛИСТ ' + pageNumber + ' ИЗ ' + layout.pageCount + ' · WAYDEAN</text>',
    '</svg>'
  ].join("");
}

function renderWorkspaceSvg(layout, { interactive = true } = {}) {
  const boardWidthMm = layout.pageWidthMm * layout.pageCountX;
  const boardHeightMm = layout.pageHeightMm * layout.pageCountY;
  const theme = getPrintTheme();
  const placementById = new Map(layout.placements.map(item => [item.person.id, item]));
  const background = renderSheetBackground(theme, boardWidthMm, boardHeightMm, "board-background");
  const surfaces = layout.pages.map(page => {
    const x = page.pageX * layout.pageWidthMm;
    const y = page.pageY * layout.pageHeightMm;
    const active = interactive && page.pageNumber === state.pageNumber;
    return '<g class="workspace-sheet-surface' + (active ? ' is-active' : '') + '" transform="translate(' + x + ' ' + y + ')" pointer-events="none">' +
      '<rect width="' + layout.pageWidthMm + '" height="' + layout.pageHeightMm + '" fill="none" stroke="' + theme.frame + '" stroke-width="1.1"/>' +
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
    return '<path class="workspace-cross-link" d="' + getConnectorPath(startX, startY, endX, endY) + '"/>';
  }).join("");
  const pageContent = layout.pages.map(page => {
    const pageSvg = renderSvg(layout, page.pageNumber, { workspace: true, interactive });
    const pageBody = pageSvg.replace(/^<svg\b[^>]*>/, "").replace(/<\/svg>$/, "");
    const pageAttributes = interactive ? ' is-active" data-page-number="' + page.pageNumber : '"';
    const hitArea = interactive
      ? '<rect class="workspace-hit-area" width="' + layout.pageWidthMm + '" height="' + layout.pageHeightMm + '" fill="transparent"/>'
      : "";
    return '<g class="workspace-page' + pageAttributes + '" transform="translate(' + (page.pageX * layout.pageWidthMm) + ' ' + (page.pageY * layout.pageHeightMm) + ')">' + hitArea + pageBody + '</g>';
  }).join("");
  const pageOverlays = layout.pages.map(page => {
    const active = interactive && page.pageNumber === state.pageNumber;
    return '<g class="workspace-sheet-overlay' + (active ? ' is-active' : '') + '" transform="translate(' + (page.pageX * layout.pageWidthMm) + ' ' + (page.pageY * layout.pageHeightMm) + ')" pointer-events="none">' +
      '<g class="workspace-page-index' + (active ? ' is-active' : '') + '" aria-hidden="true"><rect x="7.5" y="7.5" width="31" height="8" rx="1.6"/><text x="10.5" y="13" text-anchor="start" class="workspace-page-label">ЛИСТ ' + page.pageNumber + '</text></g>' +
      '<rect class="workspace-page-outline' + (active ? ' is-active' : '') + '" x=".6" y=".6" width="' + (layout.pageWidthMm - 1.2) + '" height="' + (layout.pageHeightMm - 1.2) + '"/>' +
      '</g>';
  }).join("");

  const interactionStyles = interactive
    ? '.workspace-hit-area{fill:transparent;pointer-events:all}.person-card{cursor:grab;touch-action:none}.person-card:active{cursor:grabbing}'
    : "";
  const workspaceThemeStyles = '.workspace-page-label{font-family:Arial,sans-serif;fill:' + theme.pageLabel + ';font-size:2.7px;font-weight:600;letter-spacing:.1em}.workspace-cross-link{fill:none;stroke:' + theme.connector + ';stroke-width:.38;stroke-linecap:square;stroke-linejoin:round;opacity:.58;pointer-events:none}.workspace-page-outline{fill:none;stroke:transparent;stroke-width:1.25;pointer-events:none}.workspace-page-outline.is-active{stroke:' + theme.selectedBorder + ';stroke-width:1.7}.workspace-page-index rect{fill:' + theme.pageIndex + ';stroke:' + theme.pageIndexBorder + ';stroke-width:.35}.workspace-page-index.is-active rect{fill:' + theme.selectedPageIndex + ';stroke:' + theme.selectedPageBorder + ';stroke-width:.55}.workspace-sheet-overlay.is-active{filter:drop-shadow(0 0 1.1px rgba(190,153,77,.45))}.workspace-snap-guide{stroke:' + theme.selectedBorder + ';stroke-width:.28;stroke-dasharray:1.25 .85;opacity:.94;filter:drop-shadow(0 0 .55px rgba(240,201,107,.7));pointer-events:none}';
  return '<svg xmlns="http://www.w3.org/2000/svg" class="paper-svg workspace-svg" width="' + boardWidthMm + 'mm" height="' + boardHeightMm + 'mm" viewBox="0 0 ' + boardWidthMm + ' ' + boardHeightMm + '" role="group" aria-label="Общее рабочее поле, ' + layout.pageCount + ' листов">' +
    '<style>.workspace-page>rect:nth-of-type(n+2):nth-of-type(-n+4){visibility:hidden}' + workspaceThemeStyles + interactionStyles + '</style>' +
    background + surfaces + '<g class="workspace-cross-links" aria-hidden="true">' + crossPageLinks + '</g>' + pageContent + renderPosterMasthead(layout, theme) + pageOverlays + '</svg>';
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
  elements.pageGrid.innerHTML = layout.pages.map(page => {
    const thumbnail = renderSvg(layout, page.pageNumber, { thumbnail: true });
    const active = page.pageNumber === state.pageNumber;
    const removalDisabled = layout.pageCount <= 1;
    return '<div class="tile-card"><button type="button" class="tile-button' + (active ? ' is-active' : '') + '" data-page="' + page.pageNumber + '" style="aspect-ratio:' + layout.pageWidthMm + ' / ' + layout.pageHeightMm + '" aria-label="Открыть лист ' + page.pageNumber + ' из ' + layout.pageCount + '"' + (active ? ' aria-current="page"' : '') + '><span class="tile-preview" aria-hidden="true">' + thumbnail + '</span><small>Лист ' + page.pageNumber + '</small></button><button type="button" class="tile-remove" data-remove-page="' + page.pageNumber + '" aria-label="Убрать лист ' + page.pageNumber + ' вместе с его карточками из печатного макета" title="Убрать лист вместе с карточками"' + (removalDisabled ? ' disabled' : '') + '>×</button></div>';
  }).join("");
  elements.pageGrid.style.gridTemplateColumns = "repeat(" + Math.min(Math.max(layout.pageCountX, 1), 4) + ", minmax(0, 1fr))";
  elements.pageGrid.querySelectorAll("[data-page]").forEach(button => button.addEventListener("click", () => {
    state.pageNumber = Number(button.dataset.page);
    markDraftChanged();
    update();
    focusWorkspacePage(state.pageNumber, true, "page");
  }));
  elements.pageGrid.querySelectorAll("[data-remove-page]").forEach(button => button.addEventListener("click", event => {
    event.stopPropagation();
    removePrintPage(Number(button.dataset.removePage));
  }));
}

function removePrintPage(pageNumber) {
  if (!state.currentLayout || state.currentLayout.pageCount <= 1) return;
  const personIds = getPagePersonIds(state.currentLayout, pageNumber);
  if (!personIds.length) {
    setStatus("На этом листе нет карточек для удаления.");
    return;
  }
  const confirmed = window.confirm("Убрать лист " + pageNumber + " вместе с карточками " + personIds.length + " человек из этого печатного макета? Оставшиеся карточки перераспределятся. Исходное древо не изменится; действие можно отменить.");
  if (!confirmed) return;

  markDraftChanged("remove-page:" + pageNumber);
  state.excludedPersonIds = excludePagePersonIds(state.excludedPersonIds, state.currentLayout, pageNumber);
  state.excludedScopeKey = JSON.stringify(getCurrentScope());
  state.pageNumber = Math.max(1, pageNumber - 1);
  update();
  setStatus("Лист убран из печатного макета. Исключено карточек: " + personIds.length + ". Исходное древо сохранено; правку можно отменить.", "success");
}

function setStatus(message, kind = "normal") {
  elements.exportStatus.textContent = message;
  elements.exportStatus.dataset.kind = kind;
}

function renderPrintable(layout) {
  elements.printPages.innerHTML = layout.pages.map(page =>
    '<section class="print-page" style="--page-width:' + page.pageWidthMm + 'mm;--page-height:' + page.pageHeightMm + 'mm">' + renderSvg(layout, page.pageNumber, { posterMasthead: true }) + '</section>'
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
  const scopedPeople = getScopedPeople(state.source.people, getCurrentScope());
  const currentScopeKey = JSON.stringify(getCurrentScope());
  if (state.excludedScopeKey && state.excludedScopeKey !== currentScopeKey) state.excludedPersonIds.clear();
  state.excludedScopeKey = currentScopeKey;
  state.currentPeople = scopedPeople.filter(person => !state.excludedPersonIds.has(person.id)).map(person => ({
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
  trackDraftHistory();

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
    elements.paperPreview.innerHTML = '<div class="empty-preview"><span>◇</span><strong>' + (scopedPeople.length ? 'Все карточки этого охвата исключены' : 'В этом охвате нет людей') + '</strong><small>' + (scopedPeople.length ? 'Отмени действие в истории правок, чтобы вернуть их.' : 'Измени ветвь или глубину поколений.') + '</small></div>';
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
    savePrintDraft();
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
    ? "Все листы связаны на одном полотне. Крестик убирает лист вместе с его карточками; исходное древо сохранится, правку можно отменить."
    : "Один лист нельзя убрать отдельно. Макет целиком помещается на лист.";
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
  savePrintDraft();
}

const CSS_PIXELS_PER_MM = 96 / 25.4;

function setWorkspaceDimensions() {
  if (!state.currentLayout || !state.workspaceZoom) return;
  state.workspaceZoom = clampWorkspaceZoom(state.workspaceZoom);
  const widthMm = state.currentLayout.pageWidthMm * state.currentLayout.pageCountX;
  const heightMm = state.currentLayout.pageHeightMm * state.currentLayout.pageCountY;
  elements.paperPreview.style.width = Math.max(1, widthMm * CSS_PIXELS_PER_MM * state.workspaceZoom) + "px";
  elements.paperPreview.style.height = Math.max(1, heightMm * CSS_PIXELS_PER_MM * state.workspaceZoom) + "px";
  const percent = state.workspaceZoom * 100;
  elements.zoomValue.textContent = (percent < 1 ? percent.toFixed(1) : Math.round(percent)) + "%";
}

function updateWorkspaceViewControl() {
  elements.fitPreview.textContent = "Вписать полотно";
  elements.fitPreview.title = "Вписать все печатные листы в рабочее поле";
}

function applyWorkspaceZoom(nextZoom, clientX, clientY, mode = "manual") {
  if (!state.currentLayout) return;
  const stage = elements.paperStage;
  const previousZoom = state.workspaceZoom;
  const modeChanged = state.workspaceZoomMode !== mode;
  state.workspaceZoom = clampWorkspaceZoom(nextZoom);
  state.workspaceZoomMode = mode;
  if (modeChanged) updateWorkspaceViewControl();
  if (Math.abs(state.workspaceZoom - previousZoom) < 0.00001) return;
  const stageRect = stage.getBoundingClientRect();
  const anchorX = clientX ?? (stageRect.left + stage.clientWidth / 2);
  const anchorY = clientY ?? (stageRect.top + stage.clientHeight / 2);
  const paperRect = elements.paperPreview.getBoundingClientRect();
  const paperOffsetX = anchorX - paperRect.left;
  const paperOffsetY = anchorY - paperRect.top;
  setWorkspaceDimensions();
  if (previousZoom > 0) {
    const ratio = state.workspaceZoom / previousZoom;
    stage.scrollLeft = Math.max(0, stage.scrollLeft + paperOffsetX * (ratio - 1));
    stage.scrollTop = Math.max(0, stage.scrollTop + paperOffsetY * (ratio - 1));
  }
}

let workspaceZoomFrame = 0;
let pendingWorkspaceZoomLog = 0;
let pendingWorkspaceZoomAnchor = null;

function clearQueuedWorkspaceZoom() {
  if (workspaceZoomFrame) cancelAnimationFrame(workspaceZoomFrame);
  workspaceZoomFrame = 0;
  pendingWorkspaceZoomLog = 0;
  pendingWorkspaceZoomAnchor = null;
}

function setWorkspaceZoom(nextZoom, clientX, clientY, mode = "manual") {
  clearQueuedWorkspaceZoom();
  applyWorkspaceZoom(nextZoom, clientX, clientY, mode);
}

function queueWorkspaceZoom(factor, clientX, clientY, mode = "manual") {
  if (!Number.isFinite(factor) || factor <= 0) return;
  pendingWorkspaceZoomLog = clamp(pendingWorkspaceZoomLog + Math.log(factor), -Math.log(350), Math.log(350));
  pendingWorkspaceZoomAnchor = { x: clientX, y: clientY, mode };
  if (workspaceZoomFrame) return;
  workspaceZoomFrame = requestAnimationFrame(() => {
    const zoomFactor = Math.exp(pendingWorkspaceZoomLog);
    const anchor = pendingWorkspaceZoomAnchor;
    workspaceZoomFrame = 0;
    pendingWorkspaceZoomLog = 0;
    pendingWorkspaceZoomAnchor = null;
    if (!anchor || Math.abs(zoomFactor - 1) < 0.00001) return;
    applyWorkspaceZoom(state.workspaceZoom * zoomFactor, anchor.x, anchor.y, anchor.mode);
  });
}

function fitWorkspace() {
  const layout = state.currentLayout;
  if (!layout?.pageCount) return;
  const stage = elements.paperStage;
  const boardWidthPx = layout.pageWidthMm * layout.pageCountX * CSS_PIXELS_PER_MM;
  const boardHeightPx = layout.pageHeightMm * layout.pageCountY * CSS_PIXELS_PER_MM;
  const scale = getViewportFitZoom({
    stageWidth: stage.clientWidth,
    stageHeight: stage.clientHeight,
    contentWidth: boardWidthPx,
    contentHeight: boardHeightPx,
    maxZoom: 1.5
  });
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
    const scale = getViewportFitZoom({
      stageWidth: stage.clientWidth,
      stageHeight: stage.clientHeight,
      contentWidth: layout.pageWidthMm * CSS_PIXELS_PER_MM,
      contentHeight: layout.pageHeightMm * CSS_PIXELS_PER_MM,
      maxZoom: 1.5
    });
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
      startPageNumber: placement.pageNumber,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPointX: point.x,
      startPointY: point.y,
      startX: workspacePoint.x,
      startY: workspacePoint.y,
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
      drag.guidesLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      drag.guidesLayer.setAttribute("class", "workspace-snap-guides");
      drag.guidesLayer.setAttribute("aria-hidden", "true");
      svg.append(drag.guidesLayer, drag.card);
    }
    const point = localSvgPoint(event, svg);
    const placement = state.currentLayout.placements.find(item => item.person.id === drag.personId);
    if (!placement) return;
    const rawX = drag.startX + point.x - drag.startPointX;
    const rawY = drag.startY + point.y - drag.startPointY;
    const peers = state.currentLayout.placements.filter(item => item.person.id !== drag.personId).map(item => {
      const workspacePoint = getWorkspacePoint(item);
      return { ...workspacePoint, width: item.widthMm, height: item.heightMm };
    });
    const snap = snapPlacementToPeers(
      { x: rawX, y: rawY, width: placement.widthMm, height: placement.heightMm },
      peers,
      7 / (CSS_PIXELS_PER_MM * Math.max(state.workspaceZoom, .01))
    );
    const next = placeInWorkspace(state.currentLayout, placement, snap.x, snap.y);
    drag.nextPlacement = next;
    drag.card.setAttribute("transform", "translate(" + next.workspaceXmm + " " + next.workspaceYmm + ")");
    const visibleGuides = {};
    if (Number.isFinite(snap.guides.x) && Math.abs(next.workspaceXmm - snap.x) < .02) visibleGuides.x = snap.guides.x;
    if (Number.isFinite(snap.guides.y) && Math.abs(next.workspaceYmm - snap.y) < .02) visibleGuides.y = snap.guides.y;
    const guideLines = [];
    if (Number.isFinite(visibleGuides.x)) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", visibleGuides.x); line.setAttribute("x2", visibleGuides.x);
      line.setAttribute("y1", "0"); line.setAttribute("y2", String(state.currentLayout.pageHeightMm * state.currentLayout.pageCountY));
      line.setAttribute("class", "workspace-snap-guide"); guideLines.push(line);
    }
    if (Number.isFinite(visibleGuides.y)) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", "0"); line.setAttribute("x2", String(state.currentLayout.pageWidthMm * state.currentLayout.pageCountX));
      line.setAttribute("y1", visibleGuides.y); line.setAttribute("y2", visibleGuides.y);
      line.setAttribute("class", "workspace-snap-guide"); guideLines.push(line);
    }
    drag.guidesLayer.replaceChildren(...guideLines);
  });

  svg.addEventListener("pointerup", event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const finished = drag;
    drag = null;
    if (finished.moved && finished.nextPlacement) {
      markDraftChanged();
      state.placementEdits.set(finished.personId, {
        workspaceXmm: finished.nextPlacement.workspaceXmm,
        workspaceYmm: finished.nextPlacement.workspaceYmm
      });
      state.pageNumber = finished.nextPlacement.pageNumber;
      suppressClick = true;
      window.setTimeout(() => { suppressClick = false; }, 300);
      update();
      if (finished.startPageNumber !== state.pageNumber && state.workspaceZoomMode !== "fit") {
        focusWorkspacePage(state.pageNumber);
      }
      const movedPerson = state.currentPeople.find(person => person.id === finished.personId);
      setStatus("Карточка «" + (movedPerson?.name || "человек") + "» перенесена на лист " + state.pageNumber + ". Правка действует только в макете.", "success");
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
      markDraftChanged();
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
    dialog.innerHTML = '<form method="dialog"><h2>Карточка человека</h2><label>Имя<input name="name" required maxlength="120"></label><label>Тейп<input name="teip" maxlength="80" autocomplete="off"></label><label>Год рождения<input name="born" inputmode="numeric" maxlength="12"></label><label>Год смерти<input name="died" inputmode="numeric" maxlength="12"></label><div class="editor-actions"><button type="button" data-cancel>Отмена</button><button type="submit">Сохранить в макете</button></div></form>';
    document.body.append(dialog);
    dialog.querySelector("[data-cancel]").addEventListener("click", () => dialog.close());
    dialog.addEventListener("submit", event => {
      event.preventDefault();
      const id = dialog.dataset.personId;
      const [name, teip, born, died] = ["name", "teip", "born", "died"].map(field => dialog.elements[field].value.trim());
      if (!name) return;
      markDraftChanged();
      state.personEdits.set(id, { name, teip, born, died });
      dialog.close();
      update();
      setStatus("Изменения применены к макету и его экспорту.", "success");
    });
  }
  dialog.dataset.personId = personId;
  for (const field of ["name", "teip", "born", "died"]) dialog.elements[field].value = person[field] ?? "";
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
  state.scopeType = requestedScope;

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
  clearDraftHistory();
  state.personEdits.clear();
  state.placementEdits.clear();
  state.excludedPersonIds.clear();
  state.excludedScopeKey = null;
  state.draftTouched = false;
  state.scopeType = state.source.id === "hoti" ? "all" : "person";
  state.pageNumber = 1;
  populateSelects();
  const sourceDraftRestored = restorePrintDraft(readPrintDraft());
  syncScopeControls();
  const url = new URL(window.location.href);
  if (state.source.id === "hoti") url.searchParams.set("tree", "hoti");
  else url.searchParams.delete("tree");
  window.history.replaceState(null, "", url);
  update();
  updateSourceCopy();
  setStatus(sourceDraftRestored
    ? "Локальный черновик для этого дерева восстановлен."
    : state.source.id === "hoti"
      ? "Древо HOTI готово к макету."
      : "Демонстрационное древо готово к макету.");
}

function updateSourceCopy() {
  updateDraftCopy();
  document.getElementById("footerDataMode").textContent = state.source.id === "hoti"
    ? "Источник: HOTI"
    : "Источник: демонстрационное дерево";
}

function resetPrintDraft() {
  try {
    window.localStorage.removeItem(getDraftStorageKey());
    draftStorageUnavailable = false;
  } catch {
    draftStorageUnavailable = true;
  }
  updateDraftCopy();
  markDraftChanged();
  state.personEdits.clear();
  state.placementEdits.clear();
  state.excludedPersonIds.clear();
  state.excludedScopeKey = null;
  state.scopeType = state.source.id === "hoti" ? "all" : "person";
  state.pageNumber = 1;
  elements.includePhotos.checked = true;
  elements.includeDates.checked = true;
  elements.includeTitle.checked = true;
  elements.includeQr.checked = false;
  elements.treeTitle.value = "История рода";
  state.designTheme = "heritage";
  state.cardStyle = "glass";
  syncPrintThemeButtons();
  syncPrintCardStyleButtons();
  elements.paperSize.value = "A4";
  elements.orientation.value = "portrait";
  elements.autoFormat.checked = true;
  populateSelects();
  syncScopeControls();
  update();
  setStatus("Локальные правки макета сброшены. Исходное древо не менялось.", "success");
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

function fileStem(scope = "page") {
  const source = elements.includeTitle.checked ? elements.treeTitle.value : "waydean-tree";
  const safe = source.toLocaleLowerCase("ru-RU").replace(/[^a-z0-9а-яё]+/giu, "-").replace(/^-|-$/g, "");
  const suffix = scope === "all" ? "-all-pages" : scope === "data" ? "-tree-data" : "-page-" + state.pageNumber;
  return (safe || "waydean-tree") + "-" + elements.paperSize.value.toLowerCase() + suffix;
}

function jsonDate(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return /^-?\d{1,4}$/.test(text) ? Number(text) : text;
}

function applyLocalEditsToRawTree(person) {
  if (!person || typeof person !== "object" || Array.isArray(person)) return person;
  const id = String(person.id ?? "");
  const edit = state.personEdits.get(id);
  const next = { ...person };
  if (edit) {
    if (typeof edit.name === "string") next.name = edit.name;
    if (typeof edit.teip === "string") next.teip = edit.teip;
    if (Object.hasOwn(edit, "born")) next.born = jsonDate(edit.born);
    if (Object.hasOwn(edit, "died")) next.died = jsonDate(edit.died);
  }
  if (Array.isArray(person.sons)) next.sons = person.sons.map(applyLocalEditsToRawTree);
  return next;
}

function getExportTreeData() {
  if (state.source.rawTree) return applyLocalEditsToRawTree(state.source.rawTree);
  return {
    id: state.source.id,
    people: state.source.people.map(person => {
      const { photoUrl, ...safePerson } = person;
      return { ...safePerson, ...(state.personEdits.get(person.id) ?? {}) };
    })
  };
}

function downloadTreeJson() {
  if (!state.currentLayout || !state.source) return;
  const data = {
    format: "waydean-family-tree-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    source: { id: state.source.id, label: state.source.label },
    tree: getExportTreeData(),
    print: {
      title: elements.includeTitle.checked ? elements.treeTitle.value.trim() : "СЕМЕЙНОЕ ДРЕВО",
      scope: getScopeDescription(state.currentPeople),
      paperSize: elements.paperSize.value,
      orientation: elements.orientation.value,
      design: state.designTheme,
      background: state.designTheme,
      cardDesign: state.cardStyle,
      includePhotos: elements.includePhotos.checked,
      includeDates: elements.includeDates.checked,
      includeQr: elements.includeQr.checked,
      pages: state.currentLayout.pageCount,
      peopleInLayout: state.currentLayout.placements.map(placement => ({
        personId: placement.person.id,
        generation: placement.generation,
        page: placement.pageNumber,
        positionMm: {
          x: Number(placement.xMm.toFixed(2)),
          y: Number(placement.yMm.toFixed(2)),
          width: placement.widthMm,
          height: placement.heightMm
        }
      }))
    },
    photos: { included: false, note: "Фотофайлы и локальные адреса не включены; исходные метки наличия фото остаются в данных дерева." }
  };
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }), fileStem("data") + ".json");
  setStatus("JSON с полным деревом и расположением карточек сохранён в браузере. Фотофайлы не включены.", "success");
}

async function exportSvg(svgMarkup = state.currentSvg, filename = fileStem(), successMessage = "SVG текущего листа создан.") {
  if (!svgMarkup) return;
  setStatus("Подготавливаю SVG с фоном и фотографиями.");
  try {
    const allowedAssetRoots = [new URL("../../assets/demo/", import.meta.url), new URL("./assets/backgrounds/", import.meta.url)];
    const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
    if (state.source.id === "hoti" && loopbackHosts.has(location.hostname)) {
      allowedAssetRoots.push(new URL("../../../../../drewo/photos/", import.meta.url));
    }
    const portableSvg = await embedSvgImageAssets(svgMarkup, async href => {
      const url = new URL(href, document.baseURI);
      const isAllowedLocalAsset = allowedAssetRoots.some(root => url.pathname.startsWith(root.pathname));
      if (url.origin !== location.origin || !isAllowedLocalAsset) {
        throw new Error("Only approved same-origin print images can be embedded.");
      }
      return fetch(url.href, { credentials: "same-origin" });
    });
    downloadBlob(new Blob([portableSvg], { type: "image/svg+xml;charset=utf-8" }), filename + ".svg");
    setStatus(successMessage + " Фон и доступные фотографии встроены в файл.", "success");
  } catch {
    setStatus("Не удалось встроить фон или фото в SVG. Проверь доступность изображений и повтори попытку.", "error");
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
restoredDraft = restorePrintDraft(readPrintDraft());
if (!restoredDraft || requestedHandoff) applyRequestedRoute();
updateSourceCopy();
syncScopeControls();
document.querySelectorAll("[data-scope]").forEach(button => button.addEventListener("click", () => {
  state.scopeType = button.dataset.scope;
  markDraftChanged();
  state.pageNumber = 1;
  syncScopeControls();
  update();
}));

document.querySelectorAll("[data-print-theme]").forEach(button => button.addEventListener("click", () => {
  const nextTheme = button.dataset.printTheme;
  if (!Object.hasOwn(PRINT_THEMES, nextTheme) || nextTheme === state.designTheme) return;
  state.designTheme = nextTheme;
  markDraftChanged("control:designTheme");
  syncPrintThemeButtons();
  update();
}));

document.querySelectorAll("[data-print-card-style]").forEach(button => button.addEventListener("click", () => {
  const nextStyle = button.dataset.printCardStyle;
  if (!Object.hasOwn(PRINT_CARD_STYLES, nextStyle) || nextStyle === state.cardStyle) return;
  state.cardStyle = nextStyle;
  markDraftChanged("control:cardStyle");
  syncPrintCardStyleButtons();
  update();
  setStatus("Оформление карточек обновлено. Масштаб и размер печати не менялись.", "success");
}));

for (const control of [elements.personSelect, elements.branchSelect, elements.directionSelect, elements.depthRange, elements.includePhotos, elements.includeDates, elements.includeTitle, elements.includeQr, elements.treeTitle]) {
  const updateFromControl = () => { markDraftChanged("control:" + control.id); update(); };
  control.addEventListener("input", updateFromControl);
  control.addEventListener("change", updateFromControl);
}

elements.paperSize.addEventListener("change", () => { markDraftChanged("control:" + elements.paperSize.id); elements.autoFormat.checked = false; update(); });
elements.orientation.addEventListener("change", () => { markDraftChanged("control:" + elements.orientation.id); elements.autoFormat.checked = false; update(); });
elements.autoFormat.addEventListener("change", () => { markDraftChanged("control:" + elements.autoFormat.id); update(); });
elements.undoDraft.addEventListener("click", undoPrintDraft);
elements.redoDraft.addEventListener("click", redoPrintDraft);
elements.resetDraft.addEventListener("click", resetPrintDraft);
elements.applyRecommendation.addEventListener("click", () => {
  if (!state.currentPeople.length) return;
  markDraftChanged();
  const recommendation = recommendPaper(state.currentPeople, layoutOptions);
  elements.paperSize.value = recommendation.paperSize;
  elements.orientation.value = recommendation.orientation;
  elements.autoFormat.checked = true;
  update();
});
elements.depthRange.addEventListener("input", () => { elements.depthValue.value = elements.depthRange.value; });
elements.previousPage.addEventListener("click", () => {
  markDraftChanged();
  state.pageNumber = Math.max(1, state.pageNumber - 1);
  update();
  focusWorkspacePage(state.pageNumber, true, "page");
});
elements.nextPage.addEventListener("click", () => {
  markDraftChanged();
  state.pageNumber = Math.min(state.currentLayout.pageCount, state.pageNumber + 1);
  update();
  focusWorkspacePage(state.pageNumber, true, "page");
});
elements.zoomOut.addEventListener("click", () => setWorkspaceZoom(state.workspaceZoom / 1.2));
elements.zoomIn.addEventListener("click", () => setWorkspaceZoom(state.workspaceZoom * 1.2));
elements.fitPreview.addEventListener("click", () => {
  fitWorkspace();
  setStatus("Всё рабочее полотно вписано в область просмотра. Настройки печатных листов не менялись.", "success");
});

let stageGesture = null;
const stagePointers = new Map();
let ignoreWorkspaceClickUntil = 0;
const getStagePointerPair = () => {
  const [first, second] = [...stagePointers.values()];
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
    distance: Math.hypot(first.x - second.x, first.y - second.y)
  };
};
const beginStagePan = (pointer, pageNumber = null) => ({
  type: "pan",
  pointerId: pointer.pointerId,
  startX: pointer.x,
  startY: pointer.y,
  scrollLeft: elements.paperStage.scrollLeft,
  scrollTop: elements.paperStage.scrollTop,
  pageNumber,
  moved: false
});
elements.paperStage.addEventListener("pointerdown", event => {
  if (event.button !== 0 || event.target.closest?.(".person-card")) return;
  const pointer = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  stagePointers.set(event.pointerId, pointer);
  elements.paperStage.setPointerCapture(event.pointerId);
  if (stagePointers.size > 1) {
    const pair = getStagePointerPair();
    stageGesture = { type: "pinch", lastX: pair.x, lastY: pair.y, lastDistance: pair.distance, moved: false };
  } else {
    const pageNumber = Number(event.target.closest?.(".workspace-page[data-page-number]")?.dataset.pageNumber) || null;
    stageGesture = beginStagePan(pointer, pageNumber);
  }
  elements.paperStage.classList.add("is-panning");
});
elements.paperStage.addEventListener("pointermove", event => {
  const pointer = stagePointers.get(event.pointerId);
  if (!pointer) return;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  if (stagePointers.size > 1) {
    const pair = getStagePointerPair();
    const before = stageGesture?.type === "pinch"
      ? { x: stageGesture.lastX, y: stageGesture.lastY, distance: stageGesture.lastDistance }
      : pair;
    stageGesture = stageGesture?.type === "pinch"
      ? stageGesture
      : { type: "pinch", lastX: before.x, lastY: before.y, lastDistance: before.distance, moved: false };
    const deltaX = pair.x - before.x;
    const deltaY = pair.y - before.y;
    if (Math.hypot(deltaX, deltaY) > 2 || Math.abs(pair.distance - before.distance) > 2) stageGesture.moved = true;
    elements.paperStage.scrollLeft -= deltaX;
    elements.paperStage.scrollTop -= deltaY;
    if (before.distance > 0 && pair.distance > 0 && Math.abs(pair.distance - before.distance) > 0.5) {
      queueWorkspaceZoom(pair.distance / before.distance, pair.x, pair.y, "manual");
    }
    stageGesture.lastX = pair.x;
    stageGesture.lastY = pair.y;
    stageGesture.lastDistance = pair.distance;
    event.preventDefault();
    return;
  }
  if (stageGesture?.type !== "pan" || event.pointerId !== stageGesture.pointerId) return;
  const dx = event.clientX - stageGesture.startX;
  const dy = event.clientY - stageGesture.startY;
  if (Math.hypot(dx, dy) > 4) stageGesture.moved = true;
  if (stageGesture.moved) {
    elements.paperStage.scrollLeft = stageGesture.scrollLeft - dx;
    elements.paperStage.scrollTop = stageGesture.scrollTop - dy;
  }
});
elements.paperStage.addEventListener("pointerup", event => {
  if (!stagePointers.has(event.pointerId)) return;
  const ending = stagePointers.get(event.pointerId);
  const gesture = stageGesture;
  stagePointers.delete(event.pointerId);
  if (elements.paperStage.hasPointerCapture(event.pointerId)) elements.paperStage.releasePointerCapture(event.pointerId);
  if (gesture?.type === "pinch") {
    ignoreWorkspaceClickUntil = Date.now() + 250;
    const remaining = [...stagePointers.values()][0];
    stageGesture = remaining ? beginStagePan(remaining) : null;
    if (!remaining) elements.paperStage.classList.remove("is-panning");
    return;
  }
  if (gesture?.type !== "pan" || event.pointerId !== gesture.pointerId) return;
  if (gesture.moved) ignoreWorkspaceClickUntil = Date.now() + 250;
  stageGesture = null;
  elements.paperStage.classList.remove("is-panning");
  if (!gesture.moved && gesture.pageNumber && gesture.pageNumber !== state.pageNumber) {
    state.pageNumber = gesture.pageNumber;
    update();
    focusWorkspacePage(state.pageNumber);
  }
});
elements.paperStage.addEventListener("pointercancel", event => {
  if (stagePointers.has(event.pointerId)) stagePointers.delete(event.pointerId);
  if (elements.paperStage.hasPointerCapture(event.pointerId)) elements.paperStage.releasePointerCapture(event.pointerId);
  const remaining = [...stagePointers.values()][0];
  if (stagePointers.size > 1) {
    const pair = getStagePointerPair();
    stageGesture = { type: "pinch", lastX: pair.x, lastY: pair.y, lastDistance: pair.distance, moved: true };
  } else if (remaining) stageGesture = beginStagePan(remaining);
  else {
    stageGesture = null;
    elements.paperStage.classList.remove("is-panning");
  }
});
elements.paperStage.addEventListener("wheel", event => {
  event.preventDefault();
  const deltaY = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * elements.paperStage.clientHeight : event.deltaY;
  const factor = Math.exp(-deltaY * .001);
  queueWorkspaceZoom(factor, event.clientX, event.clientY);
}, { passive: false });
window.addEventListener("resize", () => {
  if (state.workspaceZoomMode === "fit") fitWorkspace();
  else if (state.workspaceZoomMode === "page") fitActivePage();
});
elements.downloadSvg.addEventListener("click", () => exportSvg());
elements.downloadWorkspaceSvg.addEventListener("click", () => {
  if (!state.currentLayout) return;
  const allPagesSvg = renderWorkspaceSvg(state.currentLayout, { interactive: false });
  exportSvg(allPagesSvg, fileStem("all"), "SVG всего рабочего поля создан.");
});
elements.downloadTreeJson.addEventListener("click", downloadTreeJson);
elements.printPdf.addEventListener("click", printPdf);
window.addEventListener("afterprint", () => setStatus("Печатный диалог закрыт. Локальный черновик остаётся в этом браузере."));
window.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();
  if (!(event.ctrlKey || event.metaKey) || event.altKey || !["z", "y"].includes(key)) return;
  if (event.target.closest?.("input, textarea, select, [contenteditable='true']") || document.querySelector("dialog[open]")) return;
  const redo = event.shiftKey || (key === "y" && event.ctrlKey);
  const stack = redo ? state.redoStack : state.undoStack;
  if (!stack.length) return;
  event.preventDefault();
  if (redo) redoPrintDraft();
  else undoPrintDraft();
});

update();
if (restoredDraft) setStatus("Локальный черновик восстановлен из этого браузера.", "success");
if (requestedRouteFallback) setStatus("Выбор из предыдущего экрана не найден в этом наборе; открыто всё доступное дерево.");
