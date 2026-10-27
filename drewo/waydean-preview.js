import { flattenTree, getCardWidthForName } from './waydean-preview-model.mjs?v=person-card-width-2';
import {
  cameraLayout, readableFitZoom, zoomAroundAnchor, createFrameCoalescer,
  createLatestFrameCoalescer, clampZoom, MIN_MOBILE_ZOOM, MIN_DESKTOP_ZOOM,
  miniMapViewport, miniMapScrollTarget, wheelZoomFactor
} from './waydean-preview-camera.mjs?v=20261027-pinch-rAF-1';
import { requireWaydeanAdminAccess } from './waydean-preview-access.mjs?v=admin-auth-2';
import { callWaydeanAdminAction } from './waydean-preview-admin-api.mjs?v=admin-tools-1';
import { accountLockPresentation, validateFamilyPasswordChange } from './waydean-preview-admin-controls.mjs?v=account-admin-controls-1';
import { buildWaydeanPublishPayload } from './waydean-preview-publish.mjs?v=admin-save-1';
import { describeWaydeanActivity, parseWaydeanActivity, parseWaydeanBackups } from './waydean-preview-account-history.mjs?v=1';
import { readWaydeanAdminEmail } from './waydean-admin-identity.mjs?v=1';
import {
  clearWhoAmIPromptDismissal, dismissWhoAmIPrompt, hasDismissedWhoAmIPrompt, shouldPromptWhoAmI
} from './waydean-preview-whoami.mjs?v=2';
import { connectorPaths } from './waydean-preview-lines.mjs';
import { masterFixtureFocus, masterFixtureVisibleRecords } from './waydean-preview-fixture.mjs';
import { includePersonInFilters, fallbackSelectedPersonId } from './waydean-preview-selection.mjs';
import {
  compactRouteClass, getOverviewLineWorldWidth, getOverviewMarkerWorldSize, nextLodLevel
} from './waydean-preview-lod.mjs?v=lod-9';
import { accountPreviewUrl, canLoadPreviewTree, initialPreviewView, isLoopbackHost, isMasterFixtureQuery, previewUrlForMode } from './waydean-preview-route.mjs?v=account-route-20261016-1';
import { cloneTree, updatePerson, setPersonPhotoKey, addChild, generateUniquePersonId, reparentPerson, deleteLeaf, isDirty, mockSave } from './waydean-preview-edit.mjs?v=child-id-1';
import {
  loadLocalTreeDraft, saveLocalTreeDraft, clearLocalTreeDraft, listLocalTreePhotos,
  createLocalTreeBackup, listLocalTreeBackups, setLocalTreeBackupPinned,
  restoreLocalTreeBackup, listLocalTreeHistory
} from './waydean-preview-storage.mjs?v=3';
import { createWaydeanPwaController } from './waydean-preview-pwa.mjs?v=pwa-1';
import { createBrowserVideoHandoff, VIDEO_HANDOFF_KEY } from './waydean-preview-video-handoff.mjs?v=browser-export-1';

const USER_ICON = 'M224 256A128 128 0 1 0 224 0a128 128 0 1 0 0 256zm-45.7 48C79.8 304 0 383.8 0 482.3 0 498.7 13.3 512 29.7 512l388.6 0c16.4 0 29.7-13.3 29.7-29.7C448 383.8 368.2 304 269.7 304l-91.4 0z';
const FIXTURE_PHOTOS = new Map([
  ['demo-01', '../docs/design/waydean/assets/demo/waydean-demo-elder-portrait.jpg'],
  ['demo-03', '../docs/design/waydean/assets/demo/waydean-demo-middle-aged-portrait.jpg']
]);
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const railPreferenceKey = 'waydean-preview:tree-actions:v2';
const myPersonStoragePrefix = 'waydean-preview:my-person:v1:';
const ui = {
  app: $('.app-shell'), mobileSelected: $('#mobileSelected'), mobileSearch: $('#mobileSearchTrigger'),
  railToggle: $('#railToggle'), profileReopen: $('#profileReopen'),
  miniMap: $('#miniMap'), miniMapToggle: $('#miniMapToggle'),
  stage: $('#treeStage'), viewport: $('#graphViewport'), extent: $('#graphExtent'), graph: $('#graph'), nodes: $('#treeNodes'), lines: $('#treeLines'), miniSvg: $('#miniMapSvg'),
  profile: $('#profilePanel'), summary: $('#datasetSummary'), railCount: $('#railCount'), mode: $('#modeLabel'),
  empty: $('#emptyState'), search: $('#searchPopover'), filters: $('#filtersPopover'), stats: $('#statsPopover'),
  more: $('#morePopover'), history: $('#historyPopover'), backups: $('#backupsPopover'), pwa: $('#pwaPopover'),
  backdrop: $('#popoverBackdrop'), toast: $('#toast'), error: $('#loadError')
};

let records = [];
let byId = new Map();
let childrenById = new Map();
let selectedId = null;
let contextAnchorId = null;
let myPersonId = null;
let whoAmIPromptShown = false;
let mode = 'all';
let zoom = 1;
let filters = { min: 1, max: Infinity, photosOnly: false };
let lastFocus = null;
let toastTimer = 0;
let fullDataDepth = 1;
let syntheticFixture = false;
let accountPreview = false;
let accountAdminAccess = null;
let accountTreeLocked = null;
let accountTreeLockReason = '';
let accountCanToggleLock = false;
let accountAdminLockBusy = false;
let accountAdminPasswordBusy = false;
let accountServerTreeJson = '';
let accountServerActivityJson = '[]';
let accountServerFingerprint = '';
let accountBaseTree = null;
let accountBaseFingerprint = '';
let accountBaseActivityJson = '[]';
let accountPublishConflict = null;
let localTreeDraft = false;
let masterMobileOverview = false;
let currentCameraLayout = null;
let lastNodeMetrics = null;
let lodLevel = 'detail';
let fixtureRoot = null;
let originalFixtureRoot = null;
let sourceFixtureRoot = null;
let editStatus = 'clean';
let nextSaveFails = false;
let editDisclosureOpen = false;
let currentProfileTab = 'info';
let rawDraftDirty = false;
let localDraftKey = '';
let localDraftRevision = 0;
let localDraftPersistenceError = '';
let localMediaStatus = '';
let pwaController = null;
let pwaPushAction = 'subscribe';
const localPhotoUrls = new Map();
const pendingLocalPhotoWrites = new Map();
const pendingLocalPhotoDeletes = new Set();
let suppressPersonClick = null;
const scheduleMiniViewportUpdate = createFrameCoalescer(requestAnimationFrame, updateMiniViewport);

function nodeMetrics() {
  const style = getComputedStyle(ui.graph);
  return {
    width: parseFloat(style.getPropertyValue('--tree-card-width')) || 132,
    height: parseFloat(style.getPropertyValue('--tree-card-height')) || 140
  };
}

function measurePersonCardWidths(people, metrics) {
  const previousLod = ui.graph.dataset.lod;
  ui.graph.dataset.lod = 'detail';
  const probe = document.createElement('button');
  probe.type = 'button';
  probe.className = 'person-node';
  probe.setAttribute('aria-hidden', 'true');
  probe.tabIndex = -1;
  probe.style.cssText = `position:absolute;left:-10000px;top:-10000px;visibility:hidden;width:${metrics.width}px;height:${metrics.height}px;`;
  const copy = document.createElement('span');
  copy.className = 'node-copy';
  copy.style.width = 'max-content';
  copy.style.minWidth = 'max-content';
  const name = document.createElement('strong');
  name.textContent = 'Имя';
  name.style.width = 'max-content';
  name.style.maxWidth = 'none';
  name.style.overflow = 'visible';
  name.style.textOverflow = 'clip';
  name.style.whiteSpace = 'nowrap';
  copy.append(name);
  probe.append(copy);
  ui.nodes.append(probe);

  const cardStyle = getComputedStyle(probe);
  const nameStyle = getComputedStyle(name);
  const horizontalPadding = (parseFloat(cardStyle.paddingLeft) || 0) + (parseFloat(cardStyle.paddingRight) || 0);
  const gap = parseFloat(cardStyle.columnGap || cardStyle.gap) || 0;
  const gridColumns = cardStyle.display === 'grid'
    ? cardStyle.gridTemplateColumns.split(/\s+/).map(value => parseFloat(value)).filter(Number.isFinite)
    : [];
  const fixedWidth = horizontalPadding + (gridColumns.length > 1
    ? gridColumns.slice(0, -1).reduce((sum, width) => sum + width, 0) + gap
    : 0);
  const letterSpacing = parseFloat(nameStyle.letterSpacing) || 0;
  const measureText = value => {
    name.textContent = value;
    const chars = Array.from(value).length;
    return name.scrollWidth + Math.max(0, chars - 1) * letterSpacing;
  };
  const widths = new Map(people.map(person => [person.id, getCardWidthForName(person.name, {
    baseWidth: metrics.width,
    fixedWidth,
    safety: 12,
    measureText
  })]));

  probe.remove();
  if (previousLod) ui.graph.dataset.lod = previousLod;
  else delete ui.graph.dataset.lod;
  return widths;
}

function syncCameraLayout(dimensions = null) {
  const viewWidth = dimensions?.viewWidth ?? ui.viewport.clientWidth;
  const viewHeight = dimensions?.viewHeight ?? ui.viewport.clientHeight;
  const graphWidth = dimensions?.graphWidth ?? ui.graph.offsetWidth;
  const graphHeight = dimensions?.graphHeight ?? ui.graph.offsetHeight;
  const layout = cameraLayout(
    viewWidth, viewHeight, graphWidth, graphHeight, zoom
  );
  currentCameraLayout = layout;
  const extentWidth = `${layout.extentWidth}px`;
  const extentHeight = `${layout.extentHeight}px`;
  if (ui.extent.style.width !== extentWidth) ui.extent.style.width = extentWidth;
  if (ui.extent.style.height !== extentHeight) ui.extent.style.height = extentHeight;
  const transform = `translate(${layout.offsetX}px, ${layout.offsetY}px) scale(${zoom})`;
  if (ui.graph.style.transform !== transform) ui.graph.style.transform = transform;
  const overviewDotSize = `${getOverviewMarkerWorldSize(zoom)}px`;
  const overviewLineWidth = `${getOverviewLineWorldWidth(zoom)}px`;
  if (ui.graph.style.getPropertyValue('--overview-dot-size') !== overviewDotSize) {
    ui.graph.style.setProperty('--overview-dot-size', overviewDotSize);
  }
  if (ui.graph.style.getPropertyValue('--overview-line-width') !== overviewLineWidth) {
    ui.graph.style.setProperty('--overview-line-width', overviewLineWidth);
  }
  const isMobile = window.matchMedia('(max-width: 700px)').matches;
  const nextLevel = isMobile
    ? 'detail'
    : nextLodLevel(lodLevel, (lastNodeMetrics?.width || nodeMetrics().width) * zoom);
  if (lodLevel !== nextLevel) lodLevel = nextLevel;
  if (ui.graph.dataset.lod !== lodLevel) ui.graph.dataset.lod = lodLevel;
  updateZoomCaption();
}

function formatYears(person) {
  if (person.born == null && person.died == null) return 'Даты неизвестны';
  if (person.born == null) return `до ${person.died}`;
  if (person.died == null) return `с ${person.born}`;
  return `${person.born}–${person.died}`;
}

function gregorianYearToHijri(year) {
  const value = Number(year);
  if (!Number.isFinite(value)) return null;
  return Math.max(1, Math.round((value - 622) * 33 / 32));
}

function formatHijriYears(person) {
  const born = person.born == null ? null : gregorianYearToHijri(person.born);
  const died = person.died == null ? null : gregorianYearToHijri(person.died);
  if (born != null && died != null) return `${born} — ${died} هـ`;
  if (born != null) return `${born} هـ`;
  if (died != null) return `ум. ${died} هـ`;
  return '';
}

function updateZoomCaption() {
  const modeCaption = mode === 'path' ? 'МОЙ ПУТЬ'
    : mode === 'branch' ? 'МОЯ ВЕТВЬ'
      : mode === 'all-tree' ? 'ВСЕ ПОКОЛЕНИЯ' : '';
  const overviewCaption = lodLevel === 'overview' ? 'ОБЗОР · ПРИБЛИЗЬТЕ ДЛЯ ИМЁН' : '';
  const caption = overviewCaption || modeCaption;
  if (ui.mode.textContent !== caption) ui.mode.textContent = caption;
  const visible = Boolean(caption);
  if (ui.mode.classList.contains('visible') !== visible) ui.mode.classList.toggle('visible', visible);
}

function preparePreviewRecords(root) {
  return flattenTree(root).map(person => ({
    ...person,
    name: String(person.name ?? '').replace(/1/g, 'I')
  }));
}

function photoSource(person) {
  if (syntheticFixture && FIXTURE_PHOTOS.has(person.id)) return FIXTURE_PHOTOS.get(person.id);
  if (localTreeDraft && String(person.photoKey ?? '').startsWith('local-') && localPhotoUrls.has(person.id)) {
    return localPhotoUrls.get(person.id);
  }
  return person.hasPhoto ? `photos/${encodeURIComponent(person.id)}-thumb.jpg` : null;
}

async function restoreLocalPhotoUrls() {
  for (const url of localPhotoUrls.values()) URL.revokeObjectURL(url);
  localPhotoUrls.clear();
  const photos = await listLocalTreePhotos(localDraftKey);
  for (const photo of photos) {
    if (photo.thumb instanceof Blob) localPhotoUrls.set(photo.personId, URL.createObjectURL(photo.thumb));
  }
}

function hasDisplayPhoto(person) {
  return Boolean(photoSource(person));
}

function editableDraftRoot() {
  return syntheticFixture || localTreeDraft ? fixtureRoot : null;
}

function canEditDraft() {
  return Boolean(editableDraftRoot());
}

function accountDraftMetadata() {
  if (!accountPreview || !accountBaseTree || !accountBaseFingerprint) return null;
  return {
    accountBaseTreeJson: JSON.stringify(accountBaseTree),
    accountBaseFingerprint,
    accountActivityJson: accountBaseActivityJson,
  };
}

function sameJsonSnapshot(left, right) {
  const normalize = value => {
    try { return JSON.stringify(JSON.parse(String(value ?? '[]'))); }
    catch { return String(value ?? '').trim(); }
  };
  return normalize(left) === normalize(right);
}

function hasAccountPublishChanges() {
  return Boolean(accountPreview && accountBaseTree && editableDraftRoot()
    && isDirty(accountBaseTree, editableDraftRoot()));
}

function appendAccountPublishButton(container) {
  if (!accountPreview) return null;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = editStatus === 'saving' ? 'Публикуем…' : 'Опубликовать в древо';
  button.dataset.profileFocus = 'action:publish';
  button.disabled = editStatus === 'saving' || editStatus === 'conflict'
    || !accountAdminAccess || !accountBaseFingerprint || !hasAccountPublishChanges();
  button.addEventListener('click', () => void publishAccountDraft());
  container.append(button);
  return button;
}

function draftSubject() {
  return syntheticFixture ? 'синтетическое дерево' : 'локальную копию древа';
}

