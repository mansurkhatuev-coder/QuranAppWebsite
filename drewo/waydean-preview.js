import { flattenTree } from './waydean-preview-model.mjs';
import {
  cameraLayout, readableFitZoom, zoomAroundAnchor, createFrameCoalescer,
  miniMapViewport, miniMapScrollTarget, wheelZoomFactor
} from './waydean-preview-camera.mjs?v=6';
import { requireWaydeanAdminAccess } from './waydean-preview-access.mjs?v=admin-auth-1';
import { readWaydeanAdminEmail } from './waydean-admin-identity.mjs?v=1';
import { connectorPaths } from './waydean-preview-lines.mjs';
import { masterFixtureFocus, masterFixtureVisibleRecords } from './waydean-preview-fixture.mjs';
import { includePersonInFilters, fallbackSelectedPersonId } from './waydean-preview-selection.mjs';
import { compactRouteClass, nextLodLevel } from './waydean-preview-lod.mjs?v=lod-6';
import { canLoadPreviewTree, initialPreviewView, isLoopbackHost, isMasterFixtureQuery } from './waydean-preview-route.mjs?v=mobile-fit-1';
import { cloneTree, updatePerson, addChild, reparentPerson, deleteLeaf, isDirty, mockSave } from './waydean-preview-edit.mjs';

const USER_ICON = 'M224 256A128 128 0 1 0 224 0a128 128 0 1 0 0 256zm-45.7 48C79.8 304 0 383.8 0 482.3 0 498.7 13.3 512 29.7 512l388.6 0c16.4 0 29.7-13.3 29.7-29.7C448 383.8 368.2 304 269.7 304l-91.4 0z';
const FIXTURE_PHOTOS = new Map([
  ['demo-01', '../docs/design/waydean/assets/demo/waydean-demo-elder-portrait.jpg'],
  ['demo-03', '../docs/design/waydean/assets/demo/waydean-demo-middle-aged-portrait.jpg']
]);
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const ui = {
  app: $('.app-shell'), mobileSelected: $('#mobileSelected'), mobileSearch: $('#mobileSearchTrigger'),
  railToggle: $('#railToggle'), profileReopen: $('#profileReopen'),
  stage: $('#treeStage'), viewport: $('#graphViewport'), extent: $('#graphExtent'), graph: $('#graph'), nodes: $('#treeNodes'), lines: $('#treeLines'), miniSvg: $('#miniMapSvg'),
  profile: $('#profilePanel'), summary: $('#datasetSummary'), railCount: $('#railCount'), mode: $('#modeLabel'),
  empty: $('#emptyState'), search: $('#searchPopover'), filters: $('#filtersPopover'), stats: $('#statsPopover'),
  more: $('#morePopover'), backdrop: $('#popoverBackdrop'), toast: $('#toast'), error: $('#loadError')
};

let records = [];
let byId = new Map();
let childrenById = new Map();
let selectedId = null;
let contextAnchorId = null;
let mode = 'all';
let zoom = 1;
let filters = { min: 1, max: Infinity, photosOnly: false };
let lastFocus = null;
let toastTimer = 0;
let fullDataDepth = 1;
let syntheticFixture = false;
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
let suppressPersonClick = null;
const scheduleMiniViewportUpdate = createFrameCoalescer(requestAnimationFrame, updateMiniViewport);

function nodeMetrics() {
  const style = getComputedStyle(ui.graph);
  return {
    width: parseFloat(style.getPropertyValue('--tree-card-width')) || 132,
    height: parseFloat(style.getPropertyValue('--tree-card-height')) || 140
  };
}

