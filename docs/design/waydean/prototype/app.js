(() => {
  "use strict";

  const USER_PATH = "M224 256A128 128 0 1 0 224 0a128 128 0 1 0 0 256zm-45.7 48C79.8 304 0 383.8 0 482.3 0 498.7 13.3 512 29.7 512l388.6 0c16.4 0 29.7-13.3 29.7-29.7C448 383.8 368.2 304 269.7 304l-91.4 0z";
  const people = [
    { id: "p01", name: "Исхак", born: 1740, died: 1810, gender: "male", generation: 1, parent: null, branch: "main", hasPhoto: false, place: "Чечня", note: "Старший известный предок в этой демонстрационной линии." },
    { id: "p02", name: "Якуб", born: 1770, died: 1841, gender: "male", generation: 2, parent: "p01", branch: "west", hasPhoto: false, place: "Чечня" },
    { id: "p03", name: "Муса", born: 1776, died: 1848, gender: "male", generation: 2, parent: "p01", branch: "main", hasPhoto: false, place: "Чечня" },
    { id: "p04", name: "Иса", born: 1780, died: 1858, gender: "male", generation: 2, parent: "p01", branch: "east", hasPhoto: false, place: "Чечня" },
    { id: "p05", name: "Ахмад", born: 1802, died: 1874, gender: "male", generation: 3, parent: "p02", branch: "west", hasPhoto: false, place: "Чечня" },
    { id: "p06", name: "Магомед", born: 1825, died: 1890, gender: "male", generation: 3, parent: "p03", branch: "main", hasPhoto: false, place: "Чечня", note: "Демонстрационная запись. Биографические сведения не относятся к реальному человеку." },
    { id: "p07", name: "Умар", born: 1830, died: 1895, gender: "male", generation: 3, parent: "p04", branch: "east", hasPhoto: false, place: "Чечня" },
    { id: "p08", name: "Зайнап", born: null, died: 1901, gender: "female", generation: 3, parent: "p03", branch: "main", hasPhoto: false, place: "Чечня" },
    { id: "p09", name: "Магомед", born: 1851, died: 1924, gender: "male", generation: 4, parent: "p06", branch: "main", hasPhoto: false, place: "Чечня" },
    { id: "p10", name: "Амина", born: 1855, died: 1932, gender: "female", generation: 4, parent: "p06", branch: "main", hasPhoto: false, place: "Чечня" },
    { id: "p11", name: "Абдул-Хамид Арбиевич Хатуев", born: 1884, died: null, gender: "male", generation: 5, parent: "p09", branch: "main", hasPhoto: false, place: "Чечня" },
    { id: "p12", name: "Салман", born: 1810, died: 1882, gender: "male", generation: 3, parent: "p02", branch: "west", hasPhoto: false, place: "Чечня" }
  ];

  const byId = new Map(people.map(person => [person.id, person]));
  const visibleRows = {
    root: ["p01"],
    children: ["p02", "p03", "p04"],
    grandchildren: ["p05", "p06", "p07"]
  };
  let selectedId = "p06";
  let mode = "all";
  let searchTab = "all";
  let filters = { minGeneration: 1, maxGeneration: 5, minYear: 1600, maxYear: 2026, gender: "all", photosOnly: false, mainOnly: false };
  let query = "";
  let toastTimer;
  let returnFocus = null;
  const motionPreview = new URLSearchParams(location.search).get("motion") === "1";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let motionSequence = 0;
  let activeMotion = [];

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const sheetBackdrop = $("#sheetBackdrop");
  const sheetTitle = $("#sheetTitle");
  const sheetSubtitle = $("#sheetSubtitle");
  const sheetContent = $("#sheetContent");
  const selectedPerson = () => byId.get(selectedId);

  function avatarMarkup(extraClass = "") {
    return `<span class="avatar ${extraClass}" aria-hidden="true"><svg viewBox="0 0 448 512" focusable="false"><path d="${USER_PATH}"/></svg></span>`;
  }

  function years(person) {
    if (person.born == null && person.died == null) return "Даты неизвестны";
    if (person.born == null) return `до ${person.died}`;
    if (person.died == null) return `с ${person.born}`;
    return `${person.born}–${person.died}`;
  }

  function renderNode(personId, rowName) {
    const person = byId.get(personId);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "person-node";
    button.dataset.personId = person.id;
    button.setAttribute("aria-label", `${person.name}, ${years(person)}, поколение ${person.generation}`);
    button.innerHTML = `${avatarMarkup()}<span class="person-name" title="${person.name}">${person.name}</span><span class="person-years">${years(person)}</span>`;
    button.addEventListener("click", () => selectPerson(person.id));
    if (person.id === selectedId) button.classList.add("selected");
    if (rowName === "root") return [document.createElement("span"), button, document.createElement("span")];
    return [button];
  }

  function renderTree() {
    const rows = [
      ["root", "#rowRoot"],
      ["children", "#rowChildren"],
      ["grandchildren", "#rowGrandchildren"]
    ];
    const filtered = getFilteredPeople();
    const filteredIds = new Set(filtered.map(person => person.id));
    const visibleIds = new Set(Object.values(visibleRows).flat());
    const visibleMatches = [...visibleIds].some(id => filteredIds.has(id));

    rows.forEach(([key, selector]) => {
      const row = $(selector);
      row.replaceChildren(...visibleRows[key].flatMap(id => {
        if (!filteredIds.has(id)) return [document.createElement("span")];
        return renderNode(id, key);
      }));
    });

    const related = mode === "path" ? new Set(ancestorPath(selectedId)) : mode === "branch" ? branchPeople(selectedId) : null;
    $$(".person-node").forEach(node => {
      const id = node.dataset.personId;
      node.classList.toggle("selected", id === selectedId);
      node.classList.toggle("is-dimmed", Boolean(related && !related.has(id)));
    });
    $("#treeLines").classList.toggle("lines-dimmed", Boolean(related));
    $$(".branch-line").forEach(line => {
      const [parentId, childId] = line.dataset.edge.split("-");
      line.classList.toggle("is-hidden", !(filteredIds.has(parentId) && filteredIds.has(childId)));
      line.classList.toggle("is-active", Boolean(related && related.has(parentId) && related.has(childId)));
    });
    const stageEmpty = $("#stageEmpty");
    stageEmpty.hidden = filtered.length > 0 && visibleMatches;
    stageEmpty.querySelector("strong").textContent = filtered.length === 0 ? "В этой выборке никого нет" : "Люди есть вне текущего кадра";
    stageEmpty.querySelector("span").textContent = filtered.length === 0 ? "Измени или сбрось фильтры, чтобы вернуть людей на древо." : "Сбрось ограничение поколений, чтобы увидеть людей в текущем кадре.";
    stageEmpty.querySelector("button").textContent = filtered.length === 0 ? "Сбросить фильтры" : "Показать поколения 1–3";
    $$(".tree-row").forEach(row => row.classList.toggle("is-hidden", filtered.length === 0));
    $("#stageMode").textContent = mode === "path" ? "МОЙ ПУТЬ" : mode === "branch" ? "МОЯ ВЕТВЬ" : "";
    $("#selectedName").textContent = selectedPerson().name;
    $("#selectedMeta").textContent = `${years(selectedPerson())} · поколение ${selectedPerson().generation}`;
    $("#selectedPerson .avatar").innerHTML = `<svg viewBox="0 0 448 512" focusable="false"><path d="${USER_PATH}"/></svg>`;
  }

  function cancelMotionSequence() {
    motionSequence += 1;
    activeMotion.forEach(animation => animation.cancel());
    activeMotion = [];
    $("#treeCamera").classList.remove("camera-moving");
    $("#treeCamera").classList.toggle("camera-focused", mode === "path");
    $$(".branch-line").forEach(line => {
      line.style.strokeDasharray = "";
      line.style.strokeDashoffset = "";
      line.classList.remove("is-tracing");
    });
    $$(".person-node").forEach(node => node.classList.remove("path-origin", "path-destination"));
  }

  async function playPathReveal() {
    const sequence = motionSequence;
    const camera = $("#treeCamera");
    const route = [...ancestorPath(selectedId)].reverse();
    const edges = route.slice(1).map((childId, index) => `${route[index]}-${childId}`);
    const nodes = new Map($$(".person-node").map(node => [node.dataset.personId, node]));
    nodes.get(route[0])?.classList.add("path-origin");
    nodes.get(selectedId)?.classList.add("path-destination");

    if (reducedMotion.matches || edges.length === 0) {
      camera.classList.add("camera-focused");
      return;
    }

    const cameraAnimation = camera.animate(
      [
        { transform: "translateY(0) scale(1)", offset: 0 },
        { transform: "translateY(58px) scale(1.08)", offset: 0.18 },
        { transform: "translateY(-24px) scale(1.045)", offset: 1 }
      ],
      { duration: 1500, easing: "cubic-bezier(.22,.72,.24,1)", fill: "forwards" }
    );
    camera.classList.add("camera-moving");
    activeMotion.push(cameraAnimation);

    for (const [index, edge] of edges.entries()) {
      if (sequence !== motionSequence) return;
      const line = $(`[data-edge="${edge}"]`);
      if (!line || line.classList.contains("is-hidden")) continue;
      const length = line.getTotalLength();
      line.style.strokeDasharray = `${length}`;
      line.style.strokeDashoffset = `${length}`;
      line.classList.add("is-tracing");
      const lineAnimation = line.animate(
        [{ strokeDashoffset: length }, { strokeDashoffset: 0 }],
        { duration: 460, delay: index === 0 ? 140 : 0, easing: "ease-out", fill: "forwards" }
      );
      activeMotion.push(lineAnimation);
      try {
        await lineAnimation.finished;
      } catch {
        return;
      }
      if (sequence !== motionSequence) return;
      line.style.strokeDashoffset = "0";
      line.classList.remove("is-tracing");
    }

    try {
      await cameraAnimation.finished;
    } catch {
      return;
    }
    if (sequence !== motionSequence) return;
    camera.classList.remove("camera-moving");
    camera.classList.add("camera-focused");
    cameraAnimation.cancel();
    activeMotion = [];
  }

  function getFilteredPeople() {
    return people.filter(person => {
      const startYear = person.born ?? person.died ?? filters.minYear;
      const endYear = person.died ?? person.born ?? filters.maxYear;
      return person.generation >= filters.minGeneration && person.generation <= filters.maxGeneration && startYear <= filters.maxYear && endYear >= filters.minYear && (filters.gender === "all" || person.gender === filters.gender) && (!filters.photosOnly || person.hasPhoto) && (!filters.mainOnly || person.branch === "main");
    });
  }

  function ancestorPath(personId) {
    const result = new Set();
    let current = byId.get(personId);
    while (current) {
      result.add(current.id);
      current = current.parent ? byId.get(current.parent) : null;
    }
    return result;
  }

  function branchPeople(personId) {
    const ancestors = ancestorPath(personId);
    const descendants = new Set([personId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const person of people) {
        if (person.parent && descendants.has(person.parent) && !descendants.has(person.id)) {
          descendants.add(person.id);
          changed = true;
        }
      }
    }
    return new Set([...ancestors, ...descendants]);
  }

  function selectPerson(personId) {
    if (!byId.has(personId)) return;
    cancelMotionSequence();
    selectedId = personId;
    renderTree();
    setActiveNavigation("tree");
    announce(`${selectedPerson().name} выбран`);
  }

  function setActiveNavigation(name) {
    $$(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.nav === name));
  }

  function openSheet(type, options = {}) {
    cancelMotionSequence();
    returnFocus = document.activeElement;
    sheetContent.innerHTML = "";
    sheetBackdrop.hidden = false;
    document.body.classList.add("sheet-open");
    const titles = {
      search: ["Поиск человека", "По имени, годам жизни или ветви"],
      profile: [selectedPerson().name, `Поколение ${selectedPerson().generation} · ${years(selectedPerson())}`],
      menu: ["Ещё", "Навигация по древу и действия"],
      modes: ["Режим древа", "Выбери, какую часть рода показать"],
      filters: ["Фильтры", "Ограничь людей, видимых на древе"],
      stats: ["Статистика древа", "Рассчитана по 12 вымышленным записям"],
      people: ["Люди", "Демонстрационный список"],
      relatives: ["Родственники", "Связанные записи в тестовом наборе"]
    };
    [sheetTitle.textContent, sheetSubtitle.textContent] = titles[type] || titles.menu;
    if (type === "search") renderSearchSheet(options.initialQuery ?? query);
    if (type === "profile") renderProfileSheet();
    if (type === "menu") renderMenuSheet();
    if (type === "modes") renderModesSheet();
    if (type === "filters") renderFilterSheet();
    if (type === "stats") renderStatsSheet();
    if (type === "people" || type === "relatives") renderPeopleSheet(type);
    const focusable = sheetContent.querySelector("input,button,select");
    if (focusable) requestAnimationFrame(() => focusable.focus());
  }

  function closeSheet() {
    sheetBackdrop.hidden = true;
    document.body.classList.remove("sheet-open");
    if (returnFocus && returnFocus.isConnected) returnFocus.focus();
  }

  function resultMarkup(person) {
    return `<button type="button" class="person-result" data-result-id="${person.id}">${avatarMarkup()}<span class="person-result-copy"><strong>${person.name}</strong><small>${years(person)} · Поколение ${person.generation} · ${person.branch === "main" ? "Основная линия" : "Ветвь"}</small></span><span class="chevron" aria-hidden="true">›</span></button>`;
  }

  function renderSearchSheet(initial = "") {
    searchTab = "all";
    sheetContent.innerHTML = `<label class="sr-only" for="searchInput">Поиск по людям</label><input id="searchInput" class="search-input" type="search" autocomplete="off" placeholder="Имя или часть имени" value="${escapeHtml(initial)}"><div class="search-tabs"><button class="search-tab active" type="button" data-search-tab="all">Все <span>${people.length}</span></button><button class="search-tab" type="button" data-search-tab="people">Люди <span>${people.length}</span></button><button class="search-tab" type="button" data-search-tab="branches">Ветви <span>3</span></button></div><div class="result-list" id="resultList"></div>`;
    const input = $("#searchInput");
    input.addEventListener("input", () => {
      query = input.value;
      renderSearchResults(query);
    });
    sheetContent.onclick = event => {
      const tab = event.target.closest("[data-search-tab]");
      if (tab) {
        searchTab = tab.dataset.searchTab;
        sheetContent.querySelectorAll("[data-search-tab]").forEach(item => item.classList.toggle("active", item === tab));
        renderSearchResults(input.value);
        return;
      }
      const branch = event.target.closest("[data-branch-id]");
      if (branch) {
        closeSheet();
        setMode("branch");
        return;
      }
      onResultClick(event);
    };
    renderSearchResults(initial);
  }

  function renderSearchResults(value) {
    const normalized = value.trim().toLocaleLowerCase("ru");
    const branchNames = { main: "Основная линия", west: "Западная ветвь", east: "Восточная ветвь" };
    const matches = searchTab === "branches"
      ? Object.entries(branchNames).filter(([id,name]) => !normalized || `${name} ${id}`.toLocaleLowerCase("ru").includes(normalized))
      : normalized ? people.filter(person => `${person.name} ${person.born ?? ""} ${person.died ?? ""} ${person.branch}`.toLocaleLowerCase("ru").includes(normalized)) : people.slice(0, 5);
    const list = $("#resultList");
    if (!list) return;
    list.innerHTML = matches.length
      ? searchTab === "branches"
        ? matches.map(([id,name]) => `<button type="button" class="person-result" data-branch-id="${id}"><span class="branch-search-icon">♧</span><span class="person-result-copy"><strong>${name}</strong><small>${people.filter(person => person.branch === id).length} человека в тестовом наборе</small></span><span class="chevron" aria-hidden="true">›</span></button>`).join("")
        : matches.map(resultMarkup).join("")
      : `<p class="empty-copy">По запросу «${escapeHtml(value)}» ничего не найдено.<br>Проверь написание или очисти поиск.</p>`;
  }

  function onResultClick(event) {
    const button = event.target.closest("[data-result-id]");
    if (!button) return;
    selectPerson(button.dataset.resultId);
    closeSheet();
  }

  function renderProfileSheet() {
    const person = selectedPerson();
    const parent = person.parent ? byId.get(person.parent)?.name : "Не указан";
    const children = people.filter(item => item.parent === person.id).length;
    sheetContent.innerHTML = `<div class="profile-hero"><div class="profile-summary">${avatarMarkup()}<div><strong>${person.name}</strong><small>${years(person)}</small></div></div></div><div class="profile-tabs"><span class="tab-active">Информация</span><button type="button" data-profile-tab="relatives">Родственники</button><button type="button" data-profile-tab="media">Медиа</button></div><dl class="fact-list"><div class="fact-row"><dt>Поколение</dt><dd>${person.generation}</dd></div><div class="fact-row"><dt>Отец</dt><dd>${parent}</dd></div><div class="fact-row"><dt>Дети</dt><dd>${children} ${children === 1 ? "человек" : "человек"}</dd></div><div class="fact-row"><dt>Ветвь</dt><dd>${person.branch === "main" ? "Основная линия" : "Родственная ветвь"}</dd></div><div class="fact-row"><dt>Место</dt><dd>${person.place}</dd></div></dl><p class="profile-note">${person.note || "В prototype показаны только поля, необходимые для проверки композиции."}</p><button type="button" class="primary-action full-action" id="showBranch">Показать ветвь <span>›</span></button>`;
    $("#showBranch").addEventListener("click", () => {
      closeSheet();
      setMode("branch");
    });
    sheetContent.querySelectorAll("[data-profile-tab]").forEach(tab => tab.addEventListener("click", () => {
      if (tab.dataset.profileTab === "relatives") openSheet("relatives");
      else announce("В вымышленном наборе нет фотографий и медиа.");
    }));
  }

  function renderPeopleSheet(type) {
    const list = type === "relatives" ? people.filter(person => person.id !== selectedId && (person.parent === selectedId || person.id === selectedPerson().parent)) : people;
    sheetContent.innerHTML = `<div class="people-list">${list.length ? list.map(resultMarkup).join("") : `<p class="empty-copy">Для этой демонстрационной записи родственники не заданы.</p>`}</div>`;
    sheetContent.onclick = onResultClick;
  }

  function renderMenuSheet() {
    sheetContent.innerHTML = `<div class="mode-list"><button class="mode-action" type="button" data-mode="path"><span class="mode-icon">⌖</span><span><strong>Мой путь</strong><small>Линия от старшего известного предка</small></span></button><button class="mode-action" type="button" data-mode="branch"><span class="mode-icon">♧</span><span><strong>Моя ветвь</strong><small>Фокус на выбранном человеке и родных</small></span></button><button class="mode-action" type="button" data-mode="all"><span class="mode-icon">⌘</span><span><strong>Все поколения</strong><small>Вернуться к полному дереву</small></span></button><button class="mode-action" type="button" data-open="filters"><span class="mode-icon">⚑</span><span><strong>Фильтры</strong><small>Поколения, фото и основная линия</small></span></button></div><div class="menu-divider"></div><div class="action-list"><button class="menu-action" type="button" data-open="stats"><span class="menu-icon">◉</span><span class="menu-copy"><strong>Статистика древа</strong><small>Сводка по демонстрационным данным</small></span></button><button class="menu-action" type="button" disabled><span class="menu-icon">↗</span><span class="menu-copy"><strong>Поделиться</strong><small>Не подключено в локальном макете</small></span></button><button class="menu-action" type="button" disabled><span class="menu-icon">▤</span><span class="menu-copy"><strong>Печать</strong><small>Отдельный этап разработки</small></span></button><button class="menu-action" type="button" disabled><span class="menu-icon">▷</span><span class="menu-copy"><strong>Создать видео</strong><small>Отдельный этап разработки</small></span></button></div>`;
    sheetContent.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => {
      closeSheet();
      setMode(button.dataset.mode);
    }));
    sheetContent.querySelectorAll("[data-open]").forEach(button => button.addEventListener("click", () => openSheet(button.dataset.open)));
  }

  function renderModesSheet() {
    renderMenuSheet();
    sheetTitle.textContent = "Режим древа";
    sheetSubtitle.textContent = "Выбери, какую часть рода показать";
    sheetContent.querySelectorAll("[data-mode]").forEach(button => button.classList.toggle("active", button.dataset.mode === mode));
    sheetContent.querySelector(".action-list")?.remove();
  }

  function renderFilterSheet() {
    sheetContent.innerHTML = `<div class="filter-grid"><label class="filter-field">Поколение от<select id="minGeneration">${[1,2,3,4,5].map(value => `<option ${filters.minGeneration === value ? "selected" : ""}>${value}</option>`).join("")}</select></label><label class="filter-field">Поколение до<select id="maxGeneration">${[1,2,3,4,5].map(value => `<option ${filters.maxGeneration === value ? "selected" : ""}>${value}</option>`).join("")}</select></label><label class="filter-field">Год от<input id="minYear" type="number" value="${filters.minYear}"></label><label class="filter-field">Год до<input id="maxYear" type="number" value="${filters.maxYear}"></label><label class="filter-field">Пол<select id="gender"><option value="all" ${filters.gender === "all" ? "selected" : ""}>Любой</option><option value="male" ${filters.gender === "male" ? "selected" : ""}>Мужчины</option><option value="female" ${filters.gender === "female" ? "selected" : ""}>Женщины</option></select></label></div><label class="toggle-row"><span>Показывать только с фото</span><input id="photosOnly" type="checkbox" ${filters.photosOnly ? "checked" : ""}></label><label class="toggle-row"><span>Только основная линия</span><input id="mainOnly" type="checkbox" ${filters.mainOnly ? "checked" : ""}></label><div class="sheet-actions"><button type="button" class="primary-action" id="applyFilters">Применить фильтры</button><button type="button" class="secondary-action" id="resetFilters">Сбросить</button></div>`;
    $("#applyFilters").addEventListener("click", () => {
      filters = { minGeneration: Number($("#minGeneration").value), maxGeneration: Number($("#maxGeneration").value), minYear: Number($("#minYear").value) || 0, maxYear: Number($("#maxYear").value) || 9999, gender: $("#gender").value, photosOnly: $("#photosOnly").checked, mainOnly: $("#mainOnly").checked };
      closeSheet();
      renderTree();
      announce(`Фильтры применены. Найдено людей: ${getFilteredPeople().length}.`);
    });
    $("#resetFilters").addEventListener("click", () => {
      filters = { minGeneration: 1, maxGeneration: 5, minYear: 1600, maxYear: 2026, gender: "all", photosOnly: false, mainOnly: false };
      closeSheet();
      renderTree();
      announce("Фильтры сброшены.");
    });
  }

  function renderStatsSheet() {
    const generations = Math.max(...people.map(person => person.generation));
    const branches = new Set(people.map(person => person.branch)).size;
    const perGeneration = Array.from({ length: generations }, (_, index) => people.filter(person => person.generation === index + 1).length);
    const maxCount = Math.max(...perGeneration, 1);
    sheetContent.innerHTML = `<div class="stats-grid"><div class="stat-card"><span class="stat-icon">♙</span><span><strong>${people.length}</strong><small>человек</small></span></div><div class="stat-card"><span class="stat-icon">♧</span><span><strong>${generations}</strong><small>поколений</small></span></div><div class="stat-card"><span class="stat-icon">⌘</span><span><strong>${branches}</strong><small>ветви</small></span></div><div class="stat-card"><span class="stat-icon">▧</span><span><strong>${people.filter(person => person.hasPhoto).length}</strong><small>фотографий</small></span></div></div><p class="chart-title">Распределение по поколениям</p><div class="chart">${perGeneration.map((count,index) => `<div class="bar-wrap"><span class="bar" style="height:${Math.max(3, count / maxCount * 68)}px"></span><small>${index + 1}</small></div>`).join("")}</div><p class="prototype-note">Показатели рассчитаны из 12 фиктивных записей. В настоящем интерфейсе при активных фильтрах нужно обозначать область подсчёта.</p>`;
  }

  function setMode(nextMode) {
    cancelMotionSequence();
    mode = nextMode;
    if (nextMode === "path" && motionPreview) $("#treeCamera").classList.remove("camera-focused");
    if (nextMode !== "path") $("#treeCamera").classList.remove("camera-focused");
    renderTree();
    if (nextMode === "path" && motionPreview) playPathReveal();
    if (nextMode === "all") announce("Показаны все поколения.");
    else if (nextMode === "path") announce("Подсвечен путь от старшего известного предка.");
    else announce("Выбран фокус на ветви этого человека.");
  }

  function announce(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
  }

  function setPerson(personId) {
    if (!byId.has(personId)) return;
    selectedId = personId;
    renderTree();
  }

  $("#searchLaunch").addEventListener("click", event => openSheet("search", { initialQuery: query }));
  $("#selectedPerson").addEventListener("click", () => openSheet("profile"));
  $("#closeSheet").addEventListener("click", closeSheet);
  sheetBackdrop.addEventListener("click", event => { if (event.target === sheetBackdrop) closeSheet(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !sheetBackdrop.hidden) closeSheet(); });
  $("#emptyReset").addEventListener("click", () => {
    if (getFilteredPeople().length) {
      filters.minGeneration = 1;
      filters.maxGeneration = 3;
    } else {
      filters = { minGeneration: 1, maxGeneration: 5, minYear: 1600, maxYear: 2026, gender: "all", photosOnly: false, mainOnly: false };
    }
    renderTree();
    announce(getFilteredPeople().length ? "Показаны поколения 1–3." : "Все фильтры сброшены.");
  });
  $("#miniMap").addEventListener("click", () => announce("Мини-карта показывает весь тестовый набор."));
  $("#zoomIn").addEventListener("click", () => announce("Масштаб увеличен в макете."));
  $("#zoomOut").addEventListener("click", () => announce("Масштаб уменьшен в макете."));
  $("#whoAmI").addEventListener("click", () => { selectPerson("p06"); announce("В этом наборе «я» назначен Магомедом."); });

  $$(".nav-item").forEach(button => button.addEventListener("click", () => {
    const nav = button.dataset.nav;
    setActiveNavigation(nav);
    if (nav === "tree") { cancelMotionSequence(); mode = "all"; $("#treeCamera").classList.remove("camera-focused"); renderTree(); }
    if (nav === "people") openSheet("people");
    if (nav === "branches") openSheet("modes");
    if (nav === "stats") openSheet("stats");
    if (nav === "more") openSheet("menu");
  }));

  function bootstrapState() {
    const state = new URLSearchParams(location.search).get("state") || "tree";
    const states = {
      profile: () => openSheet("profile"),
      search: () => openSheet("search", { initialQuery: "Магомед" }),
      searchEmpty: () => openSheet("search", { initialQuery: "ИмяБезСовпадений" }),
      menu: () => openSheet("menu"),
      modes: () => openSheet("modes"),
      filters: () => openSheet("filters"),
      filtersEmpty: () => { filters.photosOnly = true; renderTree(); },
      stats: () => openSheet("stats"),
      people: () => openSheet("people"),
      path: () => setMode("path"),
      branch: () => setMode("branch"),
      longName: () => { setPerson("p11"); openSheet("profile"); }
    };
    states[state]?.();
    return state;
  }

  if (motionPreview) document.body.classList.add("motion-preview");
  reducedMotion.addEventListener("change", event => {
    if (event.matches) cancelMotionSequence();
  });

  renderTree();
  window.waydeanPrototype = { people, setPerson, openSheet, closeSheet, setMode, renderTree, bootstrapState };
  window.prototypeState = bootstrapState();
})();
