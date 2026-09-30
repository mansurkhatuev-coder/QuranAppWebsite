import { flattenTree } from './waydean-preview-model.mjs';
import {
  cameraLayout, readableFitZoom, zoomAroundAnchor,
  miniMapViewport, miniMapScrollTarget, wheelZoomFactor
} from './waydean-preview-camera.mjs?v=2';
import { connectorPaths } from './waydean-preview-lines.mjs';

const USER_ICON = 'M224 256A128 128 0 1 0 224 0a128 128 0 1 0 0 256zm-45.7 48C79.8 304 0 383.8 0 482.3 0 498.7 13.3 512 29.7 512l388.6 0c16.4 0 29.7-13.3 29.7-29.7C448 383.8 368.2 304 269.7 304l-91.4 0z';
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const ui = {
  app: $('.app-shell'), mobileSelected: $('#mobileSelected'), mobileSearch: $('#mobileSearchTrigger'),
  stage: $('#treeStage'), viewport: $('#graphViewport'), extent: $('#graphExtent'), graph: $('#graph'), nodes: $('#treeNodes'), lines: $('#treeLines'), miniSvg: $('#miniMapSvg'),
  profile: $('#profilePanel'), summary: $('#datasetSummary'), railCount: $('#railCount'), mode: $('#modeLabel'),
  empty: $('#emptyState'), search: $('#searchPopover'), filters: $('#filtersPopover'), stats: $('#statsPopover'),
  more: $('#morePopover'), backdrop: $('#popoverBackdrop'), toast: $('#toast'), error: $('#loadError')
};

let records = [];
let byId = new Map();
let childrenById = new Map();
let selectedId = null;
let mode = 'all';
let zoom = 1;
let filters = { min: 1, max: Infinity, photosOnly: false };
let lastFocus = null;
let toastTimer = 0;
let fullDataDepth = 1;
let currentCameraLayout = null;
let lastNodeMetrics = null;

function nodeMetrics() {
  const style = getComputedStyle(ui.graph);
  return {
    width: parseFloat(style.getPropertyValue('--tree-card-width')) || 132,
    height: parseFloat(style.getPropertyValue('--tree-card-height')) || 140
  };
}

function syncCameraLayout() {
  currentCameraLayout = cameraLayout(
    ui.viewport.clientWidth, ui.viewport.clientHeight,
    ui.graph.offsetWidth, ui.graph.offsetHeight, zoom
  );
  ui.extent.style.width = `${currentCameraLayout.extentWidth}px`;
  ui.extent.style.height = `${currentCameraLayout.extentHeight}px`;
  ui.graph.style.transform = `translate(${currentCameraLayout.offsetX}px, ${currentCameraLayout.offsetY}px) scale(${zoom})`;
  ui.graph.dataset.lod = zoom < 0.45 ? 'overview' : zoom < 0.7 ? 'compact' : 'full';
}

function formatYears(person) {
  if (person.born == null && person.died == null) return 'Даты неизвестны';
  if (person.born == null) return `до ${person.died}`;
  if (person.died == null) return `с ${person.born}`;
  return `${person.born}–${person.died}`;
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
    candidates = collectContext(ancestorContextRoot(selectedId), 2);
  } else if (mode === 'path') {
    candidates = ancestors(selectedId).reverse().map(id => byId.get(id));
  } else {
    const branchIds = new Set([...ancestors(selectedId), ...descendants(selectedId)]);
    candidates = records.filter(person => branchIds.has(person.id));
  }
  return candidates.filter(person => person.generation >= filters.min && person.generation <= filters.max && (!filters.photosOnly || person.hasPhoto));
}