function syncCameraLayout() {
  const layout = cameraLayout(
    ui.viewport.clientWidth, ui.viewport.clientHeight,
    ui.graph.offsetWidth, ui.graph.offsetHeight, zoom
  );
  currentCameraLayout = layout;
  ui.extent.style.width = `${currentCameraLayout.extentWidth}px`;
  ui.extent.style.height = `${currentCameraLayout.extentHeight}px`;
  ui.graph.style.transform = `translate(${currentCameraLayout.offsetX}px, ${currentCameraLayout.offsetY}px) scale(${zoom})`;
  const renderedCardWidth = (lastNodeMetrics?.width || nodeMetrics().width) * zoom;
  // Keep overview marks readable in screen pixels while the graph itself scales.
  ui.graph.style.setProperty('--overview-dot-size', `${Math.min(30, Math.max(8, 7 / zoom))}px`);
  ui.graph.style.setProperty('--overview-line-width', `${Math.min(4.5, Math.max(1.6, 1.1 / zoom))}px`);
  const isMobile = window.matchMedia('(max-width: 700px)').matches;
  const preserveMobileMasterCards = syntheticFixture && masterMobileOverview && isMobile;
  const preserveMobileHomeCards = !syntheticFixture && mode === 'all' && ui.nodes.childElementCount <= 9
    && isMobile && zoom >= 0.88;
  const nextLevel = preserveMobileMasterCards || preserveMobileHomeCards
    ? 'detail'
    : nextLodLevel(lodLevel, renderedCardWidth);
  lodLevel = nextLevel;
  ui.graph.dataset.lod = lodLevel;
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
  ui.mode.textContent = overviewCaption || modeCaption;
  ui.mode.classList.toggle('visible', Boolean(ui.mode.textContent));
}

function preparePreviewRecords(root) {
  return flattenTree(root).map(person => ({
    ...person,
    name: String(person.name ?? '').replace(/1/g, 'I')
  }));
}

function photoSource(person) {
  if (syntheticFixture && FIXTURE_PHOTOS.has(person.id)) return FIXTURE_PHOTOS.get(person.id);
  return person.hasPhoto ? `photos/${encodeURIComponent(person.id)}-thumb.jpg` : null;
}

function hasDisplayPhoto(person) {
  return Boolean(photoSource(person));
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
  $('#showFullTree').hidden = mode === 'all-tree' && !hasActiveFilters;
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
  const siblingGap = compactMobileMaster ? 16 : 24;
  function measure(person) {
    const kids = visibleChildren.get(person.id) || [];
    const childWidth = kids.reduce((sum, child, index) => sum + measure(child) + (index ? siblingGap : 0), 0);
    const width = metrics.width;
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
    const cardWidth = metrics.width;
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
    card.className = `person-node${person.id === selectedId ? ' selected' : ''}${compactRouteClass(person.id, labelRoute)}${related && !related.has(person.id) ? ' dimmed' : ''}`;
    card.dataset.personId = person.id;
    card.setAttribute('aria-label', `${person.name}, ${formatYears(person)}, поколение ${person.generation}`);
    card.title = `${person.name} · ${formatYears(person)}`;
    card.style.left = `${point.centerX}px`;
    card.style.top = `${point.centerY}px`;
    card.style.width = `${point.cardWidth}px`;
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
      ['Ветвь', branchAnchor ? `Линия ${branchAnchor.name}` : 'Основная линия']
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
    body.append(facts, branch);
    if (syntheticFixture) body.append(buildEditControls(person));
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
    if (syntheticFixture) body.append(buildRelationshipControls(person));
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
  title.textContent = 'Редактировать демо-запись'; section.append(title);
  const form = document.createElement('form'); form.className = 'mock-edit-form';
  addField(form, 'Имя', 'name', person.name);
  addField(form, 'Год рождения', 'born', person.born, 'text');
  addField(form, 'Год смерти', 'died', person.died, 'text');
  addField(form, 'Биография', 'bio', person.bio || '');
  const failureLabel = document.createElement('label'); failureLabel.className = 'mock-edit-failure';
  const failure = document.createElement('input'); failure.type = 'checkbox'; failure.checked = nextSaveFails;
  failure.dataset.profileFocus = 'action:simulate-error';
  failure.addEventListener('change', () => { nextSaveFails = failure.checked; });
  failureLabel.append(failure, document.createTextNode('Имитировать ошибку следующего сохранения')); form.append(failureLabel);
  const actions = document.createElement('div'); actions.className = 'mock-edit-actions';
  const save = document.createElement('button'); save.type = 'submit'; save.textContent = editStatus === 'saving' ? 'Сохраняется…' : 'Сохранить в памяти'; save.disabled = editStatus === 'saving';
  save.dataset.profileFocus = 'action:save';
  const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Повторить'; retry.hidden = editStatus !== 'error'; retry.dataset.profileFocus = 'action:retry'; retry.addEventListener('click', () => { nextSaveFails = false; submitMockSave(); });
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Отменить черновик'; cancel.dataset.profileFocus = 'action:cancel'; cancel.addEventListener('click', cancelDraft);
  const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = 'Сбросить фикстуру'; reset.dataset.profileFocus = 'action:reset'; reset.addEventListener('click', resetFixture);
  actions.append(save, retry, cancel, reset); form.append(actions);
  const status = document.createElement('p'); status.className = `mock-edit-status status-${editStatus}`; status.setAttribute('aria-live', 'polite'); status.dataset.profileFocus = 'action-status'; status.tabIndex = -1;
  const messages = { clean: 'Нет несохранённых изменений.', dirty: 'Есть несохранённые изменения.', saving: 'Сохранение имитируется…', saved: 'Изменения сохранены только в памяти текущей страницы.', error: 'Ошибка сохранения. Черновик сохранён; можно повторить.' };
  status.textContent = messages[editStatus];
  form.addEventListener('input', () => {
    rawDraftDirty = true;
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      updatePerson(fixtureRoot, person.id, values);
      rawDraftDirty = false;
      editStatus = isDirty(originalFixtureRoot, fixtureRoot) ? 'dirty' : 'clean';
      status.textContent = messages[editStatus]; status.className = `mock-edit-status status-${editStatus}`;
    } catch (error) { rawDraftDirty = true; status.textContent = error.message; status.className = 'mock-edit-status status-error'; }
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    try { updatePerson(fixtureRoot, person.id, Object.fromEntries(new FormData(form).entries())); }
    catch (error) { status.textContent = error.message; return; }
    editStatus = 'dirty'; submitMockSave();
  });
  section.append(form, status); return section;
}

