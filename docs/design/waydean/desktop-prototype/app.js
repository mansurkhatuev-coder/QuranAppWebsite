(() => {
  "use strict";
  const USER_PATH = "M224 256A128 128 0 1 0 224 0a128 128 0 1 0 0 256zm-45.7 48C79.8 304 0 383.8 0 482.3 0 498.7 13.3 512 29.7 512l388.6 0c16.4 0 29.7-13.3 29.7-29.7C448 383.8 368.2 304 269.7 304l-91.4 0z";
  const people = [
    { id: "p01", name: "Исхак", born: 1740, died: 1810, generation: 1, parent: null, branch: "main", gender: "male", place: "Чечня" },
    { id: "p02", name: "Якуб", born: 1770, died: 1841, generation: 2, parent: "p01", branch: "west", gender: "male", place: "Чечня" },
    { id: "p03", name: "Муса", born: 1776, died: 1848, generation: 2, parent: "p01", branch: "main", gender: "male", place: "Чечня" },
    { id: "p04", name: "Иса", born: 1780, died: 1858, generation: 2, parent: "p01", branch: "east", gender: "male", place: "Чечня" },
    { id: "p05", name: "Ахмад", born: 1802, died: 1874, generation: 3, parent: "p02", branch: "west", gender: "male", place: "Чечня" },
    { id: "p06", name: "Магомед", born: 1825, died: 1890, generation: 3, parent: "p03", branch: "main", gender: "male", place: "Чечня", note: "Демонстрационная запись; биографические сведения не относятся к реальному человеку." },
    { id: "p07", name: "Умар", born: 1830, died: 1895, generation: 3, parent: "p04", branch: "east", gender: "male", place: "Чечня" },
    { id: "p08", name: "Зайнап", born: null, died: 1901, generation: 3, parent: "p03", branch: "main", gender: "female", place: "Чечня" },
    { id: "p09", name: "Магомед", born: 1851, died: 1924, generation: 4, parent: "p06", branch: "main", gender: "male", place: "Чечня" },
    { id: "p10", name: "Амина", born: 1855, died: 1932, generation: 4, parent: "p06", branch: "main", gender: "female", place: "Чечня" },
    { id: "p11", name: "Абдул-Хамид Арбиевич Хатуев", born: 1884, died: null, generation: 5, parent: "p09", branch: "main", gender: "male", place: "Чечня" },
    { id: "p12", name: "Салман", born: 1810, died: 1882, generation: 3, parent: "p02", branch: "west", gender: "male", place: "Чечня" }
  ];
  const byId = new Map(people.map(person => [person.id, person]));
  const positions = { p01:[500,72],p02:[250,238],p03:[500,238],p04:[750,238],p05:[130,414],p06:[315,414],p07:[500,414],p08:[685,414],p12:[870,414],p09:[410,592],p10:[590,592],p11:[500,720] };
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const state = new URLSearchParams(location.search).get("state") || "tree";
  const dense = state === "dense";
  const baseIds = new Set(["p01","p02","p03","p04","p05","p06","p07"]);
  let selectedId = "p06";
  let mode = "all";
  let zoom = 100;
  let filters = { min:1,max:5,photos:false,main:false };
  let toastTimer;
  const yearText = person => person.born == null && person.died == null ? "Даты неизвестны" : person.born == null ? `до ${person.died}` : person.died == null ? `с ${person.born}` : `${person.born}–${person.died}`;
  const icon = () => `<svg viewBox="0 0 448 512" aria-hidden="true"><path d="${USER_PATH}"/></svg>`;
  const filtered = () => people.filter(person => person.generation >= filters.min && person.generation <= filters.max && (!filters.photos || false) && (!filters.main || person.branch === "main"));
  const visiblePeople = () => (dense ? people : people.filter(person => baseIds.has(person.id))).filter(person => filtered().some(match => match.id === person.id));

  function ancestors(id) {
    const result = new Set(); let current = byId.get(id);
    while (current) { result.add(current.id); current = current.parent ? byId.get(current.parent) : null; }
    return result;
  }
  function descendants(id) {
    const result = new Set([id]); let changed = true;
    while (changed) { changed = false; for (const person of people) if (person.parent && result.has(person.parent) && !result.has(person.id)) { result.add(person.id); changed = true; } }
    return result;
  }
  function relationSet() { return mode === "path" ? ancestors(selectedId) : mode === "branch" ? new Set([...ancestors(selectedId), ...descendants(selectedId)]) : null; }
  function drawTree() {
    const visible = visiblePeople(); const ids = new Set(visible.map(person => person.id)); const related = relationSet();
    const lines = visible.filter(person => person.parent && ids.has(person.parent)).map(person => {
      const [px,py] = positions[person.parent], [cx,cy] = positions[person.id], bend = Math.round((py+cy)/2);
      const active = related && related.has(person.parent) && related.has(person.id);
      return `<path class="tree-line ${active ? "active" : ""}" d="M${px} ${py+58} V${bend} H${cx} V${cy-59}"/>`;
    }).join("");
    $("#treeLines").innerHTML = lines;
    $("#nodes").innerHTML = visible.map(person => {
      const [x,y] = positions[person.id]; const relatedClass = related && !related.has(person.id) ? "dimmed" : "";
      return `<button class="person-node ${person.id === selectedId ? "selected" : ""} ${relatedClass} ${state === "focus" && person.id === "p07" ? "keyboard-focus" : ""}" data-person="${person.id}" aria-label="${person.name}, ${yearText(person)}, поколение ${person.generation}" style="left:${x/10}%;top:${y/8.1}%">${icon()}<strong title="${person.name}">${person.name}</strong><small>${yearText(person)}</small></button>`;
    }).join("");
    $$("[data-person]").forEach(button => button.addEventListener("click", () => { selectedId = button.dataset.person; drawTree(); renderProfile(); closePopovers(); setActive("tree"); }));
    const empty = visible.length === 0;
    $("#emptyState").hidden = !empty;
    $("#treeLines").hidden = empty;
    $("#modeLabel").textContent = mode === "path" ? "МОЙ ПУТЬ" : mode === "branch" ? "МОЯ ВЕТВЬ" : dense ? "ВСЕ ПОКОЛЕНИЯ · ПЛОТНОЕ ДРЕВО" : "";
    $("#modeLabel").classList.toggle("visible", Boolean($("#modeLabel").textContent));
    $("#graph").classList.toggle("filter-empty", empty);
    $("#graph").classList.toggle("dense", dense);
  }
  function renderProfile(tab = "info") {
    const person = byId.get(selectedId); const parent = person.parent ? byId.get(person.parent)?.name : "Не указан"; const children = people.filter(item => item.parent === person.id);
    const head = `<div class="profile-person"><div class="profile-avatar">${icon()}</div><div><h1>${person.name}</h1><p>${yearText(person)} <span>· поколение ${person.generation}</span></p></div></div><div class="profile-tabs"><button data-tab="info" class="${tab === "info" ? "active" : ""}">Информация</button><button data-tab="relatives" class="${tab === "relatives" ? "active" : ""}">Родственники <b>${children.length+Number(Boolean(person.parent))}</b></button><button data-tab="media" class="${tab === "media" ? "active" : ""}">Медиа <b>0</b></button></div>`;
    let body = "";
    if (tab === "info") body = `<dl class="facts"><div><dt>Поколение</dt><dd>${person.generation}</dd></div><div><dt>Отец</dt><dd>${parent}</dd></div><div><dt>Дети</dt><dd>${children.length} человек</dd></div><div><dt>Ветвь</dt><dd>${person.branch === "main" ? "Основная линия" : "Родственная ветвь"}</dd></div><div><dt>Место</dt><dd>${person.place}</dd></div></dl><p class="profile-note">${person.note || "Вымышленная запись для проверки расположения и читаемости полей."}</p><button class="branch-button" id="showBranch">Показать ветвь <span>›</span></button>`;
    if (tab === "relatives") { const relatives=people.filter(item=>item.id!==person.id&&(item.parent===person.id||item.id===person.parent)); body=relatives.length?`<div class="relative-list">${relatives.map(item=>`<button data-relative="${item.id}">${icon()}<span><strong>${item.name}</strong><small>${yearText(item)} · поколение ${item.generation}</small></span><b>›</b></button>`).join("")}</div>`:`<p class="panel-empty">В тестовом наборе родственники не указаны.</p>`; }
    if (tab === "media") body = `<div class="media-empty">${icon()}<strong>Пока без фотографий</strong><span>В тестовом наборе у людей нет фото. Для таких случаев используется нейтральный силуэт без лица.</span></div>`;
    $("#profilePanel").innerHTML = `<button class="panel-close" aria-label="Свернуть карточку">×</button>${head}<div class="profile-body">${body}</div>`;
    $$("[data-tab]").forEach(button=>button.addEventListener("click",()=>renderProfile(button.dataset.tab)));
    $$("[data-relative]").forEach(button=>button.addEventListener("click",()=>{selectedId=button.dataset.relative;drawTree();renderProfile("info");}));
    $("#profilePanel").querySelector(".panel-close").addEventListener("click",()=>{ $("#profilePanel").classList.toggle("collapsed"); });
    $("#showBranch")?.addEventListener("click",()=>setMode("branch"));
  }
  function setActive(nav) { $$(".nav-link").forEach(button=>button.classList.toggle("active",button.dataset.nav===nav)); }
  function setMode(next) { mode=next; if(next==="all") filters={min:1,max:5,photos:false,main:false}; drawTree(); announce(next==="path"?"Подсвечен путь от старшего известного предка.":next==="branch"?"Подсвечена выбранная ветвь.":"Показаны все поколения."); }
  function announce(message) { const toast=$("#toast"); toast.textContent=message; toast.classList.add("visible"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>toast.classList.remove("visible"),2300); }
  function closePopovers() { $$(".popover").forEach(popover=>popover.hidden=true); }
  function openPopover(id) { closePopovers(); const item=$(id); item.hidden=false; const input=item.querySelector("input[type=search]"); if(input) { renderSearch(input.value); input.focus(); } }
  function renderSearch(value="") { const query=value.trim().toLocaleLowerCase("ru"); const matches=people.filter(person=>`${person.name} ${person.born??""} ${person.died??""} ${person.branch}`.toLocaleLowerCase("ru").includes(query)); $("#searchResults").innerHTML=matches.length?matches.map(person=>`<button class="result-item" data-result="${person.id}">${icon()}<span><strong>${person.name}</strong><small>${yearText(person)} · поколение ${person.generation}</small></span><b>›</b></button>`).join(""):`<p class="empty-result">По запросу «${value}» никого не найдено.</p>`; $$("[data-result]").forEach(button=>button.addEventListener("click",()=>{selectedId=button.dataset.result;drawTree();renderProfile();closePopovers();})); }

  $("#searchButton").addEventListener("click",()=>openPopover("#searchPopover")); $("#railSearch").addEventListener("click",()=>openPopover("#searchPopover"));
  $("#searchInput").addEventListener("input",event=>renderSearch(event.target.value));
  $("#filtersButton").addEventListener("click",()=>openPopover("#filterPopover")); $("#statsButton").addEventListener("click",()=>openPopover("#statsPopover")); $("#statsButton").addEventListener("dblclick",()=>openPopover("#statsPopover")); $("[data-nav=stats]").addEventListener("click",()=>openPopover("#statsPopover"));
  $("#moreButton").addEventListener("click",()=>openPopover("#morePopover")); $("#moreFilters").addEventListener("click",()=>openPopover("#filterPopover"));
  $$("[data-close]").forEach(button=>button.addEventListener("click",closePopovers));
  $$("[data-mode]").forEach(button=>button.addEventListener("click",()=>{closePopovers();setMode(button.dataset.mode)}));
  $("#applyFilters").addEventListener("click",()=>{filters={min:Number($("#minGeneration").value),max:Number($("#maxGeneration").value),photos:$("#photosOnly").checked,main:$("#mainOnly").checked};drawTree();closePopovers();});
  $("#resetFilters").addEventListener("click",()=>{filters={min:1,max:5,photos:false,main:false};$("#photosOnly").checked=false;$("#mainOnly").checked=false;drawTree();closePopovers();});
  $("#resetEmpty").addEventListener("click",()=>{$("#resetFilters").click();});
  $("#zoomIn").addEventListener("click",()=>{zoom=Math.min(140,zoom+10);$("#zoomValue").textContent=`${zoom}%`;$("#graph").style.transform=`scale(${zoom/100})`;});
  $("#zoomOut").addEventListener("click",()=>{zoom=Math.max(60,zoom-10);$("#zoomValue").textContent=`${zoom}%`;$("#graph").style.transform=`scale(${zoom/100})`;});
  $("#whoAmI").addEventListener("click",()=>{selectedId="p06";drawTree();renderProfile();announce("В демонстрационном наборе «я» — Магомед.");});
  $$("[data-nav]").forEach(button=>button.addEventListener("click",()=>{const nav=button.dataset.nav;setActive(nav);if(nav==="tree")setMode("all");if(nav==="branches")openPopover("#filterPopover");if(nav==="people")openPopover("#searchPopover");}));
  document.addEventListener("keydown",event=>{if(event.key==="Escape")closePopovers();});
  renderProfile(state==="relatives"?"relatives":state==="media"?"media":"info"); drawTree();
  if(state==="search") {openPopover("#searchPopover");$("#searchInput").value="Магомед";renderSearch("Магомед");}
  if(state==="searchEmpty") {openPopover("#searchPopover");$("#searchInput").value="ИмяБезСовпадений";renderSearch($("#searchInput").value);}
  if(state==="filters") {openPopover("#filterPopover");}
  if(state==="filtersEmpty") {filters.photos=true;$("#photosOnly").checked=true;drawTree();openPopover("#filterPopover");}
  if(state==="stats") openPopover("#statsPopover");
  if(state==="menu") openPopover("#morePopover");
  if(state==="path") setMode("path"); if(state==="branch") setMode("branch");
  if(state==="focus") {document.querySelector('[data-person="p07"]')?.focus();}
  if(state==="dense") {zoom=80;$("#zoomValue").textContent="80%";$("#graph").style.transform="scale(.8)";}
  window.waydeanDesktopPrototype={people,drawTree,renderProfile,setMode};
})();