function createAvatar(person, className = 'avatar') {
  const wrapper = document.createElement('span');
  wrapper.className = `${className} ${person.hasPhoto ? 'has-photo' : 'is-empty'}`;
  wrapper.setAttribute('aria-hidden', 'true');
  if (person.hasPhoto) {
    const image = document.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.src = `photos/${encodeURIComponent(person.id)}-thumb.jpg`;
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
  const metrics = nodeMetrics();
  lastNodeMetrics = metrics;
  ui.nodes.replaceChildren();
  ui.lines.replaceChildren();
  const matches = new Set(visible.map(person => person.id));
  const selected = byId.get(selectedId);
  ui.empty.hidden = visible.length > 0;
  ui.lines.hidden = visible.length === 0;
  ui.summary.textContent = `${records.length} человек · ${fullDataDepth} поколений · локальные данные`;
  ui.railCount.textContent = String(records.length);
  $('#emptyReset').textContent = filters.photosOnly ? 'Сбросить фильтры' : 'Показать все поколения';

  if (!visible.length || !selected) {
    ui.graph.style.width = '1000px';
    ui.graph.style.height = '760px';
    syncCameraLayout();
    ui.miniSvg.replaceChildren();
    ui.mode.textContent = '';
    ui.mode.classList.remove('visible');
    $('#miniMapSummary').textContent = `${records.length} людей · фильтр: 0`;
    updateStats();
    return;
  }

  const widthById = new Map();
  const visibleChildren = new Map();
  for (const person of visible) visibleChildren.set(person.id, (childrenById.get(person.id) || []).filter(child => matches.has(child.id)));
  const siblingGap = 24;
  function measure(person) {
    const kids = visibleChildren.get(person.id) || [];
    const childWidth = kids.reduce((sum, child, index) => sum + measure(child) + (index ? siblingGap : 0), 0);
    const width = metrics.width;
    const total = kids.length ? Math.max(width, childWidth) : width;
    widthById.set(person.id, total);
    return total;
  }
  const roots = filteredRootNodes(visible);
  const gap = 36;
  const rootWidth = roots.reduce((sum, root, index) => sum + measure(root) + (index ? gap : 0), 0);
  const maxGeneration = Math.max(...visible.map(person => person.generation));
  const graphWidth = Math.max(1000, rootWidth + 100);
  const graphHeight = Math.max(700, (maxGeneration - Math.min(...visible.map(person => person.generation)) + 1) * 190 + 140);
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
    const centerY = 90 + depth * 190;
    positions.set(person.id, { centerX, centerY, cardWidth });
    const kids = visibleChildren.get(person.id) || [];
    const childrenTotal = kids.reduce((sum, child, index) => sum + widthById.get(child.id) + (index ? siblingGap : 0), 0);
    let childLeft = left + (subtreeWidth - childrenTotal) / 2;
    for (const child of kids) {
      place(child, childLeft, child.generation);
      childLeft += widthById.get(child.id) + siblingGap;
    }
  }
  let rootLeft = Math.max(50, (graphWidth - rootWidth) / 2);
  for (const root of roots) {
    place(root, rootLeft, root.generation);
    rootLeft += widthById.get(root.id) + gap;
  }

  const related = mode === 'path'
    ? new Set(ancestors(selectedId))
    : mode === 'branch'
      ? new Set([...ancestors(selectedId), ...descendants(selectedId)])
      : null;
  const lineParts = connectorPaths(positions, visibleChildren, related, metrics.height).map(line => {
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
    card.className = `person-node${person.id === selectedId ? ' selected' : ''}${related && !related.has(person.id) ? ' dimmed' : ''}`;
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
    const dates = document.createElement('small');
    dates.textContent = formatYears(person);
    copy.append(name, dates);
    card.append(copy);
    card.addEventListener('click', () => selectPerson(person.id));
    ui.nodes.append(card);
  }

  ui.mode.textContent = mode === 'path' ? 'МОЙ ПУТЬ' : mode === 'branch' ? 'МОЯ ВЕТВЬ' : mode === 'all-tree' ? 'ВСЕ ПОКОЛЕНИЯ' : '';
  ui.mode.classList.toggle('visible', Boolean(ui.mode.textContent));
  const sourceRoot = ancestorContextRoot(selectedId);
  $('#miniMapSummary').textContent = `${records.length} людей · показано ${visible.length}`;
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
  const person = byId.get(selectedId);
  if (!person) return;
  ui.mobileSelected.replaceChildren();
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
  for (const [id, label] of [['info','Информация'], ['relatives',`Родственники ${children.length + Number(Boolean(parent))}`], ['media',`Медиа ${person.hasPhoto ? 1 : 0}`]]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.profileTab = id;
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
    const note = document.createElement('p');
    note.className = 'profile-note';
    note.textContent = 'Профиль заполнен сведениями из локальной версии дерева. Изменение или сохранение недоступно.';
    const branch = document.createElement('button');
    branch.type = 'button'; branch.className = 'branch-button'; branch.textContent = 'Показать ветвь　›';
    branch.addEventListener('click', () => setMode('branch'));
    body.append(facts, note, branch);
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
  } else {
    const media = document.createElement('div'); media.className = 'media-state';
    if (person.hasPhoto) {
      media.append(createAvatar(person, 'media-avatar'));
      const caption = document.createElement('span'); caption.textContent = 'Фотография загружается только из локальной папки drewo/photos.'; media.append(caption);
    } else {
      media.append(createAvatar(person, 'media-avatar'));
      const title = document.createElement('strong'); title.textContent = 'Нет фотографий';
      const caption = document.createElement('span'); caption.textContent = 'Для отсутствующего фото показан нейтральный силуэт без лица.';
      media.append(title, caption);
    }
    body.append(media);
  }
  const close = document.createElement('button');
  close.type = 'button'; close.className = 'profile-close'; close.setAttribute('aria-label','Свернуть профиль'); close.textContent = '×';
  close.addEventListener('click', () => {
    if (window.matchMedia('(max-width: 700px)').matches) {
      ui.app.classList.remove('profile-open');
      ui.mobileSelected.focus();
    } else {
      const collapsed = ui.profile.classList.toggle('collapsed');
      ui.profile.parentElement.classList.toggle('profile-collapsed', collapsed);
      close.setAttribute('aria-label', collapsed ? 'Развернуть профиль' : 'Свернуть профиль');
      close.textContent = collapsed ? '›' : '×';
      syncCameraLayout();
      centerVisiblePerson();
    }
  });
  ui.profile.replaceChildren(close, summary, tabs, body);
}

function centerPerson(id) {
  const card = ui.nodes.querySelector('[data-person-id="' + CSS.escape(id) + '"]');
  if (!card) return;
  ui.viewport.scrollTo({
    left: Math.max(0, currentCameraLayout.offsetX + parseFloat(card.style.left) * zoom - ui.viewport.clientWidth / 2),
    top: Math.max(0, currentCameraLayout.offsetY + parseFloat(card.style.top) * zoom - ui.viewport.clientHeight / 2),
    behavior: 'instant'
  });
}

function centerVisiblePerson() {
  const selected = ui.nodes.querySelector('[data-person-id="' + CSS.escape(selectedId) + '"]');
  const target = selected || ui.nodes.querySelector('.person-node');
  if (target) centerPerson(target.dataset.personId);
}

function selectPerson(id) {
  if (!byId.has(id)) return;
  selectedId = id;
  mode = 'all';
  ui.app.classList.remove('profile-open');
  ui.profile.classList.remove('collapsed');
  ui.profile.parentElement.classList.remove('profile-collapsed');
  closePopovers();
  drawTree();
  renderProfile();
  if (zoom < 0.9) setZoom(0.9);
  centerPerson(id);
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

function setMode(next, announceMode = true) {
  mode = next;
  ui.app.classList.remove('profile-open');
  closePopovers();
  drawTree();
  fitTree();
  const labels = { path: 'Подсвечен путь от старшего известного предка.', branch: 'Показана выбранная ветвь.', all: 'Показаны ближайшие три поколения.', 'all-tree': 'Всё дерево доступно. Мини-карта поможет перейти к другим ветвям.' };
  if (announceMode) announce(labels[next] || labels.all);
}

function updateSearch(value) {
  const q = value.trim().toLocaleLowerCase('ru');
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
  const photos = records.filter(person => person.hasPhoto).length;
  $('#statsGrid').replaceChildren();
  for (const [value, label] of [[records.length,'человек'],[generations,'поколений'],[branches,'линии первого уровня'],[photos,'фото в локальном наборе']]) {
    const card = document.createElement('div'); card.className = 'stat-card';
    const number = document.createElement('strong'); number.textContent = String(value);
    const caption = document.createElement('small'); caption.textContent = label;
    card.append(number, caption); $('#statsGrid').append(card);
  }
  $('#statsNote').textContent = `В кадре сейчас ${ui.nodes.querySelectorAll('.person-node').length} человек. Все показатели получены из локального JSON.`;
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
  updateMiniViewport();
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
  ui.mobileSelected.addEventListener('click', () => {
    ui.profile.classList.remove('collapsed');
    ui.profile.parentElement.classList.remove('profile-collapsed');
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
  $$('.popover [data-close]').forEach(button => button.addEventListener('click', closePopovers));
  ui.backdrop.addEventListener('click', closePopovers);
  $$('.nav-item[data-mode],.more-item[data-mode],.rail-action[data-mode],.mobile-nav [data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
  $$('.nav-item[data-nav],.mobile-nav [data-nav]').forEach(button => button.addEventListener('click', () => {
    $$('.nav-item[data-nav],.mobile-nav [data-nav]').forEach(item => item.classList.toggle('active', item.dataset.nav === button.dataset.nav));
    if (button.dataset.nav === 'tree') setMode('all');
    if (button.dataset.nav === 'people') openPopover(ui.search);
  }));
  $('#applyFilters').addEventListener('click', () => {
    filters = { min: Number($('#minGeneration').value), max: Number($('#maxGeneration').value), photosOnly: $('#photosOnly').checked };
    closePopovers(); drawTree(); fitTree();
    if (ui.nodes.children.length && !ui.nodes.querySelector('[data-person-id="' + CSS.escape(selectedId) + '"]')) {
      announce('Выбранный человек скрыт фильтром. Камера перешла к первому результату.');
    }
  });
  $('#resetFilters').addEventListener('click', () => {
    filters = { min: 1, max: fullDataDepth, photosOnly: false };
    $('#minGeneration').value = '1'; $('#maxGeneration').value = String(fullDataDepth); $('#photosOnly').checked = false;
    closePopovers(); drawTree(); fitTree();
  });
  $('#emptyReset').addEventListener('click', () => $('#resetFilters').click());
  $('#zoomIn').addEventListener('click', () => setZoom(zoom + 0.1));
  $('#zoomOut').addEventListener('click', () => setZoom(zoom - 0.1));
  $('#fitTree').addEventListener('click', fitTree);
  $('#whoAmI').addEventListener('click', () => announce('Локальный просмотр не использует вход в семейный аккаунт.'));
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (ui.app.classList.contains('profile-open')) {
      ui.app.classList.remove('profile-open');
      ui.mobileSelected.focus();
    }
    closePopovers();
  });
  ui.viewport.addEventListener('scroll', updateMiniViewport, { passive: true });
  window.addEventListener('resize', () => {
    const nextMetrics = nodeMetrics();
    if (nextMetrics.width !== lastNodeMetrics?.width || nextMetrics.height !== lastNodeMetrics?.height) {
      drawTree();
      fitTree();
    } else {
      syncCameraLayout();
      centerVisiblePerson();
    }
    updateMiniViewport();
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
    if (event.button !== 0 || event.target.closest('.person-node')) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    ui.viewport.setPointerCapture(event.pointerId);
  });
  ui.viewport.addEventListener('pointermove', event => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    if (pointers.size === 1) {
      ui.viewport.scrollBy({ left: previous.x - event.clientX, top: previous.y - event.clientY, behavior: 'instant' });
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    } else {
      const before = pair();
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
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
    pointers.delete(event.pointerId);
    if (ui.viewport.hasPointerCapture(event.pointerId)) ui.viewport.releasePointerCapture(event.pointerId);
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
  zoom = Math.round(Math.max(0.25, Math.min(1.6, next)) * 1000) / 1000;
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
  updateMiniViewport();
}

function fitTree() {
  if (!ui.nodes.querySelector('.person-node')) return;
  setZoom(readableFitZoom(ui.viewport.clientWidth, ui.viewport.clientHeight, ui.graph.offsetWidth, ui.graph.offsetHeight));
  centerVisiblePerson();
}

function showError(error) {
  ui.error.hidden = false;
  $('#loadErrorText').textContent = error instanceof TypeError && error.message.includes('fetch')
    ? 'Открой preview через локальный static server, чтобы браузер разрешил прочитать family-tree.json.'
    : 'Проверь локальный family-tree.json и обнови страницу.';
  console.error('Waydean read-only preview failed to load.');
}

async function initialize() {
  try {
    const response = await fetch('./family-tree.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Tree data request failed: ${response.status}`);
    const root = await response.json();
    records = flattenTree(root);
    fullDataDepth = Math.max(...records.map(person => person.generation));
    byId = new Map(records.map(person => [person.id, person]));
    childrenById = new Map(records.map(person => [person.id, []]));
    for (const person of records) if (person.parentId) childrenById.get(person.parentId)?.push(person);
    const initial = records.find(person => person.generation === 3) || records[0];
    selectedId = new URLSearchParams(location.search).get('person') && byId.has(new URLSearchParams(location.search).get('person'))
      ? new URLSearchParams(location.search).get('person')
      : initial.id;
    populateGenerationFilters();
    bindControls();
    renderProfile();
    const started = performance.now();
    drawTree();
    centerPerson(selectedId);
    const renderDuration = performance.now() - started;
    $('#statsNote').dataset.initialRenderMs = renderDuration.toFixed(1);
    $('#miniMapSummary').textContent = `${records.length} людей · показано ${ui.nodes.querySelectorAll('.person-node').length}`;
    const requestedState = new URLSearchParams(location.search).get('state');
    if (requestedState === 'path') setMode('path', false);
    if (requestedState === 'branch') setMode('branch', false);
    if (requestedState === 'all-tree') setMode('all-tree', false);
    if (requestedState === 'filtersEmpty') { filters.photosOnly = true; $('#photosOnly').checked = true; drawTree(); openPopover(ui.filters); }
    if (requestedState === 'search') { openPopover(ui.search); updateSearch(''); }
    if (requestedState === 'stats') openPopover(ui.stats);
    window.waydeanPreview = { records, drawTree, selectPerson, get initialRenderMs() { return renderDuration; } };
    requestAnimationFrame(updateMiniViewport);
  } catch (error) {
    showError(error);
  }
}

initialize();