function buildRelationshipControls(person) {
  const section = document.createElement('section'); section.className = 'mock-editor';
  const title = document.createElement('strong'); title.textContent = 'Связи синтетического дерева'; section.append(title);
  const addForm = document.createElement('form'); addForm.className = 'mock-edit-form';
  addField(addForm, 'ID нового человека', 'id'); addField(addForm, 'Имя ребёнка', 'name'); addField(addForm, 'Год рождения', 'born', '', 'text');
  const addButton = document.createElement('button'); addButton.type = 'submit'; addButton.textContent = 'Проверить ребёнка'; addButton.dataset.profileFocus = 'action:preview-child'; addForm.append(addButton);
  const addPreview = document.createElement('p'); addPreview.className = 'mock-edit-status'; addPreview.setAttribute('role', 'status'); addPreview.setAttribute('aria-live', 'polite'); addPreview.setAttribute('aria-atomic', 'true'); addPreview.dataset.profileFocus = 'preview-status'; addPreview.tabIndex = -1; addForm.append(addPreview);
  const addConfirm = document.createElement('button'); addConfirm.type = 'button'; addConfirm.textContent = 'Подтвердить добавление'; addConfirm.hidden = true; addConfirm.dataset.profileFocus = 'action:confirm-child'; addForm.append(addConfirm);
  let proposedChild = null;
  addForm.addEventListener('input', () => { proposedChild = null; addConfirm.hidden = true; addPreview.textContent = ''; });
  addForm.addEventListener('submit', event => {
    event.preventDefault();
    try {
      proposedChild = Object.fromEntries(new FormData(addForm).entries());
      const previewTree = cloneTree(fixtureRoot); addChild(previewTree, person.id, proposedChild);
      addPreview.textContent = `Предпросмотр: «${proposedChild.name}» будет добавлен ребёнком к «${person.name}».`;
      addConfirm.hidden = false;
    } catch (error) { proposedChild = null; addConfirm.hidden = true; addPreview.textContent = error.message; }
  });
  addConfirm.addEventListener('click', () => {
    if (!proposedChild) return;
    try { addChild(fixtureRoot, person.id, proposedChild); proposedChild = null; markRelationshipDirty(); }
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
      const candidate = cloneTree(fixtureRoot);
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
    try { reparentPerson(fixtureRoot, proposed.personId, proposed.parentId); markRelationshipDirty(); }
    catch (error) { preview.textContent = error.message; }
  });
  section.append(moveForm);
  const deleteForm = document.createElement('form'); deleteForm.className = 'mock-edit-form';
  const target = addSelect('deleteId', 'Листовой человек для удаления', 'Листового человека для удаления'); deleteForm.append(target);
  const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Удалить листового человека';
  remove.dataset.profileFocus = 'action:delete';
  remove.addEventListener('click', () => {
    if (!target.value) { announce('Сначала выберите человека.'); return; }
    if (!window.confirm('Удалить выбранного листового человека из синтетического черновика?')) return;
    try { deleteLeaf(fixtureRoot, target.value); markRelationshipDirty(); }
    catch (error) { announce(error.message); }
  });
  deleteForm.append(remove); section.append(deleteForm);
  const save = document.createElement('button'); save.type = 'button'; save.textContent = 'Сохранить изменения в памяти'; save.dataset.profileFocus = 'action:save'; save.addEventListener('click', submitMockSave);
  const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Повторить сохранение'; retry.hidden = editStatus !== 'error'; retry.dataset.profileFocus = 'action:retry'; retry.addEventListener('click', () => { nextSaveFails = false; submitMockSave(); });
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Отменить черновик'; cancel.dataset.profileFocus = 'action:cancel'; cancel.addEventListener('click', cancelDraft);
  const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = 'Сбросить фикстуру'; reset.dataset.profileFocus = 'action:reset'; reset.addEventListener('click', resetFixture);
  const status = document.createElement('p'); status.className = `mock-edit-status status-${editStatus}`; status.setAttribute('aria-live', 'polite'); status.dataset.profileFocus = 'action-status'; status.tabIndex = -1;
  status.textContent = editStatus === 'error' ? 'Ошибка сохранения; изменения остались в черновике.' : editStatus === 'saved' ? 'Сохранено только в памяти этой страницы.' : editStatus === 'saving' ? 'Сохранение имитируется…' : editStatus === 'dirty' ? 'Есть несохранённые изменения.' : 'Нет несохранённых изменений.';
  section.append(save, retry, cancel, reset, status); return section;
}