function russianPlural(value, one, few, many) {
  const mod100 = Math.abs(value) % 100;
  const mod10 = Math.abs(value) % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function russianCount(value, one, few, many) {
  return `${value} ${russianPlural(value, one, few, many)}`;
}

function ancestors(id) {
  const result = [];
  let current = byId.get(id);
  while (current) {
    result.push(current.id);
    current = current.parentId ? byId.get(current.parentId) : null;
  }
  return result;
}

function descendants(id) {
  const result = new Set();
  const queue = [id];
  while (queue.length) {
    const currentId = queue.pop();
    if (result.has(currentId)) continue;
    result.add(currentId);
    for (const child of childrenById.get(currentId) || []) queue.push(child.id);
  }
  return result;
}

function ancestorContextRoot(id) {
  const path = ancestors(id);
  const contextId = path[Math.min(2, path.length - 1)];
  return byId.get(contextId) || byId.get(id);
}

function collectContext(root, maxRelativeDepth = 2) {
  const result = [];
  function visit(person, depth) {
    result.push(person);
    if (depth >= maxRelativeDepth) return;
    for (const child of childrenById.get(person.id) || []) visit(child, depth + 1);
  }
  visit(root, 0);
  return result;
}

function currentRecords() {
  let candidates;
  if (mode === 'all-tree') {
    candidates = records;
  } else if (mode === 'all') {
    candidates = collectContext(ancestorContextRoot(contextAnchorId || selectedId), 2);
  } else if (mode === 'path') {
    candidates = ancestors(contextAnchorId || selectedId).reverse().map(id => byId.get(id));
  } else {
    const branchRootId = contextAnchorId || selectedId;
    const branchIds = new Set([...ancestors(branchRootId), ...descendants(branchRootId)]);
    candidates = records.filter(person => branchIds.has(person.id));
  }
  if (mode === 'all' && masterMobileOverview) {
    candidates = masterFixtureVisibleRecords(candidates, { viewportWidth: window.innerWidth });
  }
  return candidates.filter(person => person.generation >= filters.min && person.generation <= filters.max && (!filters.photosOnly || hasDisplayPhoto(person)));
}

function myPersonStorageKey() {
  return `${myPersonStoragePrefix}${syntheticFixture ? 'demo' : 'hoti'}`;
}

function browserStorage() {
  try { return window.localStorage; } catch { return null; }
}

function maybePromptWhoAmI() {
  if (whoAmIPromptShown) return;
  const dialog = $('#whoAmIPrompt');
  const treeKey = syntheticFixture ? 'demo' : 'hoti';
  const dismissed = hasDismissedWhoAmIPrompt(browserStorage(), treeKey);
  if (!dialog || !shouldPromptWhoAmI({ hasSelf: Boolean(myPersonId && byId.has(myPersonId)), dismissed, isDemo: syntheticFixture })) return;
  if (document.visibilityState === 'hidden') return;
  whoAmIPromptShown = true;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else {
    openPopover(ui.search);
    $('#searchInput')?.focus({ preventScroll: true });
  }
}

function loadMyPersonPreference() {
  try {
    const stored = localStorage.getItem(myPersonStorageKey());
    myPersonId = stored && byId.has(stored) ? stored : null;
    if (stored && !myPersonId) localStorage.removeItem(myPersonStorageKey());
  } catch {
    myPersonId = null;
  }
}

function syncWhoAmIButton() {
  const button = $('#whoAmI');
  if (!button) return;
  const hasSelf = Boolean(myPersonId && byId.has(myPersonId));
  const showingPath = mode === 'path' && hasSelf;
  button.textContent = showingPath ? '◎ Всё древо' : hasSelf ? '◎ Мой путь' : '◎ Кто я?';
  button.setAttribute('aria-label', showingPath ? 'Вернуться ко всему древу' : hasSelf ? 'Показать мой путь к предкам' : 'Отметить себя и показать мой путь');
  button.title = showingPath ? 'Вернуться ко всему древу' : hasSelf ? 'Показать мой путь к предкам' : 'Отметить себя и показать мой путь';
}

function setSelfPerson(id) {
  if (!byId.has(id)) return;
  myPersonId = String(id);
  let persisted = false;
  try {
    localStorage.setItem(myPersonStorageKey(), myPersonId);
    clearWhoAmIPromptDismissal(browserStorage(), syntheticFixture ? 'demo' : 'hoti');
    persisted = true;
  } catch {
    // Keep the mark for this page session if browser storage is unavailable.
  }
  selectPerson(myPersonId);
  syncWhoAmIButton();
  announce(persisted ? 'Отметка «Это я» сохранена в этом браузере.' : 'Отметка действует до закрытия этой страницы: браузер не разрешил сохранение.');
}

function clearSelfPerson() {
  const previous = myPersonId;
  myPersonId = null;
  try {
    localStorage.removeItem(myPersonStorageKey());
  } catch {
    // Clearing the in-memory mark is still useful for this page session.
  }
  if (mode === 'path') {
    mode = 'all-tree';
    resetGenerationFilters();
    syncModeButtons(mode);
    contextAnchorId = selectedId;
    renderProfile();
    drawTree();
    fitTree();
  } else {
    renderProfile();
    drawTree();
  }
  syncWhoAmIButton();
  announce(previous ? 'Отметка «Это я» сброшена.' : 'Отметка уже была сброшена.');
}

function createAvatar(person, className = 'avatar') {
  const src = photoSource(person);
  const wrapper = document.createElement('span');
  wrapper.className = `${className} ${src ? 'has-photo' : 'is-empty'}`;
  wrapper.setAttribute('aria-hidden', 'true');
  if (src) {
    const image = document.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.src = src;
    image.addEventListener('error', () => {
      image.remove();
      wrapper.classList.remove('has-photo');
      wrapper.classList.add('is-empty');
      wrapper.innerHTML = `<svg viewBox="0 0 448 512" focusable="false"><path d="${USER_ICON}"/></svg>`;
    }, { once: true });
    wrapper.append(image);
  } else {
    wrapper.innerHTML = `<svg viewBox="0 0 448 512" focusable="false"><path d="${USER_ICON}"/></svg>`;
  }
  return wrapper;
}

function filteredRootNodes(visible) {
  const visibleIds = new Set(visible.map(person => person.id));
  return visible.filter(person => !person.parentId || !visibleIds.has(person.parentId));
}

function drawTree() {
  const visible = currentRecords();
  const hasActiveFilters = filters.min > 1 || filters.max < fullDataDepth || filters.photosOnly;
  const treeBack = $('#showFullTree');
  treeBack.hidden = mode === 'all-tree' && !hasActiveFilters;
  treeBack.textContent = mode === 'all-tree' ? 'Сбросить фильтры' : '← Назад к полному древу';
  treeBack.title = mode === 'all-tree' ? 'Показать всех людей без фильтров' : 'Вернуться к полному древу';
  treeBack.setAttribute('aria-label', treeBack.title);
  const metrics = nodeMetrics();
  const mobileViewport = window.matchMedia('(max-width: 700px)').matches;
  const compactMobileMaster = syntheticFixture && mobileViewport;
  const compactMobileShort = compactMobileMaster && window.innerHeight <= 760;
  lastNodeMetrics = metrics;
  ui.nodes.replaceChildren();
  ui.lines.replaceChildren();
  const matches = new Set(visible.map(person => person.id));
  const selected = byId.get(selectedId);
  ui.empty.hidden = visible.length > 0;
  ui.lines.hidden = visible.length === 0;
  if (ui.summary) ui.summary.textContent = `${russianCount(records.length, 'человек', 'человека', 'человек')} · ${russianCount(fullDataDepth, 'поколение', 'поколения', 'поколений')}`;
  ui.railCount.textContent = String(records.length);
  $('#emptyReset').textContent = filters.photosOnly ? 'Сбросить фильтры' : 'Показать все поколения';

  if (!visible.length || !selected) {
    ui.graph.style.width = '1000px';
    ui.graph.style.height = '760px';
    syncCameraLayout();
    ui.miniSvg.replaceChildren();
    ui.mode.textContent = '';
    ui.mode.classList.remove('visible');
    $('#miniMapSummary').textContent = `${russianCount(records.length, 'человек', 'человека', 'человек')} · фильтр: 0`;
    updateStats();
    return;
  }

  const widthById = new Map();
  const visibleChildren = new Map();
  for (const person of visible) visibleChildren.set(person.id, (childrenById.get(person.id) || []).filter(child => matches.has(child.id)));
  const cardWidthById = syntheticFixture
    ? new Map(visible.map(person => [person.id, metrics.width]))
    : measurePersonCardWidths(visible, metrics);
  const siblingGap = compactMobileMaster ? 16 : 24;
  function measure(person) {
    const kids = visibleChildren.get(person.id) || [];
    const childWidth = kids.reduce((sum, child, index) => sum + measure(child) + (index ? siblingGap : 0), 0);
    const width = cardWidthById.get(person.id) || metrics.width;
    const demoBranchWidth = syntheticFixture && !compactMobileMaster ? width * 2 + siblingGap : width;
    const total = kids.length ? Math.max(width, childWidth, demoBranchWidth) : width;
    widthById.set(person.id, total);
    return total;
  }
  const roots = filteredRootNodes(visible);
  const gap = mobileViewport ? 20 : 36;
  const rootWidth = roots.reduce((sum, root, index) => sum + measure(root) + (index ? gap : 0), 0);
  const maxGeneration = Math.max(...visible.map(person => person.generation));
  const generationDepth = maxGeneration - Math.min(...visible.map(person => person.generation));
  const desktopGutter = !mobileViewport && !syntheticFixture ? 88 : 50;
  const graphWidth = compactMobileMaster ? rootWidth + 32 : mobileViewport ? rootWidth + 32 : Math.max(1000, rootWidth + desktopGutter * 2);
  const generationStep = compactMobileShort ? 100 : compactMobileMaster ? 128 : mobileViewport ? 146 : syntheticFixture ? 176 : 190;
  const graphHeight = compactMobileMaster
    ? Math.max(compactMobileShort ? 326 : 400, generationDepth * generationStep + metrics.height + 40)
    : mobileViewport
      ? Math.max(420, generationDepth * generationStep + metrics.height + 40)
      : Math.max(700, (generationDepth + 1) * generationStep + (!mobileViewport && !syntheticFixture ? 182 : 140));
  ui.graph.style.width = `${graphWidth}px`;
  ui.graph.style.height = `${graphHeight}px`;
  ui.lines.setAttribute('viewBox', `0 0 ${graphWidth} ${graphHeight}`);
  ui.lines.setAttribute('width', String(graphWidth));
  ui.lines.setAttribute('height', String(graphHeight));

  const minGeneration = Math.min(...visible.map(person => person.generation));
  const positions = new Map();
  function place(person, left, generation) {
    const subtreeWidth = widthById.get(person.id);
    const cardWidth = cardWidthById.get(person.id) || metrics.width;
    const centerX = left + subtreeWidth / 2;
    const depth = generation - minGeneration;
    const centerY = (compactMobileShort ? 46 : compactMobileMaster ? 60 : mobileViewport ? 80 : syntheticFixture ? 75 : 132) + depth * generationStep;
    positions.set(person.id, { centerX, centerY, cardWidth });
    const kids = visibleChildren.get(person.id) || [];
    const childrenTotal = kids.reduce((sum, child, index) => sum + widthById.get(child.id) + (index ? siblingGap : 0), 0);
    let childLeft = left + (subtreeWidth - childrenTotal) / 2;
    for (const child of kids) {
      place(child, childLeft, child.generation);
      childLeft += widthById.get(child.id) + siblingGap;
    }
  }
  let rootLeft = Math.max(mobileViewport ? 16 : desktopGutter, (graphWidth - rootWidth) / 2);
  for (const root of roots) {
    place(root, rootLeft, root.generation);
    rootLeft += widthById.get(root.id) + gap;
  }

  const treeAnchorId = contextAnchorId || selectedId;
  const related = mode === 'path'
    ? new Set(ancestors(treeAnchorId))
    : mode === 'branch'
      ? new Set([...ancestors(treeAnchorId), ...descendants(treeAnchorId)])
      : null;
  const selectedRoute = new Set(ancestors(selectedId));
  const labelRoute = related || selectedRoute;
  const treeLines = connectorPaths(positions, visibleChildren, related, metrics.height);
  if (mode !== 'path' && mode !== 'branch') {
    treeLines.push(...connectorPaths(positions, visibleChildren, selectedRoute, metrics.height)
      .filter(line => line.className.includes('active'))
      .map(line => ({ ...line, className: `${line.className} lod-route` })));
  }
  const lineParts = treeLines.map(line => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', line.d);
    path.setAttribute('class', line.className);
    return path;
  });
  ui.lines.append(...lineParts);

  for (const person of visible) {
    const point = positions.get(person.id);
    if (!point) continue;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `person-node${person.id === selectedId ? ' selected' : ''}${person.id === myPersonId ? ' my-self' : ''}${compactRouteClass(person.id, labelRoute)}${related && !related.has(person.id) ? ' dimmed' : ''}`;
    card.dataset.personId = person.id;
    card.setAttribute('aria-label', `${person.name}, ${formatYears(person)}, поколение ${person.generation}${person.id === myPersonId ? ', это вы' : ''}`);
    card.title = `${person.name} · ${formatYears(person)}`;
    card.style.left = `${point.centerX}px`;
    card.style.top = `${point.centerY}px`;
    card.style.setProperty('--person-card-width', `${point.cardWidth}px`);
    card.append(createAvatar(person, 'node-avatar'));
    const copy = document.createElement('span');
    copy.className = 'node-copy';
    const name = document.createElement('strong');
    name.textContent = person.name;
    copy.append(name);
    if (person.born == null && person.died == null) {
      const generation = document.createElement('small');
      generation.textContent = `Поколение ${person.generation}`;
      copy.append(generation);
    } else {
      const years = document.createElement('span');
      years.className = 'node-years';
      const gregorian = document.createElement('small');
      gregorian.className = 'node-years-layer is-gregorian';
      gregorian.textContent = formatYears(person);
      const hijri = document.createElement('small');
      hijri.className = 'node-years-layer is-hijri';
      hijri.textContent = formatHijriYears(person);
      years.append(gregorian, hijri);
      copy.append(years);
    }
    card.append(copy);
    if (person.id === myPersonId) {
      const selfMark = document.createElement('span');
      selfMark.className = 'self-indicator';
      selfMark.textContent = 'Я';
      selfMark.setAttribute('aria-hidden', 'true');
      card.append(selfMark);
    }
    card.addEventListener('click', () => {
      if (suppressPersonClick === person.id) {
        suppressPersonClick = null;
        return;
      }
      selectPerson(person.id, { preserveContext: true });
    });
    ui.nodes.append(card);
  }

  updateZoomCaption();
  const sourceRoot = ancestorContextRoot(treeAnchorId);
  $('#miniMapSummary').textContent = `${russianCount(records.length, 'человек', 'человека', 'человек')} · показано ${visible.length}`;
  syncCameraLayout();
  drawMiniMap(positions, sourceRoot, graphWidth, graphHeight);
  updateMiniViewport();
  updateStats();
}

