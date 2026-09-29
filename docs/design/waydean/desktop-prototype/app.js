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
  let cameraScale = 1;
  let cameraX = 0;
  let cameraY = 0;
  let pathMotionId = 0;
  let pathAnimationFrame = 0;
  const activePointers = new Map();
  let pointerGesture = null;
  let suppressClickUntil = 0;
  let wheelEndTimer = 0;
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
      return `<path class="tree-line ${active ? "active" : ""}" data-edge="${person.parent}-${person.id}" d="M${px} ${py+58} V${bend} H${cx} V${cy-59}"/>`;
    }).join("");
    $("#treeLines").innerHTML = lines;
    $("#nodes").innerHTML = visible.map(person => {
      const [x,y] = positions[person.id]; const relatedClass = related && !related.has(person.id) ? "dimmed" : "";
      return `<button class="person-node ${person.id === selectedId ? "selected" : ""} ${relatedClass} ${state === "focus" && person.id === "p07" ? "keyboard-focus" : ""}" data-person="${person.id}" aria-label="${person.name}, ${yearText(person)}, поколение ${person.generation}" style="left:${x/10}%;top:${y/8.1}%">${icon()}<strong title="${person.name}">${person.name}</strong><small>${yearText(person)}</small></button>`;
    }).join("");
    $$("[data-person]").forEach(button => button.addEventListener("click", () => { cancelPathMotion(); selectedId = button.dataset.person; drawTree(); renderProfile(); closePopovers(); setActive("tree"); if (mode === "path") runDesktopPath(); }));
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
    $$("[data-relative]").forEach(button=>button.addEventListener("click",()=>{cancelPathMotion();selectedId=button.dataset.relative;drawTree();renderProfile("info");if(mode==="path")runDesktopPath();}));
    $("#profilePanel").querySelector(".panel-close").addEventListener("click",()=>{ $("#profilePanel").classList.toggle("collapsed"); });
    $("#showBranch")?.addEventListener("click",()=>setMode("branch"));
  }
  function setActive(nav) { $$(".nav-link").forEach(button=>button.classList.toggle("active",button.dataset.nav===nav)); }
  function cancelPathMotion() {
    pathMotionId += 1;
    if (pathAnimationFrame) cancelAnimationFrame(pathAnimationFrame);
    pathAnimationFrame = 0;
    $("#treeStage").classList.remove("camera-moving");
    $$(".tree-line").forEach(line => {
      line.style.strokeDasharray = "";
      line.style.strokeDashoffset = "";
      line.classList.remove("path-tracing");
    });
    $$(".person-node").forEach(node => node.classList.remove("path-current", "path-origin", "path-destination"));
  }
  function runDesktopPath() {
    cancelPathMotion();
    const stage = $("#treeStage"), graph = $("#graph");
    const route = [...ancestors(selectedId)].reverse();
    if (route.length < 2 || route.some(id => !positions[id] || !$(`[data-person="${id}"]`))) return;
    const nodes = new Map(route.map(id => [id, $(`[data-person="${id}"]`)]));
    const lines = route.slice(1).map((id, index) => $(`.tree-line[data-edge="${route[index]}-${id}"]`));
    if (lines.some(line => !line)) return;
    const rectFor = id => {
      const node = nodes.get(id);
      return { left: node.offsetLeft - node.offsetWidth / 2, top: node.offsetTop - node.offsetHeight / 2, width: node.offsetWidth, height: node.offsetHeight };
    };
    const centerFor = rect => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    const segments = [];
    const appendStraight = (from, to, currentId) => {
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      if (length > 0.5) segments.push({ kind: "straight", from, to, length, currentId });
    };
    const scaleX = graph.clientWidth / 1000, scaleY = graph.clientHeight / 810;
    const connectorSegments = new Map();
    route.slice(1).forEach((id, index) => {
      const parentId = route[index], parentRect = rectFor(parentId), childRect = rectFor(id);
      const parentCenter = centerFor(parentRect), childCenter = centerFor(childRect), line = lines[index];
      appendStraight(parentCenter, { x: parentCenter.x, y: parentRect.top + parentRect.height }, parentId);
      const svgLength = line.getTotalLength();
      const segmentIndex = segments.length;
      segments.push({ kind: "connector", line, svgLength, length: svgLength * (scaleX + scaleY) / 2, currentId: parentId });
      connectorSegments.set(line, segmentIndex);
      appendStraight({ x: childCenter.x, y: childRect.top }, childCenter, id);
    });
    const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
    if (!totalLength) return;
    const anchor = { x: stage.clientWidth / 2, y: stage.clientHeight * 0.48 };
    const destination = centerFor(rectFor(selectedId));
    const frameFor = (point, scale, progress) => {
      const destinationOnScreen = { x: destination.x + (anchor.x - destination.x) * progress, y: destination.y + (anchor.y - destination.y) * progress };
      const focus = { x: destinationOnScreen.x - (destination.x - point.x) * scale, y: destinationOnScreen.y - (destination.y - point.y) * scale };
      return { x: focus.x - point.x - (point.x - graph.clientWidth / 2) * (scale - 1), y: focus.y - point.y - (point.y - graph.clientHeight * 0.48) * (scale - 1) };
    };
    const finalScale = 1.32, finalFrame = frameFor(destination, finalScale, 1);
    nodes.get(route[0]).classList.add("path-origin");
    nodes.get(selectedId).classList.add("path-destination");
    stage.classList.add("path-focus");
    const lengths = lines.map(line => {
      const length = line.getTotalLength();
      line.style.strokeDasharray = `${length}`;
      line.style.strokeDashoffset = `${length}`;
      return length;
    });
    const sequence = pathMotionId;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      lines.forEach(line => { line.style.strokeDasharray = ""; line.style.strokeDashoffset = ""; });
      setCameraTransform(finalFrame.x, finalFrame.y, finalScale);
      nodes.get(selectedId).classList.add("path-current");
      return;
    }
    stage.classList.add("camera-moving");
    setCameraTransform(0, 0, 1, true);
    const startedAt = performance.now();
    const duration = Math.min(3200, Math.max(1600, totalLength * 2.4));
    const ease = value => value * value * (3 - 2 * value);
    const sampleAt = progress => {
      const distanceAlong = totalLength * progress;
      let consumed = 0;
      for (const [index, segment] of segments.entries()) {
        const end = consumed + segment.length;
        if (distanceAlong <= end || index === segments.length - 1) {
          const localProgress = Math.min(1, Math.max(0, (distanceAlong - consumed) / segment.length));
          let point;
          if (segment.kind === "connector") {
            const sample = segment.line.getPointAtLength(segment.svgLength * localProgress);
            point = { x: sample.x * scaleX, y: sample.y * scaleY };
          } else {
            point = { x: segment.from.x + (segment.to.x - segment.from.x) * localProgress, y: segment.from.y + (segment.to.y - segment.from.y) * localProgress };
          }
          return { point, segmentIndex: index, localProgress, currentId: segment.currentId };
        }
        consumed = end;
      }
      return { point: destination, segmentIndex: segments.length - 1, localProgress: 1, currentId: selectedId };
    };
    const step = now => {
      if (sequence !== pathMotionId) return;
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = ease(progress), sample = sampleAt(eased);
      const scale = 1 + (finalScale - 1) * eased;
      const frame = progress === 1 ? finalFrame : frameFor(sample.point, scale, eased);
      setCameraTransform(frame.x, frame.y, scale, true);
      lines.forEach((line, index) => {
        const segmentIndex = connectorSegments.get(line);
        const complete = segmentIndex < sample.segmentIndex || (segmentIndex === sample.segmentIndex && segments[sample.segmentIndex].kind === "connector" && sample.localProgress >= 1);
        const active = segmentIndex === sample.segmentIndex && segments[sample.segmentIndex].kind === "connector";
        line.classList.toggle("path-tracing", active);
        line.style.strokeDashoffset = complete ? "0" : active ? `${lengths[index] * (1 - sample.localProgress)}` : `${lengths[index]}`;
      });
      route.forEach(id => nodes.get(id).classList.toggle("path-current", id === sample.currentId));
      if (progress < 1) pathAnimationFrame = requestAnimationFrame(step);
      else {
        pathAnimationFrame = 0;
        setCameraTransform(finalFrame.x, finalFrame.y, finalScale);
        lines.forEach(line => { line.style.strokeDasharray = ""; line.style.strokeDashoffset = ""; line.classList.remove("path-tracing"); });
        nodes.get(selectedId).classList.add("path-current");
        stage.classList.remove("camera-moving");
      }
    };
    pathAnimationFrame = requestAnimationFrame(step);
  }
  function setMode(next) {
    cancelPathMotion();
    mode=next;
    if(next==="all") { filters={min:1,max:5,photos:false,main:false}; setCameraTransform(0,0,1); }
    $("#treeStage").classList.toggle("path-focus", next==="path");
    drawTree();
    announce(next==="path"?"Камера следует от предка к выбранному человеку.":next==="branch"?"Подсвечена выбранная ветвь.":"Показаны все поколения.");
    if(next==="path") runDesktopPath();
  }
  function announce(message) { const toast=$("#toast"); toast.textContent=message; toast.classList.add("visible"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>toast.classList.remove("visible"),2300); }
  function closePopovers() { $$(".popover").forEach(popover=>popover.hidden=true); }
  function openPopover(id) { closePopovers(); const item=$(id); item.hidden=false; const input=item.querySelector("input[type=search]"); if(input) { renderSearch(input.value); input.focus(); } }
  function renderSearch(value="") { const query=value.trim().toLocaleLowerCase("ru"); const matches=people.filter(person=>`${person.name} ${person.born??""} ${person.died??""} ${person.branch}`.toLocaleLowerCase("ru").includes(query)); $("#searchResults").innerHTML=matches.length?matches.map(person=>`<button class="result-item" data-result="${person.id}">${icon()}<span><strong>${person.name}</strong><small>${yearText(person)} · поколение ${person.generation}</small></span><b>›</b></button>`).join(""):`<p class="empty-result">По запросу «${value}» никого не найдено.</p>`; $$("[data-result]").forEach(button=>button.addEventListener("click",()=>{cancelPathMotion();selectedId=button.dataset.result;drawTree();renderProfile();closePopovers();if(mode==="path")runDesktopPath();})); }

  function setCameraTransform(x, y, scale, moving = false) {
    cameraX = x;
    cameraY = y;
    cameraScale = scale;
    zoom = Math.round(cameraScale * 100);
    $("#zoomValue").textContent = `${zoom}%`;
    $("#graph").style.transform = `translate(${cameraX}px, ${cameraY}px) scale(${cameraScale})`;
    $("#treeStage").classList.toggle("camera-moving", moving);
  }
  function stagePoint(event) {
    const rect = $("#treeStage").getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  const distance = (first, second) => Math.hypot(second.x - first.x, second.y - first.y);
  const midpoint = (first, second) => ({ x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 });
  function beginGestureFrame() {
    const pointers = [...activePointers.values()];
    if (pointers.length > 1) {
      pointerGesture = { type: "pinch", startDistance: Math.max(1, distance(pointers[0], pointers[1])), startMidpoint: midpoint(pointers[0], pointers[1]), startZoom: cameraScale, startX: cameraX, startY: cameraY, moved: pointerGesture?.moved || false };
    } else if (pointers.length === 1) {
      pointerGesture = { type: "pan", startPoint: pointers[0], startX: cameraX, startY: cameraY, moved: pointerGesture?.moved || false };
    } else pointerGesture = null;
  }
  function installCameraGestures() {
    const stage = $("#treeStage");
    const center = () => ({ x: stage.clientWidth / 2, y: stage.clientHeight * 0.48 });
    stage.addEventListener("pointerdown", event => {
      if (event.button !== 0 || event.target.closest(".tree-controls, .minimap, .mode-label, .empty-state")) return;
      if (!activePointers.size) cancelPathMotion();
      activePointers.set(event.pointerId, stagePoint(event));
      beginGestureFrame();
    });
    stage.addEventListener("pointermove", event => {
      if (!activePointers.has(event.pointerId) || !pointerGesture) return;
      const point = stagePoint(event);
      activePointers.set(event.pointerId, point);
      let x = cameraX, y = cameraY, scale = cameraScale;
      if (pointerGesture.type === "pan") {
        const dx = point.x - pointerGesture.startPoint.x, dy = point.y - pointerGesture.startPoint.y;
        if (!pointerGesture.moved && Math.hypot(dx, dy) < 4) return;
        pointerGesture.moved = true;
        x = pointerGesture.startX + dx;
        y = pointerGesture.startY + dy;
      } else {
        const pointers = [...activePointers.values()];
        if (pointers.length < 2) return;
        const currentMidpoint = midpoint(pointers[0], pointers[1]);
        const currentDistance = distance(pointers[0], pointers[1]);
        if (!pointerGesture.moved && Math.abs(currentDistance - pointerGesture.startDistance) < 3 && distance(currentMidpoint, pointerGesture.startMidpoint) < 3) return;
        pointerGesture.moved = true;
        scale = Math.max(0.5, Math.min(1.75, pointerGesture.startZoom * currentDistance / pointerGesture.startDistance));
        const ratio = scale / pointerGesture.startZoom, origin = center();
        x = currentMidpoint.x - origin.x - (pointerGesture.startMidpoint.x - origin.x - pointerGesture.startX) * ratio;
        y = currentMidpoint.y - origin.y - (pointerGesture.startMidpoint.y - origin.y - pointerGesture.startY) * ratio;
      }
      event.preventDefault();
      suppressClickUntil = performance.now() + 250;
      if (!stage.hasPointerCapture(event.pointerId)) stage.setPointerCapture(event.pointerId);
      setCameraTransform(x, y, scale, true);
    });
    const endPointer = event => {
      if (!activePointers.has(event.pointerId)) return;
      activePointers.delete(event.pointerId);
      if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
      if (!activePointers.size) {
        const moved = pointerGesture?.moved;
        pointerGesture = null;
        stage.classList.remove("camera-moving");
        if (moved) suppressClickUntil = performance.now() + 250;
      } else beginGestureFrame();
    };
    stage.addEventListener("pointerup", endPointer);
    stage.addEventListener("pointercancel", endPointer);
    stage.addEventListener("lostpointercapture", endPointer);
    stage.addEventListener("click", event => {
      if (performance.now() > suppressClickUntil) return;
      suppressClickUntil = 0;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
    stage.addEventListener("wheel", event => {
      if (event.target.closest(".tree-controls, .minimap, .mode-label, .empty-state")) return;
      event.preventDefault();
      const point = stagePoint(event), origin = center(), currentScale = cameraScale;
      const scale = Math.max(0.5, Math.min(1.75, currentScale * Math.exp(-event.deltaY * 0.00012)));
      const ratio = scale / currentScale;
      setCameraTransform(point.x - origin.x - (point.x - origin.x - cameraX) * ratio, point.y - origin.y - (point.y - origin.y - cameraY) * ratio, scale, true);
      clearTimeout(wheelEndTimer);
      wheelEndTimer = window.setTimeout(() => { wheelEndTimer = 0; stage.classList.remove("camera-moving"); }, 180);
    }, { passive: false });
  }
  $("#searchButton").addEventListener("click",()=>openPopover("#searchPopover")); $("#railSearch").addEventListener("click",()=>openPopover("#searchPopover"));
  $("#searchInput").addEventListener("input",event=>renderSearch(event.target.value));
  $("#filtersButton").addEventListener("click",()=>openPopover("#filterPopover")); $("#statsButton").addEventListener("click",()=>openPopover("#statsPopover")); $("#statsButton").addEventListener("dblclick",()=>openPopover("#statsPopover")); $("[data-nav=stats]").addEventListener("click",()=>openPopover("#statsPopover"));
  $("#moreButton").addEventListener("click",()=>openPopover("#morePopover")); $("#moreFilters").addEventListener("click",()=>openPopover("#filterPopover"));
  $$("[data-close]").forEach(button=>button.addEventListener("click",closePopovers));
  $$("[data-mode]").forEach(button=>button.addEventListener("click",()=>{closePopovers();setMode(button.dataset.mode)}));
  $("#applyFilters").addEventListener("click",()=>{filters={min:Number($("#minGeneration").value),max:Number($("#maxGeneration").value),photos:$("#photosOnly").checked,main:$("#mainOnly").checked};drawTree();closePopovers();});
  $("#resetFilters").addEventListener("click",()=>{filters={min:1,max:5,photos:false,main:false};$("#photosOnly").checked=false;$("#mainOnly").checked=false;drawTree();closePopovers();});
  $("#resetEmpty").addEventListener("click",()=>{$("#resetFilters").click();});
  $("#zoomIn").addEventListener("click",()=>{cancelPathMotion();const next=Math.min(175,zoom+10),scale=next/100,ratio=scale/cameraScale;setCameraTransform(cameraX*ratio,cameraY*ratio,scale);});
  $("#zoomOut").addEventListener("click",()=>{cancelPathMotion();const next=Math.max(50,zoom-10),scale=next/100,ratio=scale/cameraScale;setCameraTransform(cameraX*ratio,cameraY*ratio,scale);});
  $("#whoAmI").addEventListener("click",()=>{cancelPathMotion();selectedId="p06";drawTree();renderProfile();announce("В демонстрационном наборе «я» — Магомед.");if(mode==="path")runDesktopPath();});
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
  installCameraGestures();
  if(state==="dense") setCameraTransform(0,0,.8);
  window.waydeanDesktopPrototype={people,drawTree,renderProfile,setMode};
})();