function markRelationshipDirty() {
  editStatus = 'dirty'; refreshEditableModel(); renderProfile('relatives');
  announce('Черновик изменён. Сохраните его через вкладку «Информация».');
}

function refreshEditableModel() {
  records = preparePreviewRecords(fixtureRoot);
  byId = new Map(records.map(person => [person.id, person]));
  if (!byId.has(selectedId) && records.length) selectedId = records[0].id;
  childrenById = new Map(records.map(person => [person.id, []]));
  for (const item of records) if (item.parentId) childrenById.get(item.parentId)?.push(item);
  fullDataDepth = Math.max(...records.map(person => person.generation));
  drawTree(); updateStats();
}

async function submitMockSave() {
  if (!syntheticFixture || !fixtureRoot || editStatus === 'saving') return;
  editStatus = 'saving'; renderProfile(currentProfileTab);
  const fail = nextSaveFails; nextSaveFails = false;
  try {
    await mockSave({ shouldFail: fail });
    originalFixtureRoot = cloneTree(fixtureRoot); editStatus = 'saved'; rawDraftDirty = false; refreshEditableModel(); renderProfile(currentProfileTab);
  } catch { editStatus = 'error'; renderProfile(currentProfileTab); }
}

function cancelDraft() {
  if (!syntheticFixture) return;
  if ((rawDraftDirty || isDirty(originalFixtureRoot, fixtureRoot)) && !window.confirm('Отменить изменения и вернуть последнюю имитацию сохранения?')) return;
  fixtureRoot = cloneTree(originalFixtureRoot); editStatus = 'clean'; rawDraftDirty = false; refreshEditableModel(); renderProfile(currentProfileTab);
}