function drawMiniMap(positions, root, graphWidth, graphHeight) {
  const svg = ui.miniSvg;
  svg.replaceChildren();
  const { scale, originX, originY } = miniMapViewport({
    graphWidth, graphHeight, zoom,
    scrollLeft: ui.viewport.scrollLeft, scrollTop: ui.viewport.scrollTop,
    viewWidth: ui.viewport.clientWidth, viewHeight: ui.viewport.clientHeight,
    offsetX: currentCameraLayout.offsetX, offsetY: currentCameraLayout.offsetY
  });
  for (const person of currentRecords()) {
    const point = positions.get(person.id);
    if (!point) continue;
    if (person.parentId && positions.has(person.parentId)) {
      const parent = positions.get(person.parentId);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M${originX + parent.centerX * scale} ${originY + parent.centerY * scale} L${originX + point.centerX * scale} ${originY + point.centerY * scale}`);
      path.setAttribute('class', 'mini-line');
      svg.append(path);
    }
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', String(originX + point.centerX * scale));
    dot.setAttribute('cy', String(originY + point.centerY * scale));
    dot.setAttribute('r', person.id === selectedId ? '2.5' : '1.6');
    dot.setAttribute('class', person.id === selectedId ? 'mini-dot selected' : 'mini-dot');
    svg.append(dot);
  }
}

function renderProfile(tab = 'info') {
  const profileFocusKey = ui.profile.contains(document.activeElement)
    ? document.activeElement.dataset.profileFocus || null
    : null;
  currentProfileTab = tab;
  const person = byId.get(selectedId);
  if (!person) return;
  ui.mobileSelected.replaceChildren();
  ui.mobileSelected.dataset.personId = person.id;
  ui.mobileSelected.append(createAvatar(person, 'mobile-selected-avatar'));
  const selectedCopy = document.createElement('span');
  selectedCopy.className = 'mobile-selected-copy';
  const selectedName = document.createElement('strong');
  selectedName.textContent = person.name;
  const selectedYears = document.createElement('small');
  selectedYears.textContent = formatYears(person);
  const selectedGeneration = document.createElement('small');
  selectedGeneration.textContent = `Поколение ${person.generation}`;
  selectedCopy.append(selectedName, selectedYears, selectedGeneration);
  const selectedArrow = document.createElement('span');
  selectedArrow.className = 'mobile-selected-arrow';
  selectedArrow.setAttribute('aria-hidden', 'true');
  selectedArrow.textContent = '›';
  ui.mobileSelected.append(selectedCopy, selectedArrow);
  ui.mobileSelected.setAttribute('aria-label', `Открыть профиль: ${person.name}`);
  const parent = person.parentId ? byId.get(person.parentId) : null;
  const children = childrenById.get(person.id) || [];
  const lineage = ancestors(person.id).map(id => byId.get(id)).filter(Boolean).reverse();
  const branchAnchor = lineage.find(item => item.generation === Math.min(2, fullDataDepth));
  const summary = document.createElement('div');
  summary.className = 'profile-person';
  summary.dataset.personId = person.id;
  summary.append(createAvatar(person, 'profile-avatar'));
  const heading = document.createElement('div');
  const title = document.createElement('h1');
  title.textContent = person.name;
  const years = document.createElement('p');
  years.textContent = formatYears(person);
  const generation = document.createElement('small');
  generation.textContent = `Поколение ${person.generation}`;
  heading.append(title, years, generation);
  summary.append(heading);

  const tabs = document.createElement('div');
  tabs.className = 'profile-tabs';
  for (const [id, label] of [['info','Информация'], ['relatives',`Родственники ${children.length + Number(Boolean(parent))}`], ['media',`Медиа ${hasDisplayPhoto(person) ? 1 : 0}`]]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.profileTab = id;
    button.dataset.profileFocus = `tab:${id}`;
    button.classList.toggle('active', tab === id);
    button.textContent = label;
    button.addEventListener('click', () => renderProfile(id));
    tabs.append(button);
  }
  const body = document.createElement('div');
  body.className = 'profile-body';
  if (tab === 'info') {
    const facts = document.createElement('dl');
    facts.className = 'facts';
    const values = [
      ['Поколение', String(person.generation)],
      ['Отец', parent?.name || 'Не указан'],
      ['Сыновья', `${children.length} человек`],
      ['Ветвь', branchAnchor ? `Линия ${branchAnchor.name}` : 'Основная линия'],
      ['Тейп', String(person.teip ?? '').trim() || 'Не указан']
    ];
    for (const [label, value] of values) {
      const row = document.createElement('div');
      const dt = document.createElement('dt'); dt.textContent = label;
      const dd = document.createElement('dd'); dd.textContent = value;
      row.append(dt, dd); facts.append(row);
    }
    const branch = document.createElement('button');
    branch.type = 'button'; branch.className = 'branch-button'; branch.textContent = 'Показать ветвь　›';
    branch.addEventListener('click', () => setMode('branch'));
    let addSonAction = null;
    if (canEditDraft()) {
      addSonAction = document.createElement('section');
      addSonAction.className = 'profile-add-son';
      const addSonTitle = document.createElement('strong');
      addSonTitle.textContent = 'Продолжить семейную историю';
      const addSonNote = document.createElement('small');
      addSonNote.textContent = syntheticFixture
        ? 'Демо-изменение действует только в этой вкладке.'
        : 'После добавления нажми «Сохранить локально»; production не меняется.';
      const addSonButton = document.createElement('button');
      addSonButton.type = 'button';
      addSonButton.className = 'profile-add-son-button';
      addSonButton.dataset.profileFocus = 'action:add-son';
      addSonButton.textContent = '＋ Добавить ребёнка';
      addSonButton.setAttribute('aria-label', `Добавить ребёнка к ${person.name}`);
      addSonButton.addEventListener('click', () => {
        renderProfile('relatives');
        requestAnimationFrame(() => {
          const form = ui.profile.querySelector('[data-add-child-form]');
          const nameInput = form?.querySelector('input[name="name"]');
          form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          nameInput?.focus({ preventScroll: true });
        });
      });
      addSonAction.append(addSonTitle, addSonNote, addSonButton);
    }
    const selfAction = document.createElement('button');
    selfAction.type = 'button';
    selfAction.className = 'self-person-button';
    const isSelf = person.id === myPersonId;
    selfAction.setAttribute('aria-pressed', String(isSelf));
    selfAction.textContent = isSelf ? '✓ Это вы · сбросить отметку' : 'Отметить как меня';
    selfAction.title = isSelf ? 'Убрать сохранённую отметку «Это я»' : 'Запомнить этого человека как вас в этом браузере';
    selfAction.addEventListener('click', () => isSelf ? clearSelfPerson() : setSelfPerson(person.id));
    const selfNote = document.createElement('small');
    selfNote.className = 'self-person-note';
    selfNote.textContent = isSelf ? 'Теперь «Мой путь» ведёт от предков к этой карточке.' : 'Отметка хранится отдельно для HOTI и демонстрационного дерева.';
    body.append(facts, branch);
    if (addSonAction) body.append(addSonAction);
    body.append(selfAction, selfNote);
    if (canEditDraft()) body.append(buildEditControls(person));
  } else if (tab === 'relatives') {
    const relatives = [...(parent ? [parent] : []), ...children];
    if (!relatives.length) {
      const empty = document.createElement('p'); empty.className = 'panel-empty'; empty.textContent = 'Для этого человека связанные записи не указаны.'; body.append(empty);
    } else {
      const list = document.createElement('div'); list.className = 'relative-list';
      for (const relative of relatives) {
        const button = document.createElement('button'); button.type = 'button';
        button.append(createAvatar(relative, 'relative-avatar'));
        const text = document.createElement('span');
        const name = document.createElement('strong'); name.textContent = relative.name;
        const meta = document.createElement('small'); meta.textContent = `${formatYears(relative)} · поколение ${relative.generation}`;
        text.append(name, meta); button.append(text); button.addEventListener('click', () => selectPerson(relative.id)); list.append(button);
      }
      body.append(list);
    }
    if (canEditDraft()) body.append(buildRelationshipControls(person));
  } else {
    const media = document.createElement('div'); media.className = 'media-state';
    if (hasDisplayPhoto(person)) {
      media.append(createAvatar(person, 'media-avatar'));
    } else {
      media.append(createAvatar(person, 'media-avatar'));
      const title = document.createElement('strong'); title.textContent = 'Нет фотографий';
      media.append(title);
    }
    body.append(media);
    if (localTreeDraft) body.append(buildLocalPhotoControls(person));
  }
  const close = document.createElement('button');
  close.type = 'button'; close.className = 'profile-close'; close.setAttribute('aria-label','Свернуть профиль'); close.title = 'Свернуть профиль';
  close.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 6 6-6 6"/></svg>';
  close.addEventListener('click', () => {
    if (window.matchMedia('(max-width: 700px)').matches) {
      ui.app.classList.remove('profile-open');
      ui.mobileSelected.focus();
    } else {
      setProfileCollapsed(true);
    }
  });
  ui.profile.replaceChildren(close, summary, tabs, body);
  if (profileFocusKey) {
    const candidates = [...ui.profile.querySelectorAll('[data-profile-focus]')];
    let focusTarget = candidates.find(candidate => candidate.dataset.profileFocus === profileFocusKey);
    if (!focusTarget || focusTarget.disabled || focusTarget.hidden) {
      focusTarget = ui.profile.querySelector('[data-profile-focus="action-status"]');
    }
    focusTarget?.focus({ preventScroll: true });
  }
}

function addField(form, labelText, name, value = '', type = 'text') {
  const label = document.createElement('label'); label.className = 'mock-edit-field'; label.append(document.createTextNode(labelText));
  const input = document.createElement('input'); input.name = name; input.type = type; input.value = value == null ? '' : String(value);
  input.dataset.profileFocus = `field:${name}`;
  if (name === 'born' || name === 'died') input.inputMode = 'numeric';
  label.append(input); form.append(label); return input;
}

function squareJpegBlob(source, size, quality) {
  const side = Math.min(source.width, source.height);
  const sx = Math.floor((source.width - side) / 2);
  const sy = Math.floor((source.height - side) / 2);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return Promise.reject(new Error('Не удалось подготовить изображение.'));
  context.drawImage(source, sx, sy, side, side, 0, 0, size, size);
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob);
    else reject(new Error('Не удалось сжать фотографию.'));
  }, 'image/jpeg', quality));
}

async function localPhotoVariants(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Выберите файл изображения.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Размер фотографии должен быть меньше 20 МБ.');
  if (!globalThis.createImageBitmap) throw new Error('Этот браузер не поддерживает обработку фотографий.');
  const bitmap = await createImageBitmap(file);
  try {
    const [full, thumb] = await Promise.all([
      squareJpegBlob(bitmap, 800, 0.84),
      squareJpegBlob(bitmap, 320, 0.82)
    ]);
    return { full, thumb };
  } finally {
    bitmap.close?.();
  }
}

async function stageLocalPersonPhoto(personId, file) {
  if (!localTreeDraft || !file) return;
  try {
    const photo = await localPhotoVariants(file);
    const oldUrl = localPhotoUrls.get(personId);
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    localPhotoUrls.set(personId, URL.createObjectURL(photo.thumb));
    pendingLocalPhotoWrites.set(personId, { personId, ...photo });
    pendingLocalPhotoDeletes.delete(personId);
    setPersonPhotoKey(editableDraftRoot(), personId, `local-${Date.now()}`);
    localMediaStatus = accountPreview
      ? 'Фото подготовлено. Сохраните черновик, затем опубликуйте изменения в древо.'
      : 'Фото подготовлено. Нажмите «Сохранить локально», чтобы оставить его в браузере.';
    editStatus = 'dirty';
    rawDraftDirty = false;
    refreshEditableModel();
    renderProfile('media');
  } catch (error) {
    localMediaStatus = error?.message || 'Не удалось подготовить фотографию.';
    renderProfile('media');
  }
}

function removeLocalPersonPhoto(person) {
  if (!localTreeDraft || !hasDisplayPhoto(person)) return;
  if (!window.confirm(`Удалить фотографию ${person.name} из ${accountPreview ? 'черновика древа' : 'локального черновика'}?`)) return;
  const oldUrl = localPhotoUrls.get(person.id);
  if (oldUrl) URL.revokeObjectURL(oldUrl);
  localPhotoUrls.delete(person.id);
  pendingLocalPhotoWrites.delete(person.id);
  pendingLocalPhotoDeletes.add(person.id);
  setPersonPhotoKey(editableDraftRoot(), person.id, null);
  localMediaStatus = accountPreview
    ? 'Фотография будет удалена из черновика после сохранения и с сайта после публикации.'
    : 'Фотография будет удалена из локальной копии после сохранения. Прод не меняется.';
  editStatus = 'dirty';
  rawDraftDirty = false;
  refreshEditableModel();
  renderProfile('media');
}

function buildLocalPhotoControls(person) {
  const controls = document.createElement('div');
  controls.className = 'mock-editor local-photo-editor';
  const title = document.createElement('strong');
  title.textContent = accountPreview ? 'Фотография в черновике древа' : 'Фотография в локальной копии';
  const actions = document.createElement('div');
  actions.className = 'mock-edit-actions';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.hidden = true;
  input.setAttribute('aria-label', `Выбрать фотографию для ${person.name}`);
  const choose = document.createElement('button');
  choose.type = 'button';
  choose.textContent = hasDisplayPhoto(person) ? 'Заменить фотографию' : 'Добавить фотографию';
  choose.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const [file] = input.files || [];
    void stageLocalPersonPhoto(person.id, file);
    input.value = '';
  });
  actions.append(input, choose);
  if (editStatus === 'dirty') {
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = accountPreview ? 'Сохранить черновик' : 'Сохранить локально';
    save.addEventListener('click', submitMockSave);
    actions.append(save);
  } else if (editStatus === 'error') {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Повторить сохранение';
    retry.addEventListener('click', submitMockSave);
    actions.append(retry);
  } else if (editStatus === 'conflict') {
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.textContent = accountPreview && accountPublishConflict ? 'Загрузить текущую версию сайта' : 'Загрузить сохранённую версию';
    reload.addEventListener('click', () => accountPreview && accountPublishConflict ? reloadAccountServerVersion() : reloadLocalDraftFromStorage());
    actions.append(reload);
  }
  if (editStatus === 'saving') {
    const saving = document.createElement('span');
    saving.className = 'mock-edit-status status-saving';
    saving.textContent = 'Сохраняется…';
    actions.append(saving);
  }
  if (hasDisplayPhoto(person)) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Убрать фотографию';
    remove.addEventListener('click', () => removeLocalPersonPhoto(person));
    actions.append(remove);
  }
  const status = document.createElement('p');
  status.className = `mock-edit-status${editStatus === 'error' || editStatus === 'conflict' || localMediaStatus.includes('Не удалось') ? ' status-error' : ''}`;
  status.setAttribute('aria-live', 'polite');
  status.textContent = editStatus === 'saving' ? 'Сохраняются дерево и фото…'
    : editStatus === 'conflict' ? 'Древо изменилось в другой вкладке. Сначала загрузите сохранённую версию.'
      : editStatus === 'error' ? localDraftPersistenceError || 'Не удалось сохранить локальную копию.'
        : localMediaStatus || 'Изображение останется только в этом браузере.';
  controls.append(title, actions, status);
  return controls;
}

function setProfileCollapsed(collapsed) {
  ui.profile.classList.toggle('collapsed', collapsed);
  ui.profile.parentElement.classList.toggle('profile-collapsed', collapsed);
  ui.profileReopen.hidden = !collapsed;
  ui.profileReopen.setAttribute('aria-expanded', String(!collapsed));
  requestAnimationFrame(() => {
    syncCameraLayout();
    centerVisiblePerson();
  });
  const focusTarget = collapsed ? ui.profileReopen : ui.profile.querySelector('.profile-close');
  focusTarget?.focus({ preventScroll: true });
}

function buildEditControls(person) {
  const section = document.createElement('details'); section.className = 'mock-editor';
  section.open = editDisclosureOpen;
  section.addEventListener('toggle', () => { editDisclosureOpen = section.open; });
  const title = document.createElement('summary'); title.className = 'mock-editor-summary';
  title.textContent = syntheticFixture ? 'Редактировать демо-запись'
    : accountPreview ? 'Редактировать данные древа' : 'Редактировать данные в локальном черновике'; section.append(title);
  const form = document.createElement('form'); form.className = 'mock-edit-form';
  addField(form, 'Имя', 'name', person.name);
  addField(form, 'Тейп', 'teip', person.teip || '');
  addField(form, 'Год рождения', 'born', person.born, 'text');
  addField(form, 'Год смерти', 'died', person.died, 'text');
  addField(form, 'Биография', 'bio', person.bio || '');
  if (syntheticFixture) {
    const failureLabel = document.createElement('label'); failureLabel.className = 'mock-edit-failure';
    const failure = document.createElement('input'); failure.type = 'checkbox'; failure.checked = nextSaveFails;
    failure.dataset.profileFocus = 'action:simulate-error';
    failure.addEventListener('change', () => { nextSaveFails = failure.checked; });
    failureLabel.append(failure, document.createTextNode('Имитировать ошибку следующего сохранения')); form.append(failureLabel);
  }
  const actions = document.createElement('div'); actions.className = 'mock-edit-actions';
  const save = document.createElement('button'); save.type = 'submit'; save.textContent = editStatus === 'saving' ? 'Сохраняется…' : syntheticFixture ? 'Сохранить демо-черновик' : accountPreview ? 'Сохранить черновик' : 'Сохранить локально'; save.disabled = editStatus === 'saving' || editStatus === 'conflict';
  save.dataset.profileFocus = 'action:save';
  const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Повторить'; retry.hidden = editStatus !== 'error'; retry.dataset.profileFocus = 'action:retry'; retry.addEventListener('click', () => { nextSaveFails = false; submitMockSave(); });
  const reloadSaved = document.createElement('button'); reloadSaved.type = 'button'; reloadSaved.textContent = accountPreview && accountPublishConflict ? 'Загрузить текущую версию сайта' : 'Загрузить сохранённую версию'; reloadSaved.hidden = editStatus !== 'conflict'; reloadSaved.dataset.profileFocus = 'action:reload-saved'; reloadSaved.addEventListener('click', () => accountPreview && accountPublishConflict ? reloadAccountServerVersion() : reloadLocalDraftFromStorage());
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Отменить черновик'; cancel.dataset.profileFocus = 'action:cancel'; cancel.addEventListener('click', cancelDraft);
  const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = syntheticFixture ? 'Сбросить фикстуру' : 'Вернуть исходное древо'; reset.dataset.profileFocus = 'action:reset'; reset.addEventListener('click', resetFixture);
  actions.append(save); appendAccountPublishButton(actions); actions.append(retry, reloadSaved, cancel, reset); form.append(actions);
  const status = document.createElement('p'); status.className = `mock-edit-status status-${editStatus}`; status.setAttribute('aria-live', 'polite'); status.dataset.profileFocus = 'action-status'; status.tabIndex = -1;
  const messages = {
    clean: `Нет несохранённых изменений. ${syntheticFixture ? 'Данные демонстрационные.' : localDraftPersistenceError || (accountPreview ? 'Древо загружено с сервера.' : 'Это локальная копия; прод не меняется.')}`,
    dirty: accountPreview ? 'Есть несохранённые изменения. Сохраните черновик, затем опубликуйте его в древо.' : 'Есть несохранённые изменения.',
    saving: accountPreview ? 'Сохраняется черновик или публикуется версия…' : 'Обновляется локальный черновик…',
    saved: syntheticFixture ? 'Изменения сохранены только в памяти этой страницы.' : accountPreview
      ? localDraftPersistenceError || (hasAccountPublishChanges() ? 'Черновик сохранён в этом браузере. В древо он ещё не опубликован.' : localMediaStatus || 'Нет неопубликованных изменений.')
      : 'Локальная копия сохранена в этом браузере. Прод не меняется.',
    error: accountPreview ? localDraftPersistenceError || 'Не удалось сохранить. Локальные изменения сохранены, если запись успела завершиться; можно повторить.' : 'Не удалось сохранить черновик. Изменения остались на странице; можно повторить.',
    conflict: accountPreview && accountPublishConflict
      ? 'На сайте появилась новая версия. Ваш черновик оставлен в этом браузере; загрузите текущую версию сайта, чтобы продолжить.'
      : 'Древо изменилось в другой вкладке. Загрузите последнюю сохранённую версию, чтобы продолжить.'
  };
  status.textContent = messages[editStatus];
  form.addEventListener('input', () => {
    rawDraftDirty = true;
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      updatePerson(editableDraftRoot(), person.id, values);
      rawDraftDirty = false;
      editStatus = isDirty(originalFixtureRoot, editableDraftRoot()) ? 'dirty' : 'clean';
      status.textContent = messages[editStatus]; status.className = `mock-edit-status status-${editStatus}`;
      const publish = section.querySelector('[data-profile-focus="action:publish"]');
      if (publish) publish.disabled = editStatus === 'saving' || editStatus === 'conflict'
        || !accountBaseFingerprint || !hasAccountPublishChanges();
    } catch (error) { rawDraftDirty = true; status.textContent = error.message; status.className = 'mock-edit-status status-error'; }
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    try { updatePerson(editableDraftRoot(), person.id, Object.fromEntries(new FormData(form).entries())); }
    catch (error) { status.textContent = error.message; return; }
    editStatus = 'dirty'; submitMockSave();
  });
  section.append(form, status); return section;
}

function buildRelationshipControls(person) {
  const section = document.createElement('section'); section.className = 'mock-editor';
  const title = document.createElement('strong'); title.textContent = syntheticFixture ? 'Связи демо-дерева' : accountPreview ? 'Связи семейного древа' : 'Связи локальной копии'; section.append(title);
  const addForm = document.createElement('form'); addForm.className = 'mock-edit-form';
  addForm.dataset.addChildForm = 'true';
  const idNote = document.createElement('p'); idNote.className = 'mock-edit-status';
  idNote.textContent = syntheticFixture
    ? 'ID создаётся автоматически; демо-изменение останется только в этой вкладке.'
    : accountPreview ? 'ID создаётся автоматически. Сначала сохраняется черновик; публикация выполняется отдельной кнопкой.'
      : 'ID создаётся автоматически; исходное дерево не меняется.';
  addForm.append(idNote);
  addField(addForm, 'Имя ребёнка', 'name'); addField(addForm, 'Тейп', 'teip'); addField(addForm, 'Год рождения', 'born', '', 'text');
  const addButton = document.createElement('button'); addButton.type = 'submit'; addButton.textContent = 'Проверить данные'; addButton.dataset.profileFocus = 'action:preview-child'; addForm.append(addButton);
  const addPreview = document.createElement('p'); addPreview.className = 'mock-edit-status'; addPreview.setAttribute('role', 'status'); addPreview.setAttribute('aria-live', 'polite'); addPreview.setAttribute('aria-atomic', 'true'); addPreview.dataset.profileFocus = 'preview-status'; addPreview.tabIndex = -1; addForm.append(addPreview);
  const addConfirm = document.createElement('button'); addConfirm.type = 'button'; addConfirm.textContent = 'Добавить в дерево'; addConfirm.hidden = true; addConfirm.dataset.profileFocus = 'action:confirm-child'; addForm.append(addConfirm);
  let proposedChild = null;
  addForm.addEventListener('input', () => { proposedChild = null; addConfirm.hidden = true; addPreview.textContent = ''; });
  addForm.addEventListener('submit', event => {
    event.preventDefault();
    try {
      proposedChild = Object.fromEntries(new FormData(addForm).entries());
      if (!proposedChild.id) proposedChild.id = generateUniquePersonId(editableDraftRoot());
      const previewTree = cloneTree(editableDraftRoot()); addChild(previewTree, person.id, proposedChild);
      addPreview.textContent = `Предпросмотр: «${proposedChild.name}» будет добавлен ребёнком к «${person.name}».`;
      addConfirm.hidden = false;
    } catch (error) { proposedChild = null; addConfirm.hidden = true; addPreview.textContent = error.message; }
  });
  addConfirm.addEventListener('click', () => {
    if (!proposedChild) return;
    try { addChild(editableDraftRoot(), person.id, proposedChild); proposedChild = null; markRelationshipDirty(); }
    catch (error) { addPreview.textContent = error.message; }
  });
  section.append(addForm);
  const candidates = records.filter(item => item.id !== person.id);
  const moveForm = document.createElement('form'); moveForm.className = 'mock-edit-form';
  const addSelect = (name, accessibleName, placeholder) => {
    const select = document.createElement('select'); select.name = name;
    select.dataset.profileFocus = `field:${name}`;
    select.setAttribute('aria-label', accessibleName);
    const empty = document.createElement('option'); empty.value = ''; empty.textContent = placeholder; select.append(empty);
    candidates.forEach(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = `${item.name} (${item.id})`; select.append(option); });
    return select;
  };
  const moving = addSelect('personId', 'Человек, которого нужно перенести', 'Человека для переноса'); const parent = addSelect('parentId', 'Новый родитель', 'Нового родителя');
  moveForm.append(moving, parent);
  const preview = document.createElement('p'); preview.className = 'mock-edit-status'; preview.textContent = 'Выберите человека и родителя для проверки связи.'; moveForm.append(preview);
  const apply = document.createElement('button'); apply.type = 'button'; apply.textContent = 'Применить перенос'; apply.disabled = true; apply.dataset.profileFocus = 'action:move'; moveForm.append(apply);
  let proposed = null;
  const showPreview = () => {
    proposed = null;
    try {
      const candidate = cloneTree(editableDraftRoot());
      reparentPerson(candidate, moving.value, parent.value);
      proposed = { personId: moving.value, parentId: parent.value };
      preview.textContent = `Предпросмотр: ${byId.get(moving.value)?.name || moving.value} станет ребёнком ${byId.get(parent.value)?.name || parent.value}.`;
      apply.disabled = false;
    } catch (error) { preview.textContent = error.message; apply.disabled = true; }
  };
  moving.addEventListener('change', showPreview);
  parent.addEventListener('change', showPreview);
  apply.addEventListener('click', () => {
    if (!proposed) return;
    try { reparentPerson(editableDraftRoot(), proposed.personId, proposed.parentId); markRelationshipDirty(); }
    catch (error) { preview.textContent = error.message; }
  });
  section.append(moveForm);
  const deleteForm = document.createElement('form'); deleteForm.className = 'mock-edit-form';
  const target = addSelect('deleteId', 'Листовой человек для удаления', 'Листового человека для удаления'); deleteForm.append(target);
  const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Удалить листового человека';
  remove.dataset.profileFocus = 'action:delete';
  remove.addEventListener('click', () => {
    if (!target.value) { announce('Сначала выберите человека.'); return; }
    if (!window.confirm(`Удалить выбранного листового человека из ${draftSubject()}?`)) return;
    try {
      const removedPerson = byId.get(target.value);
      deleteLeaf(editableDraftRoot(), target.value);
      if (localTreeDraft && removedPerson?.hasPhoto) {
        const oldUrl = localPhotoUrls.get(target.value);
        if (oldUrl) URL.revokeObjectURL(oldUrl);
        localPhotoUrls.delete(target.value);
        pendingLocalPhotoWrites.delete(target.value);
        pendingLocalPhotoDeletes.add(target.value);
      }
      markRelationshipDirty();
    }
    catch (error) { announce(error.message); }
  });
  deleteForm.append(remove); section.append(deleteForm);
  const save = document.createElement('button'); save.type = 'button'; save.textContent = syntheticFixture ? 'Сохранить демо-черновик' : accountPreview ? 'Сохранить черновик' : 'Сохранить локально'; save.disabled = editStatus === 'saving' || editStatus === 'conflict'; save.dataset.profileFocus = 'action:save'; save.addEventListener('click', submitMockSave);
  const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Повторить'; retry.hidden = editStatus !== 'error'; retry.dataset.profileFocus = 'action:retry'; retry.addEventListener('click', () => { nextSaveFails = false; submitMockSave(); });
  const reloadSaved = document.createElement('button'); reloadSaved.type = 'button'; reloadSaved.textContent = accountPreview && accountPublishConflict ? 'Загрузить текущую версию сайта' : 'Загрузить сохранённую версию'; reloadSaved.hidden = editStatus !== 'conflict'; reloadSaved.dataset.profileFocus = 'action:reload-saved'; reloadSaved.addEventListener('click', () => accountPreview && accountPublishConflict ? reloadAccountServerVersion() : reloadLocalDraftFromStorage());
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Отменить черновик'; cancel.dataset.profileFocus = 'action:cancel'; cancel.addEventListener('click', cancelDraft);
  const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = syntheticFixture ? 'Сбросить фикстуру' : 'Вернуть исходное древо'; reset.dataset.profileFocus = 'action:reset'; reset.addEventListener('click', resetFixture);
  const status = document.createElement('p'); status.className = `mock-edit-status status-${editStatus}`; status.setAttribute('aria-live', 'polite'); status.dataset.profileFocus = 'action-status'; status.tabIndex = -1;
  status.textContent = editStatus === 'conflict'
    ? accountPreview && accountPublishConflict ? 'На сайте новая версия. Ваш черновик сохранён отдельно; загрузка сайта заменит его в редакторе.' : 'Древо изменилось в другой вкладке. Загрузите последнюю сохранённую версию.'
    : editStatus === 'error' ? localDraftPersistenceError || 'Не удалось сохранить; изменения остались на странице.'
      : editStatus === 'saved' ? syntheticFixture ? 'Сохранено только в памяти этой страницы.' : accountPreview
        ? localDraftPersistenceError || (hasAccountPublishChanges() ? 'Черновик в этом браузере; в production ещё не опубликован.' : localMediaStatus || 'Нет неопубликованных изменений.')
        : 'Сохранено в этом браузере. Прод не меняется.'
        : editStatus === 'saving' ? accountPreview ? 'Сохраняется черновик или публикуется версия…' : 'Обновляется локальный черновик…'
          : editStatus === 'dirty' ? 'Есть несохранённые изменения.'
            : `Нет несохранённых изменений. ${syntheticFixture ? 'Данные демонстрационные.' : localDraftPersistenceError || (accountPreview ? 'Древо загружено с сервера.' : 'Прод не меняется.')}`;
  section.append(save); appendAccountPublishButton(section); section.append(retry, reloadSaved, cancel, reset, status); return section;
}

function markRelationshipDirty() {
  editStatus = 'dirty'; refreshEditableModel(); renderProfile('relatives');
  announce(accountPreview ? 'Черновик изменён. Сохраните его, затем опубликуйте кнопкой «Опубликовать в древо».' : 'Черновик изменён. Сохраните его через вкладку «Информация».');
}

function refreshEditableModel() {
  records = preparePreviewRecords(editableDraftRoot());
  byId = new Map(records.map(person => [person.id, person]));
  const lostSelf = Boolean(myPersonId && !byId.has(myPersonId));
  if (lostSelf) {
    myPersonId = null;
    try { localStorage.removeItem(myPersonStorageKey()); } catch { /* Keep the page usable without browser storage. */ }
  }
  if (!byId.has(selectedId) && records.length) selectedId = records[0].id;
  childrenById = new Map(records.map(person => [person.id, []]));
  for (const item of records) if (item.parentId) childrenById.get(item.parentId)?.push(item);
  fullDataDepth = Math.max(...records.map(person => person.generation));
  if (lostSelf && mode === 'path') {
    mode = 'all-tree';
    resetGenerationFilters();
    contextAnchorId = selectedId;
    syncModeButtons(mode);
  }
  syncWhoAmIButton();
  drawTree(); updateStats();
}

function blobToDataUrl(blob) {
  if (!(blob instanceof Blob)) return Promise.reject(new Error('Не найден файл фотографии для публикации.'));
  if (blob.size > 480_000) return Promise.reject(new Error('Фотография больше лимита 480 КБ. Уменьшите изображение и добавьте его снова.'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('Не удалось прочитать фотографию.'));
    reader.onerror = () => reject(new Error('Не удалось прочитать фотографию.'));
    reader.readAsDataURL(blob);
  });
}

async function collectAccountPhotoChanges() {
  if (!accountBaseTree || !editableDraftRoot()) throw new Error('Не удалось определить исходную версию фото.');
  const before = new Map(flattenTree(accountBaseTree).map(person => [person.id, person]));
  const after = new Map(flattenTree(editableDraftRoot()).map(person => [person.id, person]));
  const storedPhotos = new Map((await listLocalTreePhotos(localDraftKey)).map(photo => [photo.personId, photo]));
  const photos = [];
  const photoDeletes = [];

  for (const [personId, person] of after) {
    if (!person.photoKey || before.get(personId)?.photoKey === person.photoKey) continue;
    const stored = storedPhotos.get(personId);
    if (!stored?.full || !stored?.thumb) {
      throw new Error(`Не найдены локальные файлы фото для ${person.name}. Добавьте фотографию ещё раз.`);
    }
    photos.push({
      personId,
      full: await blobToDataUrl(stored.full),
      thumb: await blobToDataUrl(stored.thumb)
    });
  }

  for (const [personId, person] of before) {
    if (person.photoKey && !after.get(personId)?.photoKey) photoDeletes.push(personId);
  }
  if (photos.length > 20) throw new Error('За одну публикацию можно загрузить не больше 20 фотографий.');
  return { photos, photoDeletes };
}

async function reloadAccountServerVersion() {
  if (!accountPublishConflict?.serverTreeJson) {
    localDraftPersistenceError = 'Сервер не вернул актуальное дерево. Черновик сохранён; обновите страницу или повторите публикацию позже.';
    editStatus = 'error';
    renderProfile(currentProfileTab);
    return;
  }
  if (!window.confirm('Загрузить текущую версию сайта в редактор? Черновик с вашими правками останется в локальном снимке этого браузера.')) return;
  try {
    const serverTree = JSON.parse(accountPublishConflict.serverTreeJson);
    flattenTree(serverTree);
    accountServerTreeJson = accountPublishConflict.serverTreeJson;
    accountServerActivityJson = accountPublishConflict.serverActivityJson || '[]';
    accountServerFingerprint = accountPublishConflict.serverFingerprint || '';
    accountBaseTree = cloneTree(serverTree);
    accountBaseFingerprint = accountServerFingerprint;
    accountBaseActivityJson = accountServerActivityJson;
    sourceFixtureRoot = cloneTree(serverTree);
    fixtureRoot = cloneTree(serverTree);
    originalFixtureRoot = cloneTree(serverTree);
    editStatus = 'saving';
    accountPublishConflict = null;
    const saved = await saveLocalTreeDraft(localDraftKey, fixtureRoot, localDraftRevision, {}, accountDraftMetadata());
    localDraftRevision = saved.revision;
    localDraftPersistenceError = '';
    localMediaStatus = 'Загружена текущая версия сайта. Старые правки сохранены в локальном снимке.';
    editStatus = 'clean';
    rawDraftDirty = false;
    pendingLocalPhotoWrites.clear();
    pendingLocalPhotoDeletes.clear();
    await restoreLocalPhotoUrls();
    refreshEditableModel();
    renderProfile(currentProfileTab);
  } catch (error) {
    editStatus = error?.code === 'LOCAL_DRAFT_CONFLICT' ? 'conflict' : 'error';
    localDraftPersistenceError = error?.message || 'Не удалось загрузить версию сайта.';
    renderProfile(currentProfileTab);
  }
}

async function publishAccountDraft() {
  if (!accountPreview || !accountAdminAccess || editStatus === 'saving' || editStatus === 'conflict') return;
  if (!accountBaseTree || !accountBaseFingerprint) {
    localDraftPersistenceError = 'Нет подтверждённой исходной версии сайта. Перезагрузите древо перед публикацией.';
    editStatus = 'error';
    renderProfile(currentProfileTab);
    return;
  }
  if (!hasAccountPublishChanges()) return;

  editStatus = 'saving';
  localDraftPersistenceError = '';
  renderProfile(currentProfileTab);
  try {
    const savedDraft = await saveLocalTreeDraft(localDraftKey, editableDraftRoot(), localDraftRevision, {
      puts: [...pendingLocalPhotoWrites.values()],
      deletes: [...pendingLocalPhotoDeletes]
    }, accountDraftMetadata());
    localDraftRevision = savedDraft.revision;
    pendingLocalPhotoWrites.clear();
    pendingLocalPhotoDeletes.clear();
    originalFixtureRoot = cloneTree(editableDraftRoot());
    rawDraftDirty = false;

    const photoChanges = await collectAccountPhotoChanges();
    const payload = buildWaydeanPublishPayload({
      baseTree: accountBaseTree,
      draftTree: editableDraftRoot(),
      baseActivityJson: accountBaseActivityJson,
      baseFingerprint: accountBaseFingerprint,
      ...photoChanges
    });
    const published = await callWaydeanAdminAction('waydean-admin-publish', payload, accountAdminAccess);
    const nextTree = JSON.parse(published.treeJson);
    flattenTree(nextTree);
    accountServerTreeJson = published.treeJson;
    accountServerActivityJson = published.activityJson || '[]';
    accountServerFingerprint = published.fingerprint;
    accountBaseTree = cloneTree(nextTree);
    accountBaseFingerprint = accountServerFingerprint;
    accountBaseActivityJson = accountServerActivityJson;
    fixtureRoot = cloneTree(nextTree);
    originalFixtureRoot = cloneTree(nextTree);
    sourceFixtureRoot = cloneTree(nextTree);
    accountPublishConflict = null;
    const savedBase = await saveLocalTreeDraft(localDraftKey, fixtureRoot, localDraftRevision, {}, accountDraftMetadata());
    localDraftRevision = savedBase.revision;
    localDraftPersistenceError = '';
    localMediaStatus = published.merged
      ? 'Изменения опубликованы и объединены с версией сайта.'
      : 'Изменения опубликованы в семейном древе.';
    editStatus = 'saved';
    refreshEditableModel();
    if (!ui.history.hidden) await renderLocalHistory();
    if (!ui.backups.hidden) await renderLocalBackups();
  } catch (error) {
    if (error?.code === 'WAYDEAN_PUBLISH_CONFLICT') {
      accountPublishConflict = error.details || null;
      accountServerTreeJson = error.details?.serverTreeJson || accountServerTreeJson;
      accountServerActivityJson = error.details?.serverActivityJson || accountServerActivityJson;
      accountServerFingerprint = error.details?.serverFingerprint || accountServerFingerprint;
      editStatus = 'conflict';
      localDraftPersistenceError = 'Версия сайта изменилась. Ваш черновик сохранён отдельно; сначала сравните или загрузите текущую версию сайта.';
    } else {
      editStatus = error?.code === 'LOCAL_DRAFT_CONFLICT' ? 'conflict' : 'error';
      localDraftPersistenceError = error?.message || 'Не удалось опубликовать древо. Черновик сохранён в этом браузере.';
    }
  }
  renderProfile(currentProfileTab);
}

async function submitMockSave() {
  if (!canEditDraft() || editStatus === 'saving') return;
  editStatus = 'saving'; renderProfile(currentProfileTab);
  const fail = syntheticFixture && nextSaveFails; nextSaveFails = false;
  try {
    if (syntheticFixture) await mockSave({ shouldFail: fail });
    else {
      const result = await saveLocalTreeDraft(localDraftKey, editableDraftRoot(), localDraftRevision, {
        puts: [...pendingLocalPhotoWrites.values()],
        deletes: [...pendingLocalPhotoDeletes]
      }, accountDraftMetadata());
      localDraftRevision = result.revision;
      localDraftPersistenceError = '';
      pendingLocalPhotoWrites.clear();
      pendingLocalPhotoDeletes.clear();
      localMediaStatus = accountPreview
        ? 'Черновик и фотографии сохранены в этом браузере. Нажмите «Опубликовать в древо», чтобы обновить сайт.'
        : 'Изменения и фотографии сохранены в этом браузере. Прод не меняется.';
    }
    originalFixtureRoot = cloneTree(editableDraftRoot()); editStatus = 'saved'; rawDraftDirty = false; refreshEditableModel(); renderProfile(currentProfileTab);
    if (localTreeDraft && !ui.history.hidden) await renderLocalHistory();
    if (localTreeDraft && !ui.backups.hidden) await renderLocalBackups();
  } catch (error) {
    editStatus = error?.code === 'LOCAL_DRAFT_CONFLICT' ? 'conflict' : 'error';
    localDraftPersistenceError = error?.message || '';
    renderProfile(currentProfileTab);
  }
}

async function reloadLocalDraftFromStorage() {
  if (!localTreeDraft) return;
  if ((rawDraftDirty || isDirty(originalFixtureRoot, editableDraftRoot()))
    && !window.confirm('Заменить несохранённые изменения последней версией из этого браузера?')) return;
  try {
    const stored = await loadLocalTreeDraft(localDraftKey);
    if (!stored) throw new Error('Сохранённая локальная версия не найдена. Обновите страницу.');
    fixtureRoot = cloneTree(stored.tree);
    originalFixtureRoot = cloneTree(stored.tree);
    localDraftRevision = stored.revision;
    localDraftPersistenceError = '';
    pendingLocalPhotoWrites.clear();
    pendingLocalPhotoDeletes.clear();
    localMediaStatus = '';
    await restoreLocalPhotoUrls();
    editStatus = 'saved';
    rawDraftDirty = false;
    refreshEditableModel();
    renderProfile(currentProfileTab);
  } catch (error) {
    localDraftPersistenceError = error?.message || 'Не удалось прочитать локальную версию.';
    editStatus = 'error';
    renderProfile(currentProfileTab);
  }
}

async function cancelDraft() {
  if (!canEditDraft()) return;
  if ((rawDraftDirty || isDirty(originalFixtureRoot, editableDraftRoot())) && !window.confirm('Отменить изменения и вернуть последнюю версию черновика?')) return;
  if (localTreeDraft) {
    pendingLocalPhotoWrites.clear();
    pendingLocalPhotoDeletes.clear();
    localMediaStatus = '';
    try { await restoreLocalPhotoUrls(); }
    catch (error) { localDraftPersistenceError = error?.message || ''; }
  }
  fixtureRoot = cloneTree(originalFixtureRoot); editStatus = 'clean'; rawDraftDirty = false; refreshEditableModel(); renderProfile(currentProfileTab);
}

async function resetFixture() {
  if (!canEditDraft()) return;
  if ((rawDraftDirty || isDirty(originalFixtureRoot, editableDraftRoot())) && !window.confirm(`Вернуть исходное состояние ${draftSubject()}?`)) return;
  if (localTreeDraft) {
    try {
      await clearLocalTreeDraft(localDraftKey, localDraftRevision);
      localDraftRevision = 0;
      localDraftPersistenceError = '';
      pendingLocalPhotoWrites.clear();
      pendingLocalPhotoDeletes.clear();
      localMediaStatus = '';
      for (const url of localPhotoUrls.values()) URL.revokeObjectURL(url);
      localPhotoUrls.clear();
    } catch (error) {
      editStatus = error?.code === 'LOCAL_DRAFT_CONFLICT' ? 'conflict' : 'error';
      localDraftPersistenceError = error?.message || '';
      renderProfile(currentProfileTab);
      return;
    }
  }
  fixtureRoot = cloneTree(sourceFixtureRoot); originalFixtureRoot = cloneTree(sourceFixtureRoot); editStatus = 'clean'; rawDraftDirty = false;
  if (accountPreview) {
    accountBaseTree = cloneTree(sourceFixtureRoot);
    accountBaseFingerprint = accountServerFingerprint;
    accountBaseActivityJson = accountServerActivityJson;
  }
  refreshEditableModel(); renderProfile(currentProfileTab);
}

window.addEventListener('beforeunload', event => {
  if (canEditDraft() && (rawDraftDirty || isDirty(originalFixtureRoot, editableDraftRoot()))) { event.preventDefault(); event.returnValue = ''; }
});

function centerPerson(id) {
  const card = ui.nodes.querySelector('[data-person-id="' + CSS.escape(id) + '"]');
  if (!card) return;
  const cardCenterX = currentCameraLayout.offsetX + (parseFloat(card.style.left) + card.offsetWidth / 2) * zoom;
  const cardCenterY = currentCameraLayout.offsetY + (parseFloat(card.style.top) + card.offsetHeight / 2) * zoom;
  ui.viewport.scrollTo({
    left: Math.max(0, cardCenterX - ui.viewport.clientWidth / 2),
    top: Math.max(0, cardCenterY - ui.viewport.clientHeight / 2),
    behavior: 'instant'
  });
}

function centerVisiblePerson() {
  const selected = ui.nodes.querySelector('[data-person-id="' + CSS.escape(selectedId) + '"]');
  const target = selected || ui.nodes.querySelector('.person-node');
  if (target) centerPerson(target.dataset.personId);
}

function selectPerson(id, { preserveContext = false } = {}) {
  if (!byId.has(id)) return;
  if (id === 'demo-ali') masterMobileOverview = false;
  if (mode === 'path' && !preserveContext && !ancestors(myPersonId).includes(id)) {
    mode = 'all-tree';
    resetGenerationFilters();
    syncModeButtons(mode);
  }
  if (!preserveContext) contextAnchorId = mode === 'path' ? myPersonId : id;
  const filterResult = includePersonInFilters(filters, byId.get(id));
  filters = filterResult.filters;
  $('#minGeneration').value = String(filters.min);
  $('#maxGeneration').value = String(Number.isFinite(filters.max) ? filters.max : fullDataDepth);
  $('#photosOnly').checked = filters.photosOnly;
  selectedId = id;
  ui.app.classList.remove('profile-open');
  ui.profile.classList.remove('collapsed');
  ui.profile.parentElement.classList.remove('profile-collapsed');
  ui.profileReopen.hidden = true;
  ui.profileReopen.setAttribute('aria-expanded', 'true');
  closePopovers();
  drawTree();
  renderProfile();
  syncWhoAmIButton();
  if (zoom < 0.9 && mode !== 'all-tree') setZoom(0.9);
  centerPerson(id);
  if (filterResult.changed) announce('Фильтр расширен, чтобы показать выбранного человека.');
}

function openPrintStudio() {
  const printUrl = new URL('../docs/design/waydean/export/print-prototype/', window.location.href);
  const source = syntheticFixture ? 'demo' : 'hoti';
  printUrl.searchParams.set('tree', source);
  const handoff = { tree: source, scope: 'all' };

  if (source === 'demo') {
    printUrl.searchParams.set('scope', 'all');
  } else if (mode === 'all-tree') {
    printUrl.searchParams.set('scope', 'all');
  } else {
    printUrl.searchParams.set('scope', 'person');
    handoff.scope = 'person';
    handoff.personId = mode === 'path' ? myPersonId : selectedId;
    handoff.direction = mode === 'path' ? 'ancestors' : 'both';
    handoff.depth = mode === 'path' ? fullDataDepth : Math.min(5, fullDataDepth);
    printUrl.searchParams.set('direction', handoff.direction);
    printUrl.searchParams.set('depth', String(handoff.depth));
  }

  try {
    window.sessionStorage.setItem('waydean.print-handoff.v1', JSON.stringify(handoff));
  } catch {
    // Print Studio falls back to the full local tree if tab storage is unavailable.
  }
  window.location.assign(printUrl);
}

function openVideoStudio() {
  const scopeType = mode === 'path' || mode === 'branch' ? mode : 'all';
  const selectedPersonId = scopeType === 'path' ? (myPersonId || selectedId) : selectedId;
  const handoff = createBrowserVideoHandoff(records, {
    scopeType,
    selectedPersonId,
    title: 'История рода',
    includeDates: true,
    aspectRatio: window.matchMedia('(max-width: 700px)').matches ? '9:16' : '16:9'
  });

  try {
    window.sessionStorage.setItem(VIDEO_HANDOFF_KEY, JSON.stringify(handoff));
  } catch {
    announce('Браузер не разрешил временно подготовить видео. Проверьте свободную память и повторите.');
    return;
  }

  // Keep the top-level URL inside the installed PWA scope. The exporter is
  // embedded by waydean-preview.html, so its same-origin frame can read this
  // tab's sessionStorage handoff instead of opening outside the PWA in Safari.
  const videoUrl = new URL('./waydean-preview.html?state=all-tree&view=video-export', location.href);
  closePopovers();
  window.location.assign(videoUrl.href);
}

function openPopover(popover) {
  if (window.matchMedia('(max-width: 700px)').matches) ui.app.classList.remove('profile-open');
  closePopovers();
  lastFocus = document.activeElement;
  popover.hidden = false;
  ui.backdrop.hidden = false;
  if (popover === ui.search) $('#searchInput').focus();
}

function closePopovers() {
  const popovers = $$('.popover');
  const wasOpen = popovers.some(popover => !popover.hidden);
  popovers.forEach(popover => { popover.hidden = true; });
  ui.backdrop.hidden = true;
  if (wasOpen && lastFocus?.isConnected) lastFocus.focus();
}

function announce(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('visible'), 2200);
}

function renderPwaStatus(state = pwaController?.getState()) {
  if (!state) return;
  const installStatus = $('#pwaInstallStatus');
  const installHelp = $('#pwaInstallHelp');
  const installButton = $('#pwaInstall');
  const offlineStatus = $('#pwaOfflineStatus');
  const networkStatus = $('#pwaNetworkStatus');
  const notificationStatus = $('#pwaNotificationStatus');
  const notificationEnable = $('#pwaNotificationEnable');
  const notificationTest = $('#pwaNotificationTest');

  installStatus.textContent = state.installed
    ? 'Приложение уже установлено'
    : state.localPreview ? 'Waydean готов к установке' : 'Установка доступна в локальном preview';
  installHelp.textContent = state.installed
    ? 'Откройте Waydean с главного экрана или из списка приложений.'
    : !state.localPreview
      ? 'Установка отдельного приложения появится после выпуска Waydean.'
      : state.installPromptAvailable
        ? 'Браузер предлагает установить Waydean отдельным приложением.'
        : state.installInstructions;
  installButton.textContent = state.installed
    ? 'Waydean установлено'
    : state.installPromptAvailable ? 'Установить Waydean' : 'Как установить Waydean';
  installButton.disabled = state.installed || !state.localPreview;

  offlineStatus.textContent = !state.localPreview
    ? 'Подключим вместе с выпуском Waydean'
    : state.offlineReady
      ? 'Готово после первой загрузки'
      : state.serviceWorkerError
        ? 'Не удалось включить кеш'
        : 'Кешируется при первом открытии';
  networkStatus.textContent = state.online ? 'В сети' : 'Нет сети';
  $('#pwaOfflineNote').hidden = !state.localPreview;

  const permissionText = {
    unsupported: 'не поддерживаются',
    denied: 'запрещены в браузере',
    default: 'ещё не разрешены',
    granted: 'разрешены'
  };
  notificationStatus.textContent = permissionText[state.notificationPermission] || 'статус неизвестен';
  $('#pwaLocalNotificationArea').hidden = state.serverPushAvailable;
  notificationEnable.hidden = state.serverPushAvailable || state.notificationPermission === 'granted' || state.notificationPermission === 'unsupported';
  notificationEnable.disabled = !state.localPreview || state.notificationPermission === 'denied';
  notificationTest.hidden = !state.localPreview;
  notificationTest.disabled = !state.localPreview || state.notificationPermission !== 'granted' || !state.serviceWorkerReady;
  $('#pwaLocalPushNote').hidden = state.serverPushAvailable;
  $('#pwaServerPush').hidden = !state.serverPushAvailable;
  $('#pwaServerPushStatus').textContent = state.serverPushAvailable
    ? state.serverPushSubscribed ? 'Подключены на этом устройстве' : 'Не подключены на этом устройстве'
    : 'Недоступно';
  $('#pwaServerPushEnable').hidden = !state.serverPushAvailable || state.serverPushSubscribed;
  $('#pwaServerPushEnable').disabled = !state.online || !state.serviceWorkerReady;
  $('#pwaServerPushDisable').hidden = !state.serverPushAvailable || !state.serverPushSubscribed;
  $('#pwaServerPushDisable').disabled = !state.online || !state.serviceWorkerReady;
  if (state.notificationPermission === 'denied') {
    notificationEnable.textContent = 'Разрешение отключено в настройках браузера';
  } else {
    notificationEnable.textContent = 'Разрешить уведомления';
  }
}

function hasUncommittedDraft() {
  return Boolean(localTreeDraft && editableDraftRoot()
    && (rawDraftDirty || isDirty(originalFixtureRoot, editableDraftRoot())));
}

function openPwaPushDialog(action) {
  pwaPushAction = action;
  const dialog = $('#pwaPushDialog');
  const subscribing = action === 'subscribe';
  $('#pwaPushDialogTitle').textContent = subscribing ? 'Включить push-уведомления' : 'Отключить push-уведомления';
  $('#pwaPushDialogHelp').textContent = subscribing
    ? 'Введите пароль редактора. Браузер также попросит разрешить уведомления.'
    : 'Введите пароль редактора, чтобы удалить подписку этого устройства с сервера.';
  $('#pwaPushSubmit').textContent = subscribing ? 'Включить' : 'Отключить';
  $('#pwaPushPassword').value = '';
  $('#pwaPushError').hidden = true;
  if (dialog.showModal) dialog.showModal();
  else announce('Браузер не поддерживает окно подтверждения уведомлений.');
  $('#pwaPushPassword').focus();
}

function formatLocalDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Дата неизвестна' : date.toLocaleString('ru-RU', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

async function renderLocalHistory() {
  const list = $('#localHistoryList');
  list.replaceChildren();
  if (accountPreview) {
    $('#historyTitle').textContent = 'История сайта и устройства';
    $('#historyNote').textContent = 'Журнал сайта загружен из текущего древа. Локальная история хранится отдельно в этом браузере.';
    const serverHeading = document.createElement('h3');
    serverHeading.className = 'local-history-section-title';
    serverHeading.textContent = 'Журнал сайта';
    list.append(serverHeading);
    const serverEntries = parseWaydeanActivity(accountServerActivityJson);
    if (!serverEntries.length) {
      const empty = document.createElement('p');
      empty.className = 'local-data-empty';
      empty.textContent = 'В журнале сайта пока нет записей.';
      list.append(empty);
    } else {
      for (const entry of serverEntries) {
        const row = document.createElement('article'); row.className = 'local-history-row';
        const title = document.createElement('strong'); title.textContent = describeWaydeanActivity(entry);
        const date = document.createElement('time');
        date.dateTime = typeof entry.at === 'string' ? entry.at : '';
        date.textContent = formatLocalDate(entry.at);
        const details = [
          typeof entry.father === 'string' && entry.father ? `Родитель: ${entry.father}` : '',
          entry.type === 'year' && entry.field === 'born' ? 'Дата рождения' : '',
          entry.type === 'year' && entry.field === 'died' ? 'Дата смерти' : ''
        ].filter(Boolean).join(' · ');
        const meta = document.createElement('small'); meta.textContent = details || 'Изменение опубликовано в семейном древе';
        row.append(title, date, meta); list.append(row);
      }
    }
    const localHeading = document.createElement('h3');
    localHeading.className = 'local-history-section-title';
    localHeading.textContent = 'Черновик этого устройства';
    list.append(localHeading);
  } else {
    $('#historyTitle').textContent = 'История локальных действий';
    $('#historyNote').textContent = 'Сохранения черновика и операции с локальными снимками в этом браузере.';
  }
  if (!localTreeDraft) {
    const empty = document.createElement('p'); empty.className = 'local-data-empty'; empty.textContent = 'Локальная история доступна только в рабочей копии на этом компьютере.'; list.append(empty); return;
  }
  try {
    const entries = await listLocalTreeHistory(localDraftKey);
    if (!entries.length) {
      const empty = document.createElement('p'); empty.className = 'local-data-empty'; empty.textContent = accountPreview
        ? 'Локальных действий пока нет.'
        : 'История появится после первого локального сохранения или снимка.';
      list.append(empty); return;
    }
    for (const entry of entries) {
      const row = document.createElement('article'); row.className = 'local-history-row';
      const title = document.createElement('strong'); title.textContent = entry.label;
      const date = document.createElement('time'); date.dateTime = entry.createdAt; date.textContent = formatLocalDate(entry.createdAt);
      const meta = document.createElement('small'); meta.textContent = `${entry.personCount ?? records.length} человек${entry.revision ? ` · ревизия ${entry.revision}` : ''}`;
      row.append(title, date, meta); list.append(row);
    }
  } catch (error) {
    const message = document.createElement('p'); message.className = 'local-data-empty is-error'; message.textContent = error?.message || 'Не удалось прочитать локальную историю.'; list.append(message);
  }
}

async function renderLocalBackups() {
  const list = $('#localBackupList');
  const status = $('#localBackupStatus');
  const create = $('#createLocalBackup');
  list.replaceChildren();
  const dirty = hasUncommittedDraft();
  create.disabled = !localTreeDraft || dirty || editStatus === 'saving' || editStatus === 'conflict';
  status.textContent = dirty ? 'Сначала сохраните или отмените несохранённые изменения.' : 'Снимки содержат локальное дерево и отметки фото; сами фотофайлы не входят.';
  if (!localTreeDraft) {
    const empty = document.createElement('p'); empty.className = 'local-data-empty'; empty.textContent = 'Локальные резервные копии доступны только в рабочей копии на этом компьютере.'; list.append(empty); return;
  }
  try {
    const backups = await listLocalTreeBackups(localDraftKey);
    if (!backups.length) {
      const empty = document.createElement('p'); empty.className = 'local-data-empty'; empty.textContent = 'Снимков пока нет. Перед первым сохранением предыдущей версии ещё не существует.'; list.append(empty); return;
    }
    for (const backup of backups) {
      const row = document.createElement('article'); row.className = 'local-backup-row';
      const heading = document.createElement('div'); heading.className = 'local-backup-heading';
      const title = document.createElement('strong'); title.textContent = backup.label;
      const date = document.createElement('time'); date.dateTime = backup.createdAt; date.textContent = formatLocalDate(backup.createdAt);
      heading.append(title, date);
      const details = document.createElement('small'); details.textContent = `${backup.personCount} человек · ${backup.photoCount} отметок фото${backup.pinned ? ' · закреплён' : ''}${backup.safety ? ' · страховочный снимок' : ''}`;
      const actions = document.createElement('div'); actions.className = 'local-backup-actions';
      const restore = document.createElement('button'); restore.type = 'button'; restore.textContent = 'Восстановить'; restore.disabled = dirty || editStatus === 'saving' || editStatus === 'conflict';
      restore.addEventListener('click', () => restoreLocalBackup(backup));
      const pin = document.createElement('button'); pin.type = 'button'; pin.textContent = backup.pinned ? 'Открепить' : 'Закрепить';
      pin.addEventListener('click', () => toggleLocalBackupPin(backup));
      actions.append(restore, pin); row.append(heading, details, actions); list.append(row);
    }
  } catch (error) {
    status.textContent = error?.message || 'Не удалось прочитать локальные снимки.';
  }
}

async function renderAccountBackups() {
  const group = $('#accountBackupGroup');
  const list = $('#accountBackupList');
  const status = $('#accountBackupStatus');
  const create = $('#createAccountBackup');
  if (!group || !list || !status || !create) return;
  group.hidden = !accountPreview;
  if (!accountPreview) return;
  list.replaceChildren();
  const dirty = hasUncommittedDraft();
  const unpublished = hasAccountPublishChanges();
  create.disabled = dirty || unpublished || !accountBaseFingerprint || editStatus === 'saving' || editStatus === 'conflict';
  status.textContent = dirty
    ? 'Сначала сохраните черновик и опубликуйте его или отмените изменения.'
    : editStatus === 'conflict'
      ? 'Обновите текущую версию сайта, прежде чем создавать или восстанавливать снимок.'
      : unpublished
        ? 'Сначала опубликуйте или отмените изменения аккаунтного черновика.'
        : 'Снимки сайта доступны с этого и других устройств после входа в разрешённый аккаунт.';
  try {
    const result = await callWaydeanAdminAction('waydean-admin-backups', {}, accountAdminAccess);
    const backups = parseWaydeanBackups(result.backups);
    if (!backups.length) {
      const empty = document.createElement('p'); empty.className = 'local-data-empty';
      empty.textContent = 'Серверных снимков пока нет.'; list.append(empty); return;
    }
    for (const backup of backups) {
      const row = document.createElement('article'); row.className = 'local-backup-row';
      const heading = document.createElement('div'); heading.className = 'local-backup-heading';
      const title = document.createElement('strong'); title.textContent = backup.label;
      const date = document.createElement('time'); date.dateTime = backup.savedAt; date.textContent = formatLocalDate(backup.savedAt);
      heading.append(title, date);
      const details = document.createElement('small'); details.textContent = `${backup.personCount} человек${backup.pinned ? ' · закреплён на сервере' : ''}`;
      const actions = document.createElement('div'); actions.className = 'local-backup-actions';
      const restore = document.createElement('button'); restore.type = 'button'; restore.textContent = 'Восстановить';
      restore.disabled = dirty || unpublished || !accountBaseFingerprint || editStatus === 'saving' || editStatus === 'conflict';
      restore.addEventListener('click', () => restoreAccountBackup(backup));
      const pin = document.createElement('button'); pin.type = 'button'; pin.textContent = backup.pinned ? 'Открепить' : 'Закрепить';
      pin.disabled = editStatus === 'saving';
      pin.addEventListener('click', () => toggleAccountBackupPin(backup));
      actions.append(restore, pin); row.append(heading, details, actions); list.append(row);
    }
  } catch (error) {
    status.textContent = error?.message || 'Не удалось загрузить серверные снимки.';
  }
}

function renderAccountAdminTools() {
  const panel = $('#accountAdminPanel');
  const state = $('#accountAdminLockState');
  const detail = $('#accountAdminLockDetail');
  const toggle = $('#accountAdminLockToggle');
  panel.hidden = !accountPreview || !accountAdminAccess;
  if (panel.hidden) return;

  if (typeof accountTreeLocked !== 'boolean') {
    state.textContent = 'Статус правок недоступен';
    detail.textContent = 'Обновите страницу и повторите попытку.';
    toggle.textContent = 'Статус не загружен';
    toggle.disabled = true;
    $('#accountAdminPasswordSubmit').disabled = accountAdminPasswordBusy;
    return;
  }

  const presentation = accountLockPresentation(accountTreeLocked, accountTreeLockReason, accountCanToggleLock);
  state.textContent = presentation.state;
  detail.textContent = presentation.detail;
  toggle.textContent = presentation.buttonLabel;
  toggle.disabled = accountAdminLockBusy || !presentation.canToggle;
  $('#accountAdminPasswordSubmit').disabled = accountAdminPasswordBusy;
}

async function toggleAccountTreeLock() {
  if (!accountPreview || !accountAdminAccess || typeof accountTreeLocked !== 'boolean' || !accountCanToggleLock || accountAdminLockBusy) return;
  const nextLocked = !accountTreeLocked;
  const actionLabel = nextLocked ? 'закрыть' : 'разрешить';
  if (!window.confirm(`Вы уверены, что хотите ${actionLabel} правки семейного древа?`)) return;

  const message = $('#accountAdminLockMessage');
  accountAdminLockBusy = true;
  message.textContent = nextLocked ? 'Закрываю правки…' : 'Открываю правки…';
  renderAccountAdminTools();
  try {
    const result = await callWaydeanAdminAction('waydean-admin-lock', {
      locked: nextLocked,
      reason: ''
    }, accountAdminAccess);
    if (typeof result.locked !== 'boolean') throw new Error('Сервер не подтвердил новое состояние правок.');
    accountTreeLocked = result.locked;
    accountTreeLockReason = typeof result.lockedReason === 'string' ? result.lockedReason : '';
    accountCanToggleLock = result.canToggleLock === true;
    message.textContent = result.locked === nextLocked
      ? (result.locked ? 'Правки закрыты для семейного входа.' : 'Правки снова разрешены.')
      : 'Правки остаются ограничены тарифом или состоянием дерева.';
    announce(result.locked ? 'Правки семейного древа закрыты.' : 'Правки семейного древа разрешены.');
  } catch (error) {
    message.textContent = error?.message || 'Не удалось изменить доступ к правкам.';
  } finally {
    accountAdminLockBusy = false;
    renderAccountAdminTools();
  }
}

async function changeAccountFamilyPassword(event) {
  event.preventDefault();
  if (!accountPreview || !accountAdminAccess || accountAdminPasswordBusy) return;
  const password = $('#accountAdminNewPassword').value;
  const confirmation = $('#accountAdminPasswordConfirm').value;
  const message = $('#accountAdminPasswordMessage');
  const validation = validateFamilyPasswordChange(password, confirmation);
  if (!validation.ok) {
    message.textContent = validation.error;
    return;
  }
  if (!window.confirm('Сменить пароль семейного входа? Всем, кто входит в старое древо, понадобится новый пароль.')) return;

  accountAdminPasswordBusy = true;
  message.textContent = 'Обновляю семейный пароль…';
  renderAccountAdminTools();
  try {
    const result = await callWaydeanAdminAction('waydean-admin-password', {
      newPassword: validation.normalizedPassword
    }, accountAdminAccess);
    if (result.passwordChanged !== true) throw new Error('Сервер не подтвердил смену пароля.');
    $('#accountAdminPasswordForm').reset();
    message.textContent = 'Пароль изменён. Передайте его членам семьи, которым нужен вход.';
    announce('Пароль семейного входа изменён.');
  } catch (error) {
    message.textContent = error?.message || 'Не удалось изменить семейный пароль.';
  } finally {
    accountAdminPasswordBusy = false;
    renderAccountAdminTools();
  }
}

async function createAccountBackup() {
  if (!accountPreview || hasUncommittedDraft() || hasAccountPublishChanges() || !accountBaseFingerprint || editStatus === 'saving' || editStatus === 'conflict') {
    await renderAccountBackups();
    return;
  }
  const create = $('#createAccountBackup');
  const status = $('#accountBackupStatus');
  create.disabled = true;
  status.textContent = 'Создаю снимок древа на сайте…';
  try {
    const label = `Waydean · ${new Date().toLocaleString('ru-RU')}`;
    await callWaydeanAdminAction('waydean-admin-snapshot', { label }, accountAdminAccess);
    await Promise.all([renderAccountBackups(), renderLocalHistory()]);
    status.textContent = 'Серверный снимок создан. Он доступен после входа в аккаунт на другом устройстве.';
    announce('Снимок древа сохранён на сайте.');
  } catch (error) {
    status.textContent = error?.message || 'Не удалось создать серверный снимок.';
    create.disabled = false;
  }
}

async function toggleAccountBackupPin(backup) {
  const status = $('#accountBackupStatus');
  status.textContent = backup.pinned ? 'Открепляю снимок на сервере…' : 'Закрепляю снимок на сервере…';
  try {
    await callWaydeanAdminAction('waydean-admin-pin-backup', {
      backup: backup.name,
      pinned: !backup.pinned
    }, accountAdminAccess);
    await renderAccountBackups();
    status.textContent = backup.pinned ? 'Снимок откреплён на сервере.' : 'Снимок закреплён на сервере.';
    announce(backup.pinned ? 'Снимок сайта откреплён.' : 'Снимок сайта закреплён.');
  } catch (error) {
    status.textContent = error?.message || 'Не удалось изменить закрепление снимка.';
  }
}

async function restoreAccountBackup(backup) {
  if (!accountPreview || hasUncommittedDraft() || hasAccountPublishChanges() || !accountBaseFingerprint || editStatus === 'saving' || editStatus === 'conflict') {
    await renderAccountBackups();
    return;
  }
  const confirmed = window.confirm(`Восстановить серверное древо из снимка «${backup.label}» от ${formatLocalDate(backup.savedAt)}? Текущая версия будет автоматически сохранена отдельным снимком перед восстановлением.`);
  if (!confirmed) return;
  const status = $('#accountBackupStatus');
  status.textContent = 'Проверяю версию сайта и восстанавливаю снимок…';
  let serverRestoreCommitted = false;
  try {
    const restored = await callWaydeanAdminAction('waydean-admin-restore', {
      backup: backup.name,
      expectedFingerprint: accountBaseFingerprint,
      expectedActivityJson: accountBaseActivityJson
    }, accountAdminAccess);
    serverRestoreCommitted = true;
    const root = JSON.parse(restored.treeJson);
    flattenTree(root);
    accountServerTreeJson = restored.treeJson;
    accountServerActivityJson = restored.activityJson || '[]';
    accountServerFingerprint = restored.fingerprint;
    accountBaseTree = cloneTree(root);
    accountBaseFingerprint = restored.fingerprint;
    accountBaseActivityJson = accountServerActivityJson;
    accountPublishConflict = null;
    sourceFixtureRoot = cloneTree(root);
    fixtureRoot = cloneTree(root);
    originalFixtureRoot = cloneTree(root);
    pendingLocalPhotoWrites.clear(); pendingLocalPhotoDeletes.clear();
    rawDraftDirty = false; editStatus = 'saved';
    let localPersistenceError = '';
    try {
      const stored = await saveLocalTreeDraft(localDraftKey, fixtureRoot, localDraftRevision, {}, accountDraftMetadata());
      localDraftRevision = stored.revision;
      localDraftPersistenceError = '';
    } catch (error) {
      editStatus = 'error';
      localDraftPersistenceError = error?.message || 'Не удалось обновить локальный черновик.';
      localPersistenceError = localDraftPersistenceError;
    }
    await restoreLocalPhotoUrls();
    for (const id of ['minGeneration', 'maxGeneration']) document.getElementById(id).replaceChildren();
    populateGenerationFilters(); resetGenerationFilters(); refreshEditableModel();
    if (!byId.has(selectedId)) selectedId = records[0]?.id ?? null;
    renderProfile();
    await Promise.all([renderAccountBackups(), renderLocalBackups(), renderLocalHistory()]);
    status.textContent = localPersistenceError
      ? `Снимок восстановлен на сайте, но локальную копию не удалось обновить: ${localPersistenceError}`
      : 'Снимок восстановлен на сайте. Текущая версия сохранена в отдельном серверном снимке.';
    announce('Серверная копия восстановлена. Текущая версия сохранена отдельно.');
  } catch (error) {
    if (error?.code === 'WAYDEAN_PUBLISH_CONFLICT') {
      accountPublishConflict = error.details || null;
      accountServerTreeJson = error.details?.serverTreeJson || accountServerTreeJson;
      accountServerActivityJson = error.details?.serverActivityJson || accountServerActivityJson;
      accountServerFingerprint = error.details?.serverFingerprint || accountServerFingerprint;
      editStatus = 'conflict';
      localDraftPersistenceError = 'Сайт изменился после загрузки. Ваш локальный черновик сохранён; загрузите текущую версию сайта перед повтором.';
      renderProfile(currentProfileTab);
    }
    status.textContent = serverRestoreCommitted
      ? `Снимок уже восстановлен на сайте, но локальная копия или экран не обновились: ${error?.message || 'повторите загрузку страницы.'}`
      : error?.message || 'Не удалось восстановить серверный снимок.';
    await renderAccountBackups();
  }
}

async function makeLocalBackup() {
  if (!localTreeDraft || hasUncommittedDraft() || editStatus === 'saving' || editStatus === 'conflict') {
    await renderLocalBackups();
    return;
  }
  const create = $('#createLocalBackup');
  const status = $('#localBackupStatus');
  create.disabled = true;
  status.textContent = 'Создаю снимок локального дерева…';
  try {
    await createLocalTreeBackup(localDraftKey, editableDraftRoot(), localDraftRevision);
    status.textContent = 'Локальный снимок создан.';
    await Promise.all([renderLocalBackups(), renderLocalHistory()]);
    announce('Создан локальный снимок. Он хранится только в этом браузере.');
  } catch (error) {
    status.textContent = error?.message || 'Не удалось создать локальный снимок.';
    create.disabled = false;
  }
}

async function toggleLocalBackupPin(backup) {
  try {
    await setLocalTreeBackupPinned(localDraftKey, backup.id, !backup.pinned);
    await Promise.all([renderLocalBackups(), renderLocalHistory()]);
    announce(backup.pinned ? 'Снимок откреплён.' : 'Снимок закреплён.');
  } catch (error) {
    $('#localBackupStatus').textContent = error?.message || 'Не удалось изменить снимок.';
  }
}

async function restoreLocalBackup(backup) {
  if (!localTreeDraft || hasUncommittedDraft() || editStatus === 'saving' || editStatus === 'conflict') {
    await renderLocalBackups();
    return;
  }
  const confirmed = window.confirm(`Восстановить локальное дерево из снимка «${backup.label}» от ${formatLocalDate(backup.createdAt)}? Текущее сохранённое дерево автоматически останется в снимках. Фотофайлы из этой копии не восстанавливаются.`);
  if (!confirmed) return;
  const status = $('#localBackupStatus');
  status.textContent = 'Восстанавливаю локальную копию…';
  try {
    const result = await restoreLocalTreeBackup(localDraftKey, backup.id, localDraftRevision);
    fixtureRoot = cloneTree(result.tree);
    originalFixtureRoot = cloneTree(result.tree);
    localDraftRevision = result.revision;
    editStatus = 'saved'; rawDraftDirty = false;
    pendingLocalPhotoWrites.clear(); pendingLocalPhotoDeletes.clear();
    await restoreLocalPhotoUrls();
    for (const id of ['minGeneration', 'maxGeneration']) document.getElementById(id).replaceChildren();
    populateGenerationFilters();
    resetGenerationFilters();
    refreshEditableModel();
    if (!byId.has(selectedId)) selectedId = records[0]?.id ?? null;
    renderProfile();
    await Promise.all([renderLocalBackups(), renderLocalHistory()]);
    status.textContent = 'Снимок восстановлен. Текущая версия сохранена автоматически.';
    announce('Локальный снимок восстановлен. Текущая версия осталась в списке снимков.');
  } catch (error) {
    editStatus = error?.code === 'LOCAL_DRAFT_CONFLICT' ? 'conflict' : 'error';
    localDraftPersistenceError = error?.message || 'Не удалось восстановить локальный снимок.';
    renderProfile(currentProfileTab);
    status.textContent = localDraftPersistenceError;
  }
}

function startHijriYearPulse() {
  window.setInterval(() => document.body.classList.toggle('years-hijri'), 3000);
}

async function shareLocalPreview() {
  const url = new URL(location.href);
  url.hash = '';
  url.searchParams.delete('refresh');
  const shareText = `Waydean — локальный просмотр семейного древа\n${url.href}`;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareText);
    } else {
      const field = document.createElement('textarea');
      field.value = shareText;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.append(field);
      field.select();
      let copied = false;
      try { copied = document.execCommand('copy'); }
      finally { field.remove(); }
      if (!copied) throw new Error('Clipboard copy was rejected.');
    }
    announce('Скопирована ссылка на локальный просмотр. Она открывается только на компьютере с запущенным сервером.');
  } catch {
    window.prompt('Скопируйте ссылку на локальный просмотр. Она доступна только на этом компьютере:', url.href);
  }
}

function syncModeButtons(activeMode = mode) {
  $$('.rail-action[data-mode],.mobile-nav [data-mode]').forEach(button => {
    const active = button.dataset.mode === activeMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function resetGenerationFilters() {
  filters = { min: 1, max: fullDataDepth, photosOnly: false };
  $('#minGeneration').value = '1';
  $('#maxGeneration').value = String(fullDataDepth);
  $('#photosOnly').checked = false;
}

function setMode(next, announceMode = true) {
  masterMobileOverview = false;
  if (next === 'path' && (!myPersonId || !byId.has(myPersonId))) {
    openPopover(ui.search);
    $('#searchInput').focus({ preventScroll: true });
    announce('Сначала выберите человека и отметьте его в профиле как себя.');
    return;
  }
  if (next === 'all-tree') resetGenerationFilters();
  mode = next;
  if (next === 'path') {
    selectedId = myPersonId;
    resetGenerationFilters();
  }
  const nextUrl = previewUrlForMode(location.href, next);
  if (nextUrl) history.replaceState(history.state, '', nextUrl);
  contextAnchorId = next === 'path' ? myPersonId : selectedId;
  ui.app.classList.remove('profile-open');
  closePopovers();
  syncModeButtons(next);
  drawTree();
  fitTree();
  syncWhoAmIButton();
  const labels = { path: 'Подсвечен путь от старшего известного предка.', branch: 'Показана выбранная ветвь.', all: 'Показаны ближайшие три поколения.', 'all-tree': 'Всё дерево доступно. Мини-карта поможет перейти к другим ветвям.' };
  if (announceMode) announce(labels[next] || labels.all);
}

function updateSearch(value) {
  const q = value.trim().toLocaleLowerCase('ru');
  const nameQuery = q.replace(/1/g, 'i');
  const found = records.filter(person => {
    const name = String(person.name ?? '').toLocaleLowerCase('ru');
    const teip = String(person.teip ?? '').trim().toLocaleLowerCase('ru');
    const years = `${person.born ?? ''} ${person.died ?? ''}`.toLocaleLowerCase('ru');
    return !q || name.includes(nameQuery) || years.includes(q) || teip.includes(q);
  });
  const list = $('#searchResults');
  list.replaceChildren();
  if (!found.length) {
    const empty = document.createElement('p'); empty.className = 'empty-search'; empty.textContent = q ? `По запросу «${value}» никого не найдено.` : 'Введи имя, год или тейп.'; list.append(empty); return;
  }
  const shown = found.slice(0, 35);
  for (const person of shown) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'search-result';
    button.append(createAvatar(person, 'search-avatar'));
    const copy = document.createElement('span'); copy.className = 'result-copy';
    const name = document.createElement('strong'); name.textContent = person.name;
    const meta = document.createElement('small'); meta.textContent = `${formatYears(person)} · поколение ${person.generation}`;
    copy.append(name, meta); button.append(copy);
    const teip = String(person.teip ?? '').trim();
    if (teip) {
      const teipLabel = document.createElement('small');
      teipLabel.className = 'result-teip';
      teipLabel.textContent = `Тейп: ${teip}`;
      teipLabel.title = teipLabel.textContent;
      copy.append(teipLabel);
    }
    const arrow = document.createElement('span'); arrow.className = 'result-arrow'; arrow.textContent = '›'; button.append(arrow);
    button.addEventListener('click', () => selectPerson(person.id));
    list.append(button);
  }
  if (found.length > shown.length) {
    const more = document.createElement('p'); more.className = 'result-count'; more.textContent = `Показаны первые ${shown.length} из ${found.length} совпадений.`; list.append(more);
  }
}

function updateStats() {
  const generations = Math.max(...records.map(person => person.generation));
  const branches = childrenById.get(records[0]?.id)?.length || 0;
  const photos = records.filter(hasDisplayPhoto).length;
  $('#statsGrid').replaceChildren();
  for (const [value, label] of [
    [records.length, 'человек'],
    [generations, russianPlural(generations, 'поколение', 'поколения', 'поколений')],
    [branches, 'линии первого уровня'],
    [photos, 'фотографий']
  ]) {
    const card = document.createElement('div'); card.className = 'stat-card';
    const number = document.createElement('strong'); number.textContent = String(value);
    const caption = document.createElement('small'); caption.textContent = label;
    card.append(number, caption); $('#statsGrid').append(card);
  }
  const visibleCount = ui.nodes.querySelectorAll('.person-node').length;
  $('#statsNote').textContent = `В кадре сейчас ${russianCount(visibleCount, 'человек', 'человека', 'человек')}.`;
}

function updateMiniViewport() {
  if (!currentCameraLayout || !ui.miniSvg.querySelector('.mini-dot')) return;
  const frame = miniMapViewport({
    graphWidth: ui.graph.offsetWidth, graphHeight: ui.graph.offsetHeight, zoom,
    scrollLeft: ui.viewport.scrollLeft, scrollTop: ui.viewport.scrollTop,
    viewWidth: ui.viewport.clientWidth, viewHeight: ui.viewport.clientHeight,
    offsetX: currentCameraLayout.offsetX, offsetY: currentCameraLayout.offsetY
  });
  let rect = ui.miniSvg.querySelector('.mini-window');
  if (!rect) {
    rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('class', 'mini-window');
    ui.miniSvg.append(rect);
  }
  for (const key of ['x', 'y', 'width', 'height']) rect.setAttribute(key, String(frame[key]));
}

function miniPoint(clientX, clientY) {
  const point = ui.miniSvg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(ui.miniSvg.getScreenCTM().inverse());
}

function moveFromMiniMap(clientX, clientY) {
  if (!currentCameraLayout || !ui.miniSvg.querySelector('.mini-dot')) return;
  const point = miniPoint(clientX, clientY);
  const target = miniMapScrollTarget({
    miniX: point.x, miniY: point.y,
    graphWidth: ui.graph.offsetWidth, graphHeight: ui.graph.offsetHeight, zoom,
    viewWidth: ui.viewport.clientWidth, viewHeight: ui.viewport.clientHeight,
    offsetX: currentCameraLayout.offsetX, offsetY: currentCameraLayout.offsetY
  });
  ui.viewport.scrollTo({ left: target.left, top: target.top, behavior: 'instant' });
  scheduleMiniViewportUpdate();
}

function populateGenerationFilters() {
  const max = Math.max(...records.map(person => person.generation));
  for (const id of ['minGeneration','maxGeneration']) {
    const select = document.getElementById(id);
    for (let generation = 1; generation <= max; generation++) {
      const option = document.createElement('option'); option.value = String(generation); option.textContent = String(generation); select.append(option);
    }
  }
  $('#maxGeneration').value = String(max);
  filters.max = max;
}

function bindControls() {
  ui.miniMapToggle.addEventListener('click', () => {
    setMiniMapCollapsed(!ui.miniMap.classList.contains('collapsed'));
  });
  ui.railToggle.addEventListener('click', () => {
    const collapsed = !ui.profile.parentElement.classList.contains('rail-hidden');
    setRailCollapsed(collapsed, { persist: true });
  });
  ui.profileReopen.addEventListener('click', () => setProfileCollapsed(false));
  ui.mobileSelected.addEventListener('click', () => {
    setProfileCollapsed(false);
    ui.app.classList.add('profile-open');
    closePopovers();
    ui.profile.querySelector('.profile-close')?.focus();
  });
  ui.mobileSearch.addEventListener('click', () => {
    ui.app.classList.remove('profile-open');
    openPopover(ui.search);
  });
  $('#searchOpen').addEventListener('click', () => openPopover(ui.search));
  $('#railSearch').addEventListener('click', () => openPopover(ui.search));
  $('#searchInput').addEventListener('input', event => updateSearch(event.target.value));
  $('#filtersOpen').addEventListener('click', () => openPopover(ui.filters));
  $('#moreFilters').addEventListener('click', () => openPopover(ui.filters));
  $('#statsOpen').addEventListener('click', () => openPopover(ui.stats));
  $('#railStats').addEventListener('click', () => openPopover(ui.stats));
  $('#mobileStats').addEventListener('click', () => openPopover(ui.stats));
  $('#moreOpen').addEventListener('click', () => openPopover(ui.more));
  $('#mobileMore').addEventListener('click', () => openPopover(ui.more));
  $('#morePwa').addEventListener('click', () => { openPopover(ui.pwa); renderPwaStatus(); });
  $('#pwaInstall').addEventListener('click', async () => {
    try {
      const result = await pwaController.install();
      if (result === 'accepted' || result === 'installed') announce('Waydean добавлен на устройство.');
      else if (result === 'dismissed') announce('Установка отменена.');
      else announce(pwaController.getState().installInstructions);
      renderPwaStatus();
    } catch (error) {
      announce(error?.message || 'Не удалось установить Waydean.');
    }
  });
  $('#pwaNotificationEnable').addEventListener('click', async () => {
    try {
      const permission = await pwaController.requestNotificationPermission();
      announce(permission === 'granted'
        ? 'Разрешение получено. Теперь можно отправить тестовое уведомление.'
        : permission === 'denied'
          ? 'Уведомления запрещены в настройках браузера.'
          : 'Браузер не поддерживает уведомления.');
      renderPwaStatus();
    } catch (error) {
      announce(error?.message || 'Не удалось запросить разрешение на уведомления.');
    }
  });
  $('#pwaNotificationTest').addEventListener('click', async () => {
    try {
      await pwaController.sendTestNotification();
      announce('Отправлено тестовое уведомление на это устройство.');
    } catch (error) {
      announce(error?.message || 'Не удалось отправить тестовое уведомление.');
    }
  });
  $('#pwaServerPushEnable').addEventListener('click', () => openPwaPushDialog('subscribe'));
  $('#pwaServerPushDisable').addEventListener('click', () => openPwaPushDialog('unsubscribe'));
  $('#pwaPushCancel').addEventListener('click', () => $('#pwaPushDialog').close());
  $('#pwaPushForm').addEventListener('submit', async event => {
    event.preventDefault();
    const submit = $('#pwaPushSubmit');
    const error = $('#pwaPushError');
    const password = $('#pwaPushPassword').value;
    submit.disabled = true;
    $('#pwaPushCancel').disabled = true;
    error.hidden = true;
    try {
      if (pwaPushAction === 'subscribe') await pwaController.subscribeServerPush(password, 'drewo');
      else await pwaController.unsubscribeServerPush(password, 'drewo');
      $('#pwaPushDialog').close();
      announce(pwaPushAction === 'subscribe' ? 'Push-уведомления включены для этого устройства.' : 'Push-уведомления отключены для этого устройства.');
      renderPwaStatus();
    } catch (failure) {
      error.textContent = failure?.message || 'Не удалось изменить подписку.';
      error.hidden = false;
    } finally {
      submit.disabled = false;
      $('#pwaPushCancel').disabled = false;
    }
  });
  $('#moreHistory').addEventListener('click', () => { openPopover(ui.history); renderLocalHistory(); });
  $('#moreBackups').addEventListener('click', () => { openPopover(ui.backups); renderLocalBackups(); renderAccountBackups(); });
  $('#accountAdminLockToggle').addEventListener('click', toggleAccountTreeLock);
  $('#accountAdminPasswordForm').addEventListener('submit', changeAccountFamilyPassword);
  $('#createLocalBackup').addEventListener('click', makeLocalBackup);
  $('#createAccountBackup').addEventListener('click', createAccountBackup);
  $('#openCurrentTree').addEventListener('click', () => window.location.assign('./index.html'));
  $('#shareOpen').addEventListener('click', shareLocalPreview);
  $('#printOpen').addEventListener('click', openPrintStudio);
  $('#moreExport').addEventListener('click', openPrintStudio);
  $('#moreVideo').addEventListener('click', openVideoStudio);
  $$('.popover [data-close]').forEach(button => button.addEventListener('click', closePopovers));
  ui.backdrop.addEventListener('click', closePopovers);
  $$('.nav-item[data-mode],.more-item[data-mode],.rail-action[data-mode],.mobile-nav [data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
  $('#showFullTree').addEventListener('click', () => setMode('all-tree'));
  $$('.nav-item[data-nav],.mobile-nav [data-nav]').forEach(button => button.addEventListener('click', () => {
    $$('.nav-item[data-nav],.mobile-nav [data-nav]').forEach(item => item.classList.toggle('active', item.dataset.nav === button.dataset.nav));
    if (button.dataset.nav === 'tree') setMode('all-tree');
    if (button.dataset.nav === 'people') openPopover(ui.search);
  }));
  $('#applyFilters').addEventListener('click', () => {
    masterMobileOverview = false;
    const previousSelectedId = selectedId;
    filters = { min: Number($('#minGeneration').value), max: Number($('#maxGeneration').value), photosOnly: $('#photosOnly').checked };
    let pathFiltersAdjusted = false;
    if (mode === 'path' && myPersonId) {
      const pathPeople = ancestors(myPersonId).map(id => byId.get(id)).filter(Boolean);
      if (pathPeople.length) {
        const firstGeneration = Math.min(...pathPeople.map(person => person.generation));
        const lastGeneration = Math.max(...pathPeople.map(person => person.generation));
        const requested = filters;
        filters = {
          min: Math.min(filters.min, firstGeneration),
          max: Math.max(filters.max, lastGeneration),
          photosOnly: false
        };
        pathFiltersAdjusted = filters.min !== requested.min || filters.max !== requested.max || requested.photosOnly;
        $('#minGeneration').value = String(filters.min);
        $('#maxGeneration').value = String(filters.max);
        $('#photosOnly').checked = false;
      }
    }
    selectedId = fallbackSelectedPersonId(selectedId, currentRecords());
    closePopovers();
    if (selectedId !== previousSelectedId) renderProfile();
    drawTree(); fitTree();
    if (selectedId !== previousSelectedId) announce('Выбранный человек скрыт фильтром. Выбрана первая карточка в результатах.');
    else if (pathFiltersAdjusted) announce('Фильтры скорректированы, чтобы показать всю линию предков.');
  });
  $('#resetFilters').addEventListener('click', () => {
    masterMobileOverview = false;
    resetGenerationFilters();
    closePopovers(); drawTree(); fitTree();
  });
  $('#emptyReset').addEventListener('click', () => $('#resetFilters').click());
  $('#zoomIn').addEventListener('click', () => setZoom(zoom + 0.1));
  $('#zoomOut').addEventListener('click', () => setZoom(zoom - 0.1));
  $('#fitTree').addEventListener('click', fitTree);
  $('#whoAmI').addEventListener('click', () => {
    if (myPersonId && byId.has(myPersonId)) {
      setMode(mode === 'path' ? 'all-tree' : 'path');
      return;
    }
    openPopover(ui.search);
    $('#searchInput').focus({ preventScroll: true });
    announce('Выберите человека, откройте его карточку и нажмите «Отметить как меня».');
  });
  const whoAmIPrompt = $('#whoAmIPrompt');
  $('#whoAmIPromptChoose').addEventListener('click', () => {
    if (whoAmIPrompt?.open) whoAmIPrompt.close();
    openPopover(ui.search);
    $('#searchInput').focus({ preventScroll: true });
    announce('Найдите себя, откройте карточку и нажмите «Отметить как меня».');
  });
  $('#whoAmIPromptLater').addEventListener('click', () => {
    const persisted = dismissWhoAmIPrompt(browserStorage(), syntheticFixture ? 'demo' : 'hoti');
    if (whoAmIPrompt?.open) whoAmIPrompt.close();
    if (!persisted) announce('Выбор «Позже» запомнится только до закрытия этой страницы.');
  });
  $('#whoAmIPromptClose').addEventListener('click', () => {
    if (whoAmIPrompt?.open) whoAmIPrompt.close();
  });
  whoAmIPrompt?.addEventListener('click', event => {
    if (event.target === whoAmIPrompt) whoAmIPrompt.close();
  });
  document.addEventListener('visibilitychange', maybePromptWhoAmI);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (ui.app.classList.contains('profile-open')) {
      ui.app.classList.remove('profile-open');
      ui.mobileSelected.focus();
    }
    closePopovers();
  });
  ui.viewport.addEventListener('scroll', scheduleMiniViewportUpdate, { passive: true });
  window.addEventListener('resize', () => {
    const nextMetrics = nodeMetrics();
    if (nextMetrics.width !== lastNodeMetrics?.width || nextMetrics.height !== lastNodeMetrics?.height) {
      drawTree();
      fitTree();
    } else {
      syncCameraLayout();
      centerVisiblePerson();
    }
    scheduleMiniViewportUpdate();
  });
  bindCameraGestures();
}

function initialRailCollapsed() {
  try {
    const preference = localStorage.getItem(railPreferenceKey);
    if (preference === 'open') return false;
    if (preference === 'collapsed') return true;
  } catch {
    // Private browsing or storage restrictions should not block the preview.
  }
  return window.matchMedia('(min-width: 701px)').matches;
}

function setRailCollapsed(collapsed, { persist = false } = {}) {
  ui.profile.parentElement.classList.toggle('rail-hidden', collapsed);
  ui.railToggle.setAttribute('aria-expanded', String(!collapsed));
  ui.railToggle.setAttribute('aria-label', collapsed ? 'Показать панель действий' : 'Скрыть панель действий');
  ui.railToggle.title = collapsed ? 'Показать панель действий' : 'Скрыть панель действий';
  if (!persist) return;
  try {
    localStorage.setItem(railPreferenceKey, collapsed ? 'collapsed' : 'open');
  } catch {
    // The panel remains usable for this session if storage is unavailable.
  }
}

function setMiniMapCollapsed(collapsed) {
  ui.miniMap.classList.toggle('collapsed', collapsed);
  ui.miniMapToggle.setAttribute('aria-expanded', String(!collapsed));
  ui.miniMapToggle.setAttribute('aria-label', `${collapsed ? 'Развернуть' : 'Свернуть'} мини-карту`);
  ui.miniMapToggle.title = `${collapsed ? 'Развернуть' : 'Свернуть'} мини-карту`;
}

function bindCameraGestures() {
  let miniDrag = null;
  ui.miniSvg.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    miniDrag = event.pointerId;
    ui.miniSvg.setPointerCapture(event.pointerId);
    moveFromMiniMap(event.clientX, event.clientY);
    event.preventDefault();
  });
  ui.miniSvg.addEventListener('pointermove', event => {
    if (miniDrag === event.pointerId) moveFromMiniMap(event.clientX, event.clientY);
  });
  const endMiniDrag = event => {
    if (miniDrag !== event.pointerId) return;
    miniDrag = null;
    if (ui.miniSvg.hasPointerCapture(event.pointerId)) ui.miniSvg.releasePointerCapture(event.pointerId);
  };
  ui.miniSvg.addEventListener('pointerup', endMiniDrag);
  ui.miniSvg.addEventListener('pointercancel', endMiniDrag);
  ui.miniSvg.addEventListener('keydown', event => {
    const delta = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      ArrowUp: [0, -1], ArrowDown: [0, 1]
    }[event.key];
    if (!delta) return;
    event.preventDefault();
    ui.viewport.scrollBy({
      left: delta[0] * Math.max(48, ui.viewport.clientWidth * 0.18),
      top: delta[1] * Math.max(48, ui.viewport.clientHeight * 0.18),
      behavior: 'instant'
    });
  });

  const pointers = new Map();
  let pinchStart = null;
  const pinchUpdates = createLatestFrameCoalescer(requestAnimationFrame, update => {
    const origin = update.origin;
    setZoom(
      update.nextZoom,
      update.anchorX,
      update.anchorY,
      origin.anchorX,
      origin.anchorY,
      origin
    );
  });
  const pair = () => {
    const [a, b] = [...pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  };
  const beginPinch = () => {
    if (pointers.size < 2) return;
    const start = pair();
    const bounds = ui.viewport.getBoundingClientRect();
    pinchStart = {
      distance: Math.max(1, start.distance),
      zoom,
      scrollLeft: ui.viewport.scrollLeft,
      scrollTop: ui.viewport.scrollTop,
      anchorX: start.x - bounds.left,
      anchorY: start.y - bounds.top,
      boundsLeft: bounds.left,
      boundsTop: bounds.top,
      dimensions: {
        viewWidth: ui.viewport.clientWidth,
        viewHeight: ui.viewport.clientHeight,
        graphWidth: ui.graph.offsetWidth,
        graphHeight: ui.graph.offsetHeight
      },
      layout: { ...currentCameraLayout }
    };
  };
  ui.viewport.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    suppressPersonClick = null;
    const personNode = event.target.closest('.person-node');
    const captureTarget = personNode || ui.viewport;
    pointers.set(event.pointerId, {
      x: event.clientX, y: event.clientY,
      startX: event.clientX, startY: event.clientY,
      dragging: false,
      personId: personNode?.dataset.personId || null,
      captureTarget
    });
    captureTarget.setPointerCapture(event.pointerId);
    if (pointers.size === 2) beginPinch();
  });
  ui.viewport.addEventListener('pointermove', event => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    if (pointers.size === 1) {
      const distance = Math.hypot(event.clientX - previous.startX, event.clientY - previous.startY);
      if (!previous.dragging && distance >= 5) {
        previous.dragging = true;
        ui.viewport.scrollBy({ left: previous.startX - event.clientX, top: previous.startY - event.clientY, behavior: 'instant' });
      } else if (previous.dragging) {
        ui.viewport.scrollBy({ left: previous.x - event.clientX, top: previous.y - event.clientY, behavior: 'instant' });
      }
      previous.x = event.clientX;
      previous.y = event.clientY;
    } else {
      for (const pointer of pointers.values()) pointer.dragging = true;
      previous.x = event.clientX;
      previous.y = event.clientY;
      const after = pair();
      if (!pinchStart || after.distance <= 0) return;
      pinchUpdates.schedule({
        origin: pinchStart,
        nextZoom: pinchStart.zoom * (after.distance / pinchStart.distance),
        anchorX: after.x - pinchStart.boundsLeft,
        anchorY: after.y - pinchStart.boundsTop
      });
    }
    event.preventDefault();
  });
  const endPan = event => {
    const pointer = pointers.get(event.pointerId);
    if (pointer?.dragging && pointer.personId) {
      suppressPersonClick = pointer.personId;
      window.setTimeout(() => {
        if (suppressPersonClick === pointer.personId) suppressPersonClick = null;
      }, 450);
    }
    const wasPinching = pointers.size >= 2;
    if (wasPinching) pinchUpdates.flush();
    pointers.delete(event.pointerId);
    if (wasPinching && pointers.size >= 2) beginPinch();
    else if (pointers.size < 2) pinchStart = null;
    const captureTarget = pointer?.captureTarget || ui.viewport;
    if (captureTarget.hasPointerCapture(event.pointerId)) captureTarget.releasePointerCapture(event.pointerId);
  };
  ui.viewport.addEventListener('pointerup', endPan);
  ui.viewport.addEventListener('pointercancel', endPan);
  ui.viewport.addEventListener('wheel', event => {
    event.preventDefault();
    const bounds = ui.viewport.getBoundingClientRect();
    setZoom(zoom * wheelZoomFactor(event.deltaY), event.clientX - bounds.left, event.clientY - bounds.top);
  }, { passive: false });
}

function setZoom(
  next,
  anchorX = ui.viewport.clientWidth / 2,
  anchorY = ui.viewport.clientHeight / 2,
  previousAnchorX = anchorX,
  previousAnchorY = anchorY,
  gestureOrigin = null
) {
  const previousZoom = gestureOrigin?.zoom ?? zoom;
  const previousLayout = gestureOrigin?.layout ?? currentCameraLayout;
  const scrollLeft = gestureOrigin?.scrollLeft ?? ui.viewport.scrollLeft;
  const scrollTop = gestureOrigin?.scrollTop ?? ui.viewport.scrollTop;
  const minimumZoom = window.matchMedia('(max-width: 700px)').matches
    ? MIN_MOBILE_ZOOM
    : MIN_DESKTOP_ZOOM;
  zoom = clampZoom(next, { minimum: minimumZoom });
  syncCameraLayout(gestureOrigin?.dimensions ?? null);
  const target = zoomAroundAnchor({
    previousZoom, nextZoom: zoom, scrollLeft, scrollTop, anchorX, anchorY, previousAnchorX, previousAnchorY,
    previousOffsetX: previousLayout.offsetX, previousOffsetY: previousLayout.offsetY,
    nextOffsetX: currentCameraLayout.offsetX, nextOffsetY: currentCameraLayout.offsetY,
    maxScrollLeft: currentCameraLayout.extentWidth - (gestureOrigin?.dimensions?.viewWidth ?? ui.viewport.clientWidth),
    maxScrollTop: currentCameraLayout.extentHeight - (gestureOrigin?.dimensions?.viewHeight ?? ui.viewport.clientHeight)
  });
  ui.viewport.scrollTo({ left: target.left, top: target.top, behavior: 'instant' });
  const zoomLabel = `${Math.round(zoom * 100)}%`;
  const zoomValue = $('#zoomValue');
  if (zoomValue.textContent !== zoomLabel) zoomValue.textContent = zoomLabel;
  scheduleMiniViewportUpdate();
}

function fitTree() {
  if (!ui.nodes.querySelector('.person-node')) return;
  const compactMobileMaster = syntheticFixture && window.matchMedia('(max-width: 700px)').matches;
  setZoom(readableFitZoom(
    ui.viewport.clientWidth, ui.viewport.clientHeight,
    ui.graph.offsetWidth, ui.graph.offsetHeight,
    compactMobileMaster ? { minimumZoom: 0.65 } : undefined
  ));
  const scaledWidth = ui.graph.offsetWidth * zoom;
  const scaledHeight = ui.graph.offsetHeight * zoom;
  if (scaledWidth <= ui.viewport.clientWidth && scaledHeight <= ui.viewport.clientHeight) {
    // If the entire layout fits, center it as a whole.
    ui.viewport.scrollTo({ left: scaledWidth / 2, top: scaledHeight / 2, behavior: 'instant' });
  } else {
    // A large tree stays readable and opens around the selected person.
    centerVisiblePerson();
  }
  scheduleMiniViewportUpdate();
}

function showError(error) {
  const loading = $('#treeLoading');
  if (loading) loading.hidden = true;
  ui.error.hidden = false;
  const title = $('#loadErrorTitle');
  const loginForm = $('#waydeanAdminLoginForm');
  const retryButton = $('#retryTreeLoad');
  const loginRequired = error?.code === 'WAYDEAN_AUTH_REQUIRED';
  const accessDenied = error?.code === 'WAYDEAN_ACCESS_DENIED';
  const accountHint = $('#waydeanAccountHint');
  if (accountHint) {
    accountHint.hidden = true;
    accountHint.textContent = '';
    if (accessDenied) {
      void readWaydeanAdminEmail(window.AdminSupabase).then((email) => {
        if (!email) return;
        accountHint.textContent = `В этой вкладке выполнен вход как ${email}.`;
        accountHint.hidden = false;
      });
    }
  }
  const showLogin = loginRequired || accessDenied;
  if (title) {
    title.textContent = error?.code === 'WAYDEAN_PREVIEW_LOCAL_ONLY'
      ? 'Полное древо доступно на этом компьютере'
      : loginRequired
      ? 'Вход в Waydean'
      : accessDenied ? 'Нет доступа к этому аккаунту' : 'Не удалось загрузить дерево';
  }
  if (loginForm) loginForm.hidden = !showLogin;
  if (retryButton) retryButton.hidden = showLogin;
  if (error?.code === 'WAYDEAN_PREVIEW_LOCAL_ONLY') {
    $('#loadErrorText').textContent = 'Откройте локальную версию проекта на компьютере, где хранятся данные древа.';
  } else if (loginRequired) {
    $('#loadErrorText').textContent = 'Полное дерево откроется после входа в разрешённую администраторскую учётную запись.';
  } else if (accessDenied) {
    $('#loadErrorText').textContent = 'Войдите с учётной записью, которой разрешён просмотр Waydean.';
  } else if (typeof error?.code === 'string' && error.code.startsWith('WAYDEAN_AUTH_')) {
    $('#loadErrorText').textContent = error.message || 'Проверка доступа временно недоступна.';
  } else {
    $('#loadErrorText').textContent = error instanceof TypeError && error.message.includes('fetch')
      ? 'Не удалось загрузить данные древа. Откройте страницу по локальной ссылке проекта.'
      : 'Не удалось загрузить данные древа. Обновите страницу и попробуйте ещё раз.';
  }
  if (retryButton) retryButton.onclick = () => window.location.reload();
  console.error('Waydean read-only preview failed to load.');
}

function bindWaydeanAdminLogin() {
  const form = $('#waydeanAdminLoginForm');
  if (!form || form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';

  const emailInput = $('#waydeanAdminEmail');
  const passwordInput = $('#waydeanAdminPassword');
  const errorMessage = $('#waydeanAdminLoginError');
  const submitButton = $('#waydeanAdminLoginSubmit');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (errorMessage) errorMessage.hidden = true;
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Проверяем вход…';
    }

    try {
      if (!window.AdminSupabase?.isEnabled?.()) throw new Error('Supabase auth is unavailable');
      await window.AdminSupabase.signIn(emailInput.value.trim(), passwordInput.value);
      passwordInput.value = '';
      window.location.reload();
    } catch {
      passwordInput.value = '';
      if (errorMessage) {
        errorMessage.textContent = 'Не удалось войти. Проверьте email и пароль от раздела управления.';
        errorMessage.hidden = false;
      }
      passwordInput.focus();
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Войти и открыть древо';
      }
    }
  });
}

async function initialize() {
  bindWaydeanAdminLogin();
  try {
    const loading = $('#treeLoading');
    const loadingText = $('#treeLoadingText');
    const setLoadingText = (message) => { if (loadingText) loadingText.textContent = message; };
    setRailCollapsed(initialRailCollapsed());
    setMiniMapCollapsed(false);
    const params = new URLSearchParams(location.search);
    const requestedState = params.get('state');
    syntheticFixture = isMasterFixtureQuery(location.search);
    accountPreview = params.get('source') === 'account';
    localTreeDraft = !syntheticFixture && (accountPreview || isLoopbackHost(location.hostname));
    $('#moreHistory').hidden = !localTreeDraft;
    $('#moreBackups').hidden = !localTreeDraft;
    $('#accountBackupGroup').hidden = !accountPreview;
    $('#historyTitle').textContent = accountPreview ? 'История сайта и устройства' : 'История локальных действий';
    $('#historyNote').textContent = accountPreview
      ? 'Журнал сайта синхронизирован с древом. История черновика хранится только в этом браузере.'
      : 'Сохранения черновика и операции с локальными снимками в этом браузере.';
    $('#moreHistory').querySelector('strong').textContent = accountPreview ? 'История сайта и черновика' : 'История локальных действий';
    $('#moreHistory').querySelector('small').textContent = accountPreview
      ? 'Журнал опубликованного древа и локальные правки'
      : 'Сохранения и восстановление в этом браузере';
    $('#moreBackups').querySelector('strong').textContent = accountPreview ? 'Резервные копии' : 'Резервные копии · локально';
    $('#moreBackups').querySelector('small').textContent = accountPreview
      ? 'Снимки сайта и локального черновика'
      : 'Создать снимок, закрепить или восстановить';
    $('#localBackupHeading').textContent = accountPreview ? 'Черновик на этом устройстве' : 'Копии на этом устройстве';
    $('#createLocalBackup').textContent = accountPreview ? 'Создать снимок черновика' : 'Создать снимок сейчас';
    $('#moreVideo').hidden = true;
    if (accountPreview && isLoopbackHost(location.hostname)) {
      throw new Error('Режим аккаунта открывается на сайте. Для локального просмотра выберите обычное древо.');
    }
    if (!canLoadPreviewTree(location.hostname, syntheticFixture) && !accountPreview) {
      window.location.replace(accountPreviewUrl(window.location.href));
      return;
    }
    if (accountPreview) {
      setLoadingText('Проверяем доступ к данным');
      accountAdminAccess = await requireWaydeanAdminAccess('drewo');
    }
    pwaController = createWaydeanPwaController(renderPwaStatus, { allowServerPush: accountPreview });
    renderPwaStatus();
    const initialView = initialPreviewView(requestedState, {
      mobile: window.matchMedia('(max-width: 700px)').matches
    });
    mode = initialView.mode;
    syncModeButtons(mode);
    masterMobileOverview = syntheticFixture
      && window.matchMedia('(max-width: 700px)').matches
      && !params.has('state')
      && !params.has('person');
    document.body.classList.toggle('synthetic-fixture', syntheticFixture);
    document.body.classList.toggle('local-tree-draft', localTreeDraft);
    document.title = 'Waydean — семейное древо';
    const dataUrl = syntheticFixture
      ? '../docs/design/waydean/fixtures/master-tree.json'
      : './family-tree.json';
    setLoadingText('Загружаем данные рода');
    let root;
    if (accountPreview) {
      const serverSnapshot = await callWaydeanAdminAction('waydean-admin-load', {}, accountAdminAccess);
      accountServerTreeJson = serverSnapshot.treeJson;
      accountServerActivityJson = serverSnapshot.activityJson || '[]';
      accountServerFingerprint = serverSnapshot.fingerprint;
      accountTreeLocked = typeof serverSnapshot.locked === 'boolean' ? serverSnapshot.locked : null;
      accountTreeLockReason = typeof serverSnapshot.lockedReason === 'string' ? serverSnapshot.lockedReason : '';
      accountCanToggleLock = serverSnapshot.canToggleLock === true;
      renderAccountAdminTools();
      root = JSON.parse(accountServerTreeJson);
      accountBaseTree = cloneTree(root);
      accountBaseFingerprint = accountServerFingerprint;
      accountBaseActivityJson = accountServerActivityJson;
    } else {
      const response = await fetch(dataUrl, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`Tree data request failed: ${response.status}`);
      root = await response.json();
    }
    setLoadingText('Собираем поколения и связи');
    if (syntheticFixture) {
      sourceFixtureRoot = cloneTree(root);
      originalFixtureRoot = cloneTree(root);
      fixtureRoot = cloneTree(root);
    } else if (localTreeDraft) {
      localDraftKey = new URL('./family-tree.json', location.href).pathname
        + (accountPreview ? '::admin-account' : '');
      sourceFixtureRoot = cloneTree(root);
      let storedDraft = null;
      try {
        storedDraft = await loadLocalTreeDraft(localDraftKey);
      } catch (error) {
        localDraftPersistenceError = error?.message || 'Локальное сохранение пока недоступно.';
      }
      if (accountPreview && storedDraft) {
        const metadata = storedDraft.metadata;
        if (metadata?.accountBaseTreeJson && metadata.accountBaseFingerprint) {
          try {
            const savedBase = JSON.parse(metadata.accountBaseTreeJson);
            flattenTree(savedBase);
            accountBaseTree = cloneTree(savedBase);
            accountBaseFingerprint = String(metadata.accountBaseFingerprint);
            accountBaseActivityJson = String(metadata.accountActivityJson || '[]');
          } catch {
            accountBaseFingerprint = '';
            localDraftPersistenceError = 'Черновик сохранён, но его исходная версия повреждена. Сначала загрузите версию сайта.';
          }
        } else {
          accountBaseFingerprint = '';
          localDraftPersistenceError = 'Найден черновик без версии сайта, от которой он был создан. Загрузите версию сайта перед публикацией.';
        }
        if (accountBaseFingerprint && accountServerFingerprint
          && (accountBaseFingerprint !== accountServerFingerprint
            || !sameJsonSnapshot(accountBaseActivityJson, accountServerActivityJson))) {
          accountPublishConflict = {
            serverFingerprint: accountServerFingerprint,
            serverTreeJson: accountServerTreeJson,
            serverActivityJson: accountServerActivityJson,
          };
          localDraftPersistenceError = 'После сохранения черновика на сайте появилась новая версия. Ваши правки сохранены отдельно; загрузите текущую версию, чтобы продолжить.';
        }
      }
      localDraftRevision = storedDraft?.revision || 0;
      fixtureRoot = cloneTree(accountPreview && storedDraft && !storedDraft.metadata?.accountBaseTreeJson
        ? root
        : storedDraft?.tree || root);
      originalFixtureRoot = cloneTree(fixtureRoot);
      editStatus = accountPublishConflict ? 'conflict' : storedDraft ? 'saved' : 'clean';
      try {
        await restoreLocalPhotoUrls();
      } catch (error) {
        localDraftPersistenceError = error?.message || 'Не удалось прочитать локальные фотографии.';
      }
    }
    records = preparePreviewRecords(syntheticFixture || localTreeDraft ? fixtureRoot : root);
    $('#moreVideo').hidden = !(localTreeDraft || accountPreview);
    fullDataDepth = Math.max(...records.map(person => person.generation));
    byId = new Map(records.map(person => [person.id, person]));
    childrenById = new Map(records.map(person => [person.id, []]));
    for (const person of records) if (person.parentId) childrenById.get(person.parentId)?.push(person);
    loadMyPersonPreference();
    const initial = records.find(person => person.generation === 3) || records[0];
    const requestedPerson = params.get('person');
    const fixturePerson = syntheticFixture ? masterFixtureFocus(window.innerWidth) : null;
    selectedId = mode === 'path' && myPersonId
      ? myPersonId
      : requestedPerson && byId.has(requestedPerson)
      ? requestedPerson
      : fixturePerson && byId.has(fixturePerson) ? fixturePerson : initial.id;
    contextAnchorId = selectedId;
    populateGenerationFilters();
    bindControls();
    syncWhoAmIButton();
    renderProfile();
    const started = performance.now();
    drawTree();
    startHijriYearPulse();
    if (initialView.fit) fitTree();
    else centerPerson(selectedId);
    const renderDuration = performance.now() - started;
    $('#statsNote').dataset.initialRenderMs = renderDuration.toFixed(1);
    $('#miniMapSummary').textContent = `${russianCount(records.length, 'человек', 'человека', 'человек')} · показано ${ui.nodes.querySelectorAll('.person-node').length}`;
    if (requestedState === 'filtersEmpty') { filters.photosOnly = true; $('#photosOnly').checked = true; drawTree(); openPopover(ui.filters); }
    if (requestedState === 'search') { openPopover(ui.search); updateSearch(''); }
    if (requestedState === 'stats') openPopover(ui.stats);
    if (!params.has('person') && !['search', 'stats', 'filtersEmpty'].includes(requestedState)) {
      window.setTimeout(maybePromptWhoAmI, 700);
    }
    window.waydeanPreview = { records, drawTree, selectPerson, get initialRenderMs() { return renderDuration; } };
    scheduleMiniViewportUpdate();
    if (loading) {
      loading.classList.add('is-done');
      window.setTimeout(() => { loading.hidden = true; }, 260);
    }
  } catch (error) {
    showError(error);
  }
}

initialize();