function resetFixture() {
  if (!syntheticFixture) return;
  if ((rawDraftDirty || isDirty(originalFixtureRoot, fixtureRoot)) && !window.confirm('Сбросить синтетический черновик к исходной фикстуре?')) return;
  fixtureRoot = cloneTree(sourceFixtureRoot); originalFixtureRoot = cloneTree(sourceFixtureRoot); editStatus = 'clean'; rawDraftDirty = false;
  refreshEditableModel(); renderProfile(currentProfileTab);
}

window.addEventListener('beforeunload', event => {
  if (syntheticFixture && fixtureRoot && (rawDraftDirty || isDirty(originalFixtureRoot, fixtureRoot))) { event.preventDefault(); event.returnValue = ''; }
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
  if (!preserveContext) contextAnchorId = id;
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
  if (zoom < 0.9) setZoom(0.9);
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
    handoff.personId = selectedId;
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
  if (next === 'all-tree') resetGenerationFilters();
  mode = next;
  contextAnchorId = selectedId;
  ui.app.classList.remove('profile-open');
  closePopovers();
  syncModeButtons(next);
  drawTree();
  fitTree();
  const labels = { path: 'Подсвечен путь от старшего известного предка.', branch: 'Показана выбранная ветвь.', all: 'Показаны ближайшие три поколения.', 'all-tree': 'Всё дерево доступно. Мини-карта поможет перейти к другим ветвям.' };
  if (announceMode) announce(labels[next] || labels.all);
}

function updateSearch(value) {
  const q = value.trim().replace(/1/g, 'I').toLocaleLowerCase('ru');
  const found = records.filter(person => `${person.name} ${person.born ?? ''} ${person.died ?? ''}`.toLocaleLowerCase('ru').includes(q));
  const list = $('#searchResults');
  list.replaceChildren();
  if (!found.length) {
    const empty = document.createElement('p'); empty.className = 'empty-search'; empty.textContent = q ? `По запросу «${value}» никого не найдено.` : 'Введи имя или год.'; list.append(empty); return;
  }
  const shown = found.slice(0, 35);
  for (const person of shown) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'search-result';
    button.append(createAvatar(person, 'search-avatar'));
    const copy = document.createElement('span'); copy.className = 'result-copy';
    const name = document.createElement('strong'); name.textContent = person.name;
    const meta = document.createElement('small'); meta.textContent = `${formatYears(person)} · поколение ${person.generation}`;
    copy.append(name, meta); button.append(copy);
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
  ui.railToggle.addEventListener('click', () => {
    const hidden = ui.profile.parentElement.classList.toggle('rail-hidden');
    ui.railToggle.setAttribute('aria-expanded', String(!hidden));
    ui.railToggle.setAttribute('aria-label', hidden ? 'Показать панель действий' : 'Скрыть панель действий');
    ui.railToggle.title = hidden ? 'Показать панель действий' : 'Скрыть панель действий';
    requestAnimationFrame(() => {
      syncCameraLayout();
      centerVisiblePerson();
    });
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
  $('#openCurrentTree').addEventListener('click', () => window.location.assign('./index.html'));
  $('#shareOpen').addEventListener('click', shareLocalPreview);
  $('#printOpen').addEventListener('click', openPrintStudio);
  $('#moreExport').addEventListener('click', openPrintStudio);
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
    selectedId = fallbackSelectedPersonId(selectedId, currentRecords());
    closePopovers();
    if (selectedId !== previousSelectedId) renderProfile();
    drawTree(); fitTree();
    if (selectedId !== previousSelectedId) announce('Выбранный человек скрыт фильтром. Выбрана первая карточка в результатах.');
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
    openPopover(ui.search);
    $('#searchInput').focus({ preventScroll: true });
  });
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
  const pair = () => {
    const [a, b] = [...pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
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
      const before = pair();
      for (const pointer of pointers.values()) pointer.dragging = true;
      previous.x = event.clientX;
      previous.y = event.clientY;
      const after = pair();
      ui.viewport.scrollBy({ left: before.x - after.x, top: before.y - after.y, behavior: 'instant' });
      if (before.distance > 0 && after.distance > 0) {
        const bounds = ui.viewport.getBoundingClientRect();
        setZoom(zoom * after.distance / before.distance, after.x - bounds.left, after.y - bounds.top);
      }
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
    pointers.delete(event.pointerId);
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

function setZoom(next, anchorX = ui.viewport.clientWidth / 2, anchorY = ui.viewport.clientHeight / 2) {
  const previousZoom = zoom;
  const previousLayout = currentCameraLayout;
  const scrollLeft = ui.viewport.scrollLeft;
  const scrollTop = ui.viewport.scrollTop;
  zoom = Math.round(Math.max(0.25, Math.min(2.4, next)) * 1000) / 1000;
  syncCameraLayout();
  const target = zoomAroundAnchor({
    previousZoom, nextZoom: zoom, scrollLeft, scrollTop, anchorX, anchorY,
    previousOffsetX: previousLayout.offsetX, previousOffsetY: previousLayout.offsetY,
    nextOffsetX: currentCameraLayout.offsetX, nextOffsetY: currentCameraLayout.offsetY,
    maxScrollLeft: currentCameraLayout.extentWidth - ui.viewport.clientWidth,
    maxScrollTop: currentCameraLayout.extentHeight - ui.viewport.clientHeight
  });
  ui.viewport.scrollTo({ left: target.left, top: target.top, behavior: 'instant' });
  $('#zoomValue').textContent = `${Math.round(zoom * 100)}%`;
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
  centerVisiblePerson();
}

function showError(error) {
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
    const params = new URLSearchParams(location.search);
    const requestedState = params.get('state');
    syntheticFixture = isMasterFixtureQuery(location.search);
    const accountPreview = params.get('source') === 'account';
    if (accountPreview && isLoopbackHost(location.hostname)) {
      throw new Error('Режим аккаунта открывается на сайте. Для локального просмотра выберите обычное древо.');
    }
    if (!canLoadPreviewTree(location.hostname, syntheticFixture) && !accountPreview) {
      const error = new Error('The real-tree preview is restricted to loopback hosts.');
      error.code = 'WAYDEAN_PREVIEW_LOCAL_ONLY';
      throw error;
    }
    if (accountPreview) await requireWaydeanAdminAccess('drewo');
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
    document.title = 'Waydean — семейное древо';
    const dataUrl = syntheticFixture
      ? '../docs/design/waydean/fixtures/master-tree.json'
      : './family-tree.json';
    const response = await fetch(dataUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Tree data request failed: ${response.status}`);
    const root = await response.json();
    if (syntheticFixture) {
      sourceFixtureRoot = cloneTree(root);
      originalFixtureRoot = cloneTree(root);
      fixtureRoot = cloneTree(root);
    }
    records = preparePreviewRecords(syntheticFixture ? fixtureRoot : root);
    fullDataDepth = Math.max(...records.map(person => person.generation));
    byId = new Map(records.map(person => [person.id, person]));
    childrenById = new Map(records.map(person => [person.id, []]));
    for (const person of records) if (person.parentId) childrenById.get(person.parentId)?.push(person);
    const initial = records.find(person => person.generation === 3) || records[0];
    const requestedPerson = params.get('person');
    const fixturePerson = syntheticFixture ? masterFixtureFocus(window.innerWidth) : null;
    selectedId = requestedPerson && byId.has(requestedPerson)
      ? requestedPerson
      : fixturePerson && byId.has(fixturePerson) ? fixturePerson : initial.id;
    contextAnchorId = selectedId;
    populateGenerationFilters();
    bindControls();
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
    window.waydeanPreview = { records, drawTree, selectPerson, get initialRenderMs() { return renderDuration; } };
    scheduleMiniViewportUpdate();
  } catch (error) {
    showError(error);
  }
}

initialize();
