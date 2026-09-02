(function initCeWorkbench(global) {
  const STORE_KEY = 'quranapp_ce_workbench_v3';
  const REVIEW_KEY = 'quranapp_ce_workbench_review_v3';
  const PACK_KEY = 'quranapp_ce_workbench_pack_v1';
  const UI_KEY = 'quranapp_ce_workbench_ui_v1';
  const HISTORY_KEY = 'quranapp_ce_workbench_history_v1';
  const ASSIGNEE_KEY = 'quranapp_ce_workbench_assignees_v1';
  const HISTORY_LIMIT = 120;

  const state = {
    rows: [],
    filtered: [],
    focusedKey: null,
    history: [],
    meta: { packs: [], groups: {}, defaultPackId: 'pack-01-core' },
    glossary: { categories: [] },
    packProgress: [],
    groupProgress: [],
    assignees: {},
    cloudReady: false,
    cloudMeta: null,
    saveBusy: false,
    cloudSyncInFlight: false,
    cloudBootstrapped: false,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function grp(key) {
    return key.split('.')[0] || 'other';
  }

  function flash(message, isError = false, durationMs = 2200) {
    const el = $('msg');
    if (!el) return;
    el.textContent = message;
    el.className = isError ? 'hint err' : 'hint toast';
    global.clearTimeout(flash.timer);
    flash.timer = global.setTimeout(() => {
      el.textContent = '';
      el.className = 'hint';
    }, durationMs);
  }

  function setSaveFeedback(message, tone = '', durationMs = 4000) {
    const status = $('save-status');
    if (status) {
      status.textContent = message || '';
      status.className = `save-status${tone ? ` ${tone}` : ''}`;
      if (message && durationMs > 0) {
        global.clearTimeout(setSaveFeedback.timer);
        setSaveFeedback.timer = global.setTimeout(() => {
          if (status.textContent === message) {
            status.textContent = '';
            status.className = 'save-status';
          }
        }, durationMs);
      }
    }
    if (message) {
      flash(message, tone === 'err', durationMs);
    }
  }

  function setSaveBusy(busy) {
    state.saveBusy = busy;
    const saveBtn = $('save');
    const saveReviewedBtn = $('save-reviewed');
    const nextBtn = $('next-unreviewed');
    if (saveBtn) {
      saveBtn.disabled = busy;
      saveBtn.textContent = busy ? 'Сохраняем…' : 'Сохранить';
    }
    if (saveReviewedBtn) saveReviewedBtn.disabled = busy;
    if (nextBtn) nextBtn.disabled = busy;
  }

  function persistLocalSafe() {
    try {
      persistLocal();
      return true;
    } catch (error) {
      const message =
        error instanceof Error && /quota/i.test(error.message)
          ? 'Браузер переполнен — войдите и сохраните на сайт'
          : 'Не удалось сохранить в браузере';
      setSaveFeedback(message, 'err');
      return false;
    }
  }

  function isFilled(row) {
    return Boolean(String(row.ce ?? '').trim());
  }

  function isSameAsRu(row) {
    return isFilled(row) && String(row.ce).trim() === String(row.ru).trim();
  }

  function isReviewed(row) {
    return row.status === 'reviewed' || row.status === 'manual';
  }

  function isUncertain(row) {
    return row.status === 'uncertain';
  }

  function mergeWorkflowStatus(localStatus, cloudStatus) {
    const cloud = String(cloudStatus ?? '').trim();
    const local = String(localStatus ?? '').trim();
    if (cloud === 'reviewed' || cloud === 'uncertain' || cloud === 'manual') {
      return cloud === 'manual' ? 'reviewed' : cloud;
    }
    if (local === 'reviewed' || local === 'uncertain' || local === 'manual') {
      return local === 'manual' ? 'reviewed' : local;
    }
    return local || cloud || 'todo';
  }

  function mergeCloudCe(localCe, cloudCe) {
    const local = String(localCe ?? '');
    const cloud = String(cloudCe ?? '');
    if (cloud === local) return local;
    if (local.trim() && !cloud.trim()) return local;
    if (!local.trim() && cloud.trim()) return cloud;
    // Unsaved local edits win over stale cloud snapshot.
    return local;
  }

  function persistLocalSoon() {
    global.clearTimeout(persistLocalSoon.timer);
    persistLocalSoon.timer = global.setTimeout(() => {
      try {
        collectEditorValues();
        persistLocal();
      } catch (error) {
        console.warn('Workbench draft autosave failed', error);
      }
    }, 400);
  }

  function flushLocalDraft() {
    global.clearTimeout(persistLocalSoon.timer);
    collectEditorValues();
    persistLocalSafe();
  }

  function loadAssignees() {
    try {
      const raw = global.localStorage.getItem(ASSIGNEE_KEY);
      state.assignees = raw ? JSON.parse(raw) : {};
    } catch {
      state.assignees = {};
    }
  }

  function persistAssignees() {
    global.localStorage.setItem(ASSIGNEE_KEY, JSON.stringify(state.assignees));
  }

  function getPackAssignee(packId) {
    return state.assignees[packId] ?? '';
  }

  function setPackAssignee(packId, name) {
    const trimmed = String(name ?? '').trim();
    if (trimmed) state.assignees[packId] = trimmed;
    else delete state.assignees[packId];
    persistAssignees();
    updateAssigneeField();
    updatePackHeadline();
  }

  function updateAssigneeField() {
    const input = $('pack-assignee');
    if (!input) return;
    input.value = getPackAssignee(getSelectedPack());
  }

  function updatePackHeadline() {
    const pack = getPackDef(getSelectedPack());
    const packRows = state.rows.filter((row) => rowInSelectedPack(row));
    const packStats = summarizeRows(packRows);
    const assignee = getPackAssignee(getSelectedPack());
    const assigneeSuffix = assignee ? ` · ${assignee}` : '';
    $('pack-headline').textContent = pack
      ? `Пакет «${pack.title}»: ${packStats.translatedPct}% перев. / ${packStats.reviewedPct}% провер. (${packStats.total} ключей)${assigneeSuffix}`
      : '';
  }

  function getSelectedPack() {
    return $('pack')?.value ?? 'pack-all';
  }

  function getPackDef(packId) {
    return state.meta.packs.find((pack) => pack.id === packId) ?? null;
  }

  function packMatchesKey(pack, key) {
    if (!pack || pack.all) return true;
    const group = grp(key);
    if (pack.groups?.includes(group)) return true;
    return Boolean(pack.prefixes?.some((prefix) => key.startsWith(prefix)));
  }

  function rowInSelectedPack(row) {
    const pack = getPackDef(getSelectedPack());
    return packMatchesKey(pack, row.key);
  }

  function loadLocalOverrides() {
    try {
      const ceRaw = global.localStorage.getItem(STORE_KEY);
      const reviewRaw = global.localStorage.getItem(REVIEW_KEY);
      const ceMap = ceRaw ? new Map(JSON.parse(ceRaw).map((x) => [x.key, x])) : new Map();
      const reviewMap = reviewRaw ? new Map(JSON.parse(reviewRaw)) : new Map();
      state.rows.forEach((row) => {
        if (ceMap.has(row.key)) {
          const patch = ceMap.get(row.key);
          if (patch && typeof patch === 'object') {
            if (patch.ce != null) row.ce = patch.ce;
            if (patch.status) row.status = patch.status;
          } else {
            row.ce = patch;
          }
        }
        if (reviewMap.has(row.key)) row.status = reviewMap.get(row.key);
      });
      const savedPack = global.localStorage.getItem(PACK_KEY);
      if (savedPack && $('pack')) $('pack').value = savedPack;
    } catch (error) {
      console.warn('Workbench local restore failed', error);
    }
  }

  function persistLocal() {
    const cePayload = state.rows.map((row) => ({
      key: row.key,
      ce: row.ce,
      ...(row.status === 'reviewed' || row.status === 'uncertain' ? { status: row.status } : {}),
    }));
    const reviewPayload = state.rows
      .filter((row) => row.status === 'reviewed' || row.status === 'uncertain')
      .map((row) => [row.key, row.status]);
    global.localStorage.setItem(STORE_KEY, JSON.stringify(cePayload));
    global.localStorage.setItem(REVIEW_KEY, JSON.stringify(reviewPayload));
    global.localStorage.setItem(PACK_KEY, getSelectedPack());
    saveUiState();
  }

  function setSelectValue(select, value) {
    if (!select || value == null || value === '') return;
    const hasOption = [...select.options].some((option) => option.value === value);
    if (hasOption) select.value = value;
  }

  function saveUiState() {
    const payload = {
      pack: getSelectedPack(),
      status: $('status')?.value ?? 'all',
      group: $('group')?.value ?? 'all',
      q: $('q')?.value ?? '',
      glossaryQ: $('glossary-q')?.value ?? '',
      focusedKey: state.focusedKey ?? '',
    };
    try {
      global.localStorage.setItem(UI_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('Workbench UI state save failed', error);
    }
  }

  function loadUiState() {
    try {
      const raw = global.localStorage.getItem(UI_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function applyUiState(ui) {
    if (!ui || typeof ui !== 'object') return;
    setSelectValue($('pack'), ui.pack);
    setSelectValue($('status'), ui.status);
    setSelectValue($('group'), ui.group);
    if ($('q') && typeof ui.q === 'string') $('q').value = ui.q;
    if ($('glossary-q') && typeof ui.glossaryQ === 'string') $('glossary-q').value = ui.glossaryQ;
    if (ui.focusedKey && state.rows.some((row) => row.key === ui.focusedKey)) {
      state.focusedKey = ui.focusedKey;
    }
  }

  function persistUiStateSoon() {
    global.clearTimeout(persistUiStateSoon.timer);
    persistUiStateSoon.timer = global.setTimeout(saveUiState, 250);
  }

  function scrollToFocusedRow(options = {}) {
    if (!state.focusedKey) return;
    global.requestAnimationFrame(() => {
      const editor = document.querySelector(
        `textarea.editor[data-key="${CSS.escape(state.focusedKey)}"]`
      );
      if (!editor) return;
      editor.scrollIntoView({
        behavior: options.smooth ? 'smooth' : 'auto',
        block: 'center',
      });
      if (options.focus) editor.focus({ preventScroll: true });
    });
  }

  function historyActionLabel(action) {
    switch (action) {
      case 'reviewed':
        return 'Проверено ✓';
      case 'uncertain':
        return 'Пересмотреть ?';
      case 'todo':
        return 'Снята отметка';
      case 'paste':
        return 'Вставлен перевод';
      case 'spread':
        return 'Разнесён перевод';
      case 'ce':
        return 'Изменён перевод';
      default:
        return 'Изменение';
    }
  }

  function truncateText(value, max = 64) {
    const text = String(value ?? '').trim();
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  function loadHistory() {
    try {
      const raw = global.localStorage.getItem(HISTORY_KEY);
      state.history = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(state.history)) state.history = [];
    } catch {
      state.history = [];
    }
  }

  function persistHistory() {
    try {
      global.localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history.slice(0, HISTORY_LIMIT)));
    } catch (error) {
      console.warn('Workbench history save failed', error);
    }
  }

  function recordChange(entry) {
    const row = state.rows.find((item) => item.key === entry.key);
    if (!row) return;
    const prevCe = entry.prevCe ?? '';
    const nextCe = row.ce ?? entry.ce ?? '';
    const prevStatus = entry.prevStatus ?? '';
    const nextStatus = row.status ?? entry.status ?? 'todo';
    const action = entry.action ?? 'ce';

    if (action === 'ce' && prevCe.trim() === nextCe.trim()) return;
    if (action !== 'ce' && prevStatus === nextStatus && prevCe.trim() === nextCe.trim()) return;

    state.history.unshift({
      id: `${Date.now()}-${entry.key}`,
      at: new Date().toISOString(),
      key: entry.key,
      ru: row.ru ?? '',
      ce: nextCe,
      prevCe,
      prevStatus,
      status: nextStatus,
      action,
      label: entry.label ?? historyActionLabel(action),
    });
    state.history = state.history.slice(0, HISTORY_LIMIT);
    persistHistory();
    const historyPanel = document.querySelector('[data-side-panel="history"]');
    if (historyPanel && !historyPanel.hidden) renderHistory();
  }

  function switchSideTab(tabId) {
    document.querySelectorAll('.side-tab').forEach((btn) => {
      const active = btn.dataset.sideTab === tabId;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.side-tab-panel').forEach((panel) => {
      panel.hidden = panel.dataset.sidePanel !== tabId;
    });
    if (tabId === 'history') renderHistory();
    if (tabId === 'glossary') renderGlossary();
  }

  function focusRowFromHistory(key) {
    const row = state.rows.find((item) => item.key === key);
    if (!row) {
      flash('Ключ не найден в списке', true);
      return;
    }
    if ($('pack')) $('pack').value = 'pack-all';
    if ($('status')) $('status').value = 'all';
    if ($('group')) $('group').value = 'all';
    if ($('q')) $('q').value = key;
    state.focusedKey = key;
    saveUiState();
    render();
    switchSideTab('preview');
    scrollToFocusedRow({ focus: true });
    flash(`Открыт ключ ${key}`);
  }

  function renderHistory() {
    const host = $('history-host');
    if (!host) return;
    host.innerHTML = '';
    if (!state.history.length) {
      host.innerHTML = '<p class="hint">Пока пусто — сюда попадают правки перевода и отметки «Проверено».</p>';
      return;
    }
    const fragment = global.document.createDocumentFragment();
    state.history.forEach((entry) => {
      const btn = global.document.createElement('button');
      btn.type = 'button';
      btn.className = 'history-item';
      const when = new Date(entry.at).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      btn.innerHTML = `
        <span class="history-item-top">
          <span class="history-item-action">${escapeHtml(entry.label ?? historyActionLabel(entry.action))}</span>
          <span class="history-item-time">${escapeHtml(when)}</span>
        </span>
        <span class="history-item-key">${escapeHtml(entry.key)}</span>
        <span class="history-item-ce">${escapeHtml(truncateText(entry.ce))}</span>
      `;
      btn.addEventListener('click', () => focusRowFromHistory(entry.key));
      fragment.append(btn);
    });
    host.append(fragment);
  }

  function clearHistory() {
    state.history = [];
    persistHistory();
    renderHistory();
    flash('История очищена');
  }

  function isTranslated(row) {
    return isFilled(row) && !isSameAsRu(row);
  }

  function summarizeRows(rows) {
    const total = rows.length;
    const filled = rows.filter((row) => isFilled(row)).length;
    const sameAsRu = rows.filter((row) => isSameAsRu(row)).length;
    const translated = rows.filter((row) => isTranslated(row)).length;
    const reviewed = rows.filter((row) => isReviewed(row)).length;
    const uncertain = rows.filter((row) => isUncertain(row)).length;
    return {
      total,
      filled,
      empty: total - filled,
      sameAsRu,
      translated,
      reviewed,
      uncertain,
      filledPct: total ? Math.round((filled / total) * 100) : 0,
      translatedPct: total ? Math.round((translated / total) * 100) : 0,
      sameAsRuPct: total ? Math.round((sameAsRu / total) * 100) : 0,
      reviewedPct: total ? Math.round((reviewed / total) * 100) : 0,
    };
  }

  function rowsToEntriesObject(rows = state.rows) {
    const entries = {};
    const now = new Date().toISOString();
    rows.forEach((row) => {
      entries[row.key] = {
        ru: row.ru,
        ce: row.ce,
        status:
          row.status === 'reviewed'
            ? 'reviewed'
            : row.status === 'uncertain'
              ? 'needs-review'
              : row.sourceStatus || 'ai-draft',
        note:
          row.status === 'reviewed'
            ? 'Reviewed in translation workbench'
            : row.status === 'uncertain'
              ? 'Uncertain translation — native review required'
              : row.note || 'Workbench edit — native review recommended',
        updatedAt: now,
      };
    });
    return entries;
  }

  function entriesObjectToRows(entries) {
    return Object.keys(entries)
      .sort()
      .map((key) => {
        const row = entries[key];
        return {
          key,
          ru: row.ru ?? '',
          ce: row.ce ?? '',
          status:
            row.status === 'reviewed' || row.status === 'manual'
              ? 'reviewed'
              : row.status === 'uncertain' || row.status === 'needs-review'
                ? 'uncertain'
                : 'todo',
          sourceStatus: row.status ?? 'ai-draft',
          note: row.note ?? '',
          updatedAt: row.updatedAt ?? null,
          group: grp(key),
        };
      });
  }

  function rowBadgeMeta(row) {
    if (isReviewed(row)) return { className: 'badge reviewed', text: 'Проверено' };
    if (isUncertain(row)) return { className: 'badge uncertain', text: 'Пересмотреть' };
    if (isSameAsRu(row)) return { className: 'badge todo same-as-ru', text: 'Как в ru' };
    if (isFilled(row)) return { className: 'badge todo', text: 'Черновик' };
    return { className: 'badge empty', text: 'Пусто' };
  }

  function updateRowChrome(key) {
    const row = state.rows.find((item) => item.key === key);
    const article = document.querySelector(`.row[data-key="${CSS.escape(key)}"]`);
    if (!row || !article) return;
    article.classList.toggle('empty', !isFilled(row));
    article.classList.toggle('same-as-ru', isSameAsRu(row));
    article.classList.toggle('reviewed', isReviewed(row));
    article.classList.toggle('uncertain', isUncertain(row));
    const badge = article.querySelector('.badge');
    if (!badge) return;
    const meta = rowBadgeMeta(row);
    badge.className = meta.className;
    badge.textContent = meta.text;
  }

  function refreshPackSelectLabels() {
    const select = $('pack');
    if (!select) return;
    const current = select.value;
    [...select.options].forEach((option) => {
      const pack = getPackDef(option.value);
      if (!pack) return;
      const packStats = summarizeRows(state.rows.filter((row) => packMatchesKey(pack, row.key)));
      const assignee = getPackAssignee(option.value);
      const assigneeSuffix = assignee ? ` · ${assignee}` : '';
      option.textContent = `${pack.title} — ${packStats.translatedPct}% / ${packStats.reviewedPct}%${assigneeSuffix}`;
    });
    if (current) select.value = current;
  }

  function renderGroupProgress() {
    const host = $('group-progress');
    if (!host) return;
    host.innerHTML = '';
    const rowsForStats = state.rows;
    const byGroup = new Map();
    for (const row of rowsForStats) {
      if (!byGroup.has(row.group)) {
        byGroup.set(row.group, { id: row.group, label: row.groupLabel ?? row.group, total: 0, filled: 0, reviewed: 0, priority: row.priority ?? 900 });
      }
      const bucket = byGroup.get(row.group);
      bucket.total += 1;
      if (isFilled(row)) bucket.filled += 1;
      if (isTranslated(row)) bucket.translated = (bucket.translated ?? 0) + 1;
      if (isSameAsRu(row)) bucket.sameAsRu = (bucket.sameAsRu ?? 0) + 1;
      if (isReviewed(row)) bucket.reviewed += 1;
    }

    [...byGroup.values()]
      .sort((a, b) => (a.priority ?? 900) - (b.priority ?? 900))
      .forEach((group) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'group-card';
        const translatedPct = group.total ? Math.round(((group.translated ?? 0) / group.total) * 100) : 0;
        const reviewedPct = group.total ? Math.round((group.reviewed / group.total) * 100) : 0;
        card.innerHTML = `
          <div class="group-card-title">${escapeHtml(group.label)} <span class="muted">${group.total}</span></div>
          <div class="mini-bar"><div style="width:${translatedPct}%"></div></div>
          <div class="group-card-meta">перев. ${translatedPct}% · провер. ${reviewedPct}%</div>
        `;
        card.addEventListener('click', () => {
          if ($('group')) $('group').value = group.id;
          render();
          flash(`Фильтр: ${group.label}`);
        });
        host.append(card);
      });
  }

  function renderPreview(row = null) {
    const host = $('preview-host');
    const templateEl = $('preview-template');
    if (!host) return;
    const focused =
      row ?? (state.focusedKey ? state.rows.find((item) => item.key === state.focusedKey) : null);
    if (!focused || !global.CeWorkbenchMockup) {
      host.innerHTML = '<p class="hint preview-placeholder">Выберите строку — увидите mockup экрана</p>';
      if (templateEl) templateEl.textContent = '';
      return;
    }
    host.innerHTML = global.CeWorkbenchMockup.render(focused, state.rows);
    if (templateEl) templateEl.textContent = global.CeWorkbenchMockup.templateLabel(focused);
  }

  function insertGlossaryTerm(ceText) {
    const focusedKey = state.focusedKey;
    const editor = focusedKey
      ? document.querySelector(`textarea.editor[data-key="${CSS.escape(focusedKey)}"]`)
      : null;
    if (!editor) {
      if (global.navigator?.clipboard?.writeText) {
        global.navigator.clipboard.writeText(ceText);
        flash('Скопировано — выберите строку для вставки');
      } else {
        flash('Сначала выберите строку для вставки', true);
      }
      return;
    }
    const start = editor.selectionStart ?? editor.value.length;
    const end = editor.selectionEnd ?? editor.value.length;
    editor.value = `${editor.value.slice(0, start)}${ceText}${editor.value.slice(end)}`;
    const row = state.rows.find((item) => item.key === focusedKey);
    if (row) row.ce = editor.value;
    editor.focus();
    editor.selectionStart = editor.selectionEnd = start + ceText.length;
    stats();
    renderPreview(row);
    flash(`Вставлено: ${ceText}`);
  }

  function rowMatchesStatusFilter(row, statusFilter) {
    const filled = isFilled(row);
    const reviewed = isReviewed(row);
    const uncertain = isUncertain(row);
    if (statusFilter === 'empty' && filled) return false;
    if (statusFilter === 'filled' && !filled) return false;
    if (statusFilter === 'reviewed' && !reviewed) return false;
    if (statusFilter === 'uncertain' && !uncertain) return false;
    if (statusFilter === 'todo' && (reviewed || uncertain)) return false;
    if (statusFilter === 'same-as-ru' && !isSameAsRu(row)) return false;
    if (statusFilter === 'translated' && !isTranslated(row)) return false;
    if (statusFilter === 'needs-review' && (!filled || reviewed || uncertain || isSameAsRu(row))) return false;
    return true;
  }

  function rowMatchesSearch(row, term) {
    if (!term) return true;
    return (
      row.key.toLowerCase().includes(term) ||
      row.ru.toLowerCase().includes(term) ||
      String(row.ce).toLowerCase().includes(term) ||
      String(row.hint ?? '').toLowerCase().includes(term)
    );
  }

  function countRowsMatchingFilters(options = {}) {
    const statusFilter = options.statusFilter ?? ($('status')?.value ?? 'all');
    const groupFilter = options.groupFilter ?? ($('group')?.value ?? 'all');
    const term = options.term ?? ($('q')?.value ?? '').trim().toLowerCase();
    const respectPack = options.respectPack !== false;
    return state.rows.filter((row) => {
      if (respectPack && !rowInSelectedPack(row)) return false;
      if (groupFilter !== 'all' && grp(row.key) !== groupFilter) return false;
      if (statusFilter !== 'all' && !rowMatchesStatusFilter(row, statusFilter)) return false;
      return rowMatchesSearch(row, term);
    }).length;
  }

  function resetFilters(options = {}) {
    if ($('q')) $('q').value = '';
    if ($('status')) $('status').value = 'all';
    if ($('group')) $('group').value = 'all';
    if (options.allPacks && $('pack')) $('pack').value = 'pack-all';
    saveUiState();
    render();
    flash(options.allPacks ? 'Фильтры сброшены · все ключи' : 'Фильтры сброшены');
  }

  function buildEmptyFilterMessage(statusFilter, groupFilter, term) {
    const inAllPacks = countRowsMatchingFilters({ respectPack: false });
    const pack = getPackDef(getSelectedPack());
    const parts = [];

    if (inAllPacks > 0 && pack && !pack.all) {
      parts.push(`В пакете «${pack.title}» ничего не найдено, но по фильтру есть <strong>${inAllPacks}</strong> ключ(ей) во всех пакетах.`);
      parts.push('Нажмите «Сброс фильтров» или выберите пакет «Все ключи».');
    } else if (term) {
      parts.push('Поиск ничего не нашёл. Очистите строку поиска или нажмите «Сброс фильтров».');
    } else if (statusFilter === 'reviewed') {
      parts.push('Проверенных ключей по текущим фильтрам нет.');
      parts.push('Если только что отметили «Проверено» — нажмите «Сохранить» и проверьте пакет «Все ключи».');
    } else {
      parts.push('По текущим фильтрам строк нет. Попробуйте «Сброс фильтров».');
    }

    if (groupFilter !== 'all') {
      parts.push(`Домен: ${groupFilter}.`);
    }

    return parts.join(' ');
  }

  function renderGlossary() {
    const host = $('glossary-host');
    if (!host) return;
    const term = ($('glossary-q')?.value ?? '').trim().toLowerCase();
    host.innerHTML = '';
    for (const category of state.glossary.categories ?? []) {
      const filteredTerms = (category.terms ?? []).filter((item) => {
        if (!term) return true;
        return (
          item.ru.toLowerCase().includes(term) ||
          item.ce.toLowerCase().includes(term) ||
          String(item.note ?? '')
            .toLowerCase()
            .includes(term)
        );
      });
      if (!filteredTerms.length) continue;

      const details = document.createElement('details');
      details.className = 'glossary-category';
      details.open = Boolean(term) || category.id === 'nav';
      const summary = document.createElement('summary');
      summary.textContent = `${category.label} (${filteredTerms.length})`;
      details.append(summary);

      const list = document.createElement('div');
      list.className = 'glossary-terms';
      filteredTerms.forEach((item) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'glossary-term';
        btn.innerHTML = `
          <span class="glossary-term-ce">${escapeHtml(item.ce)}</span>
          <span class="glossary-term-ru">${escapeHtml(item.ru)}</span>
          ${item.note ? `<span class="glossary-term-note">${escapeHtml(item.note)}</span>` : ''}
        `;
        btn.addEventListener('click', () => insertGlossaryTerm(item.ce));
        list.append(btn);
      });
      details.append(list);
      host.append(details);
    }
    if (!host.children.length) {
      host.innerHTML = '<p class="hint">Ничего не найдено</p>';
    }
  }

  function render() {
    const term = ($('q')?.value ?? '').trim().toLowerCase();
    const statusFilter = $('status')?.value ?? 'all';
    const groupFilter = $('group')?.value ?? 'all';

    state.filtered = state.rows
      .filter((row) => {
        if (!rowInSelectedPack(row)) return false;
        if (groupFilter !== 'all' && grp(row.key) !== groupFilter) return false;
        if (statusFilter !== 'all' && !rowMatchesStatusFilter(row, statusFilter)) return false;
        return rowMatchesSearch(row, term);
      })
      .sort((a, b) => (a.priority ?? 999999) - (b.priority ?? 999999) || a.key.localeCompare(b.key));

    const table = $('table');
    if (!table) return;
    table.innerHTML = '';

    if (!state.filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-filter';
      empty.innerHTML = buildEmptyFilterMessage(statusFilter, groupFilter, term);
      const actions = document.createElement('div');
      actions.style.marginTop = '12px';
      actions.style.display = 'flex';
      actions.style.gap = '8px';
      actions.style.justifyContent = 'center';
      actions.style.flexWrap = 'wrap';
      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'secondary';
      resetBtn.textContent = 'Сброс фильтров';
      resetBtn.addEventListener('click', () => resetFilters({ allPacks: true }));
      actions.append(resetBtn);
      empty.append(actions);
      table.append(empty);
      $('shown').textContent = '0';
      stats();
      renderPreview();
      return;
    }

    const fragment = document.createDocumentFragment();
    const ruDuplicateIndex = buildRuDuplicateIndex();
    state.filtered.forEach((row) => {
      const article = document.createElement('article');
      article.className = 'row';
      if (!isFilled(row)) article.classList.add('empty');
      if (isSameAsRu(row)) article.classList.add('same-as-ru');
      if (isReviewed(row)) article.classList.add('reviewed');
      if (isUncertain(row)) article.classList.add('uncertain');
      if (row.key === state.focusedKey) article.classList.add('focused');
      article.dataset.key = row.key;

      const meta = document.createElement('div');
      meta.innerHTML = `
        <div class="label">${escapeHtml(row.groupLabel ?? row.group)}</div>
        <div class="key">${escapeHtml(row.key)}</div>
        <div class="row-hint">${escapeHtml(row.hint ?? '')}</div>
      `;

      const badge = document.createElement('span');
      const badgeMeta = rowBadgeMeta(row);
      badge.className = badgeMeta.className;
      badge.textContent = badgeMeta.text;
      meta.append(badge);

      const ru = document.createElement('div');
      const ruHead = document.createElement('div');
      ruHead.className = 'field-head';
      const ruLabel = document.createElement('div');
      ruLabel.className = 'label ru-label';
      ruLabel.textContent = 'Русский';
      const dupSiblings = ruDuplicateIndex.get(rowRuKey(row)) ?? [];
      if (dupSiblings.length > 1) {
        const dupBadge = document.createElement('span');
        dupBadge.className = 'dup-count';
        dupBadge.textContent = duplicateCountLabel(dupSiblings);
        dupBadge.title = `${dupSiblings.length} ключей с тем же русским текстом`;
        ruLabel.append(dupBadge);
      }
      const ruTools = document.createElement('div');
      ruTools.className = 'field-tools';
      const copyRuBtn = createToolButton('Копировать', 'Скопировать русский текст');
      copyRuBtn.addEventListener('click', () => {
        void copyText(row.ru);
      });
      const yandexBtn = createToolButton('Яндекс ↗', 'Открыть Яндекс.Переводчик (ru → ce) с этим текстом');
      yandexBtn.classList.add('yandex');
      yandexBtn.addEventListener('click', () => {
        openYandexTranslate(row.ru);
      });
      ruTools.append(copyRuBtn, yandexBtn);
      ruHead.append(ruLabel, ruTools);
      const ruSource = document.createElement('div');
      ruSource.className = 'source';
      ruSource.textContent = row.ru;
      ru.append(ruHead, ruSource);

      const editorWrap = document.createElement('div');
      const editorHead = document.createElement('div');
      editorHead.className = 'field-head';
      const editorLabel = document.createElement('div');
      editorLabel.className = 'label';
      editorLabel.textContent = 'Нохчийн';
      const editorTools = document.createElement('div');
      editorTools.className = 'field-tools';
      const editor = document.createElement('textarea');
      editor.className = 'editor';
      editor.value = row.ce ?? '';
      editor.dataset.key = row.key;
      editor.addEventListener('focus', () => {
        editor.dataset.prevCe = row.ce ?? '';
        editor.dataset.prevStatus = row.status ?? 'todo';
        state.focusedKey = row.key;
        persistUiStateSoon();
        document.querySelectorAll('.row.focused').forEach((el) => el.classList.remove('focused'));
        article.classList.add('focused');
        renderPreview(row);
      });
      editor.addEventListener('blur', () => {
        const prevCe = editor.dataset.prevCe ?? '';
        const prevStatus = editor.dataset.prevStatus ?? row.status ?? 'todo';
        if (String(prevCe).trim() !== String(row.ce ?? '').trim()) {
          recordChange({ key: row.key, action: 'ce', prevCe, prevStatus });
        }
        editor.dataset.prevCe = row.ce ?? '';
        editor.dataset.prevStatus = row.status ?? 'todo';
      });
      editor.addEventListener('input', () => {
        row.ce = editor.value;
        const spreadBtn = article.querySelector('.tool-btn.spread');
        if (spreadBtn) spreadBtn.disabled = !String(editor.value).trim();
        updateRowChrome(row.key);
        stats();
        if (state.focusedKey === row.key) renderPreview(row);
        persistLocalSoon();
      });
      const pasteBtn = createToolButton(
        'Вставить',
        'Вставить перевод из буфера (если не получится — откроется окно)'
      );
      pasteBtn.addEventListener('click', () => {
        void pasteIntoEditor(editor, row);
      });
      editorTools.append(pasteBtn);
      if (dupSiblings.length > 1) {
        const spreadBtn = createToolButton(
          'На все',
          `Поставить этот перевод во все ${dupSiblings.length} ключей с таким же русским текстом (без отметки «проверено»)`
        );
        spreadBtn.classList.add('spread');
        if (!String(row.ce ?? '').trim()) spreadBtn.disabled = true;
        spreadBtn.addEventListener('click', () => {
          const count = spreadCeToDuplicates(row);
          if (count > 0) flash(`Обновлено ${count} дубликатов`);
        });
        editorTools.append(spreadBtn);
      }
      editorHead.append(editorLabel, editorTools);
      editorWrap.append(editorHead, editor);

      const actions = document.createElement('div');
      actions.className = 'row-actions';
      const reviewBtn = document.createElement('button');
      reviewBtn.type = 'button';
      reviewBtn.className = isReviewed(row) ? 'secondary' : 'primary';
      reviewBtn.textContent = isReviewed(row) ? 'Снять ✓' : 'Проверено ✓';
      reviewBtn.addEventListener('click', () => {
        const prevStatus = row.status ?? 'todo';
        const prevCe = row.ce ?? '';
        row.status = isReviewed(row) ? 'todo' : 'reviewed';
        recordChange({
          key: row.key,
          action: row.status === 'reviewed' ? 'reviewed' : 'todo',
          prevStatus,
          prevCe,
        });
        persistLocal();
        render();
        flash(isReviewed(row) ? 'Отмечено проверенным' : 'Снята отметка');
      });
      const uncertainBtn = document.createElement('button');
      uncertainBtn.type = 'button';
      uncertainBtn.className = isUncertain(row) ? 'secondary uncertain-active' : 'secondary';
      uncertainBtn.textContent = isUncertain(row) ? 'Снять ?' : 'Не уверен ?';
      uncertainBtn.title = 'Перевод есть, но позже пересмотреть';
      uncertainBtn.addEventListener('click', () => {
        const prevStatus = row.status ?? 'todo';
        const prevCe = row.ce ?? '';
        row.status = isUncertain(row) ? 'todo' : 'uncertain';
        recordChange({
          key: row.key,
          action: row.status === 'uncertain' ? 'uncertain' : 'todo',
          prevStatus,
          prevCe,
        });
        persistLocal();
        render();
        flash(isUncertain(row) ? 'Отмечено: пересмотреть позже' : 'Снята отметка');
      });
      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'secondary';
      nextBtn.textContent = 'Далее →';
      nextBtn.addEventListener('click', () => focusNext(row.key));
      actions.append(reviewBtn, uncertainBtn, nextBtn);

      article.append(meta, ru, editorWrap, actions);
      fragment.append(article);
    });

    table.append(fragment);
    $('shown').textContent = String(state.filtered.length);
    stats();
    renderPreview();
  }

  function stats() {
    collectEditorValues();
    const overall = summarizeRows(state.rows);

    $('total').textContent = String(overall.total);
    $('translated').textContent = String(overall.translated);
    $('same-as-ru').textContent = String(overall.sameAsRu);
    $('empty').textContent = String(overall.empty);
    $('reviewed').textContent = String(overall.reviewed);
    $('translated-pct').textContent = String(overall.translatedPct);
    $('same-as-ru-pct').textContent = String(overall.sameAsRuPct);
    $('reviewed-pct').textContent = String(overall.reviewedPct);
    $('bar-translated').style.width = `${overall.translatedPct}%`;
    $('bar-same-ru').style.width = `${overall.sameAsRuPct}%`;
    $('bar-review').style.width = `${overall.reviewedPct}%`;

    $('progress-headline').textContent = `Общий прогресс: ${overall.translatedPct}% переведено · ${overall.sameAsRuPct}% как в ru · ${overall.reviewedPct}% проверено`;
    updatePackHeadline();
    refreshPackSelectLabels();
    renderGroupProgress();
  }

  function initPackSelect() {
    const select = $('pack');
    if (!select) return;
    select.innerHTML = '';
    (state.meta.packs ?? []).forEach((pack) => {
      const packRows = state.rows.filter((row) => packMatchesKey(pack, row.key));
      const progress = summarizeRows(packRows);
      const suffix = ` — ${progress.translatedPct}% / ${progress.reviewedPct}%`;
      const assignee = getPackAssignee(pack.id);
      const assigneeSuffix = assignee ? ` · ${assignee}` : '';
      const option = document.createElement('option');
      option.value = pack.id;
      option.textContent = `${pack.title}${suffix}${assigneeSuffix}`;
      option.title = pack.description ?? '';
      select.append(option);
    });
    select.value = global.localStorage.getItem(PACK_KEY) || state.meta.defaultPackId || 'pack-01-core';
  }

  function initGroupSelect() {
    const select = $('group');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="all">Все домены</option>';
    const groups = [...new Set(state.rows.map((row) => row.group))].sort((a, b) => {
      const pa = state.meta.groups[a]?.priority ?? 900;
      const pb = state.meta.groups[b]?.priority ?? 900;
      return pa - pb || a.localeCompare(b);
    });
    groups.forEach((group) => {
      const option = document.createElement('option');
      option.value = group;
      const label = state.meta.groups[group]?.label ?? group;
      option.textContent = label;
      select.append(option);
    });
    if (current) select.value = current;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function yandexTranslateUrl(text) {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) return 'https://translate.yandex.ru/?lang=ru-ce';
    return `https://translate.yandex.ru/?lang=ru-ce&text=${encodeURIComponent(trimmed)}`;
  }

  function createToolButton(label, title) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tool-btn';
    btn.textContent = label;
    if (title) btn.title = title;
    return btn;
  }

  function rowRuKey(row) {
    return String(row.ru ?? '').trim();
  }

  function getDuplicateSiblings(row) {
    const ru = rowRuKey(row);
    if (!ru) return [];
    return state.rows.filter((item) => rowRuKey(item) === ru);
  }

  function buildRuDuplicateIndex() {
    const byRu = new Map();
    for (const item of state.rows) {
      const ru = rowRuKey(item);
      if (!ru) continue;
      if (!byRu.has(ru)) byRu.set(ru, []);
      byRu.get(ru).push(item);
    }
    return byRu;
  }

  function duplicateCountLabel(siblings) {
    const total = siblings.length;
    if (total <= 1) return '';
    const ceVariants = new Set(
      siblings.map((item) => String(item.ce ?? '').trim()).filter(Boolean)
    );
    let text = `${total} таких же`;
    if (ceVariants.size > 1) {
      text += ` · ${ceVariants.size} ${ceVariants.size < 5 ? 'перевода' : 'переводов'}`;
    }
    return text;
  }

  function spreadCeToDuplicates(sourceRow) {
    collectEditorValues();
    const ce = String(sourceRow.ce ?? '').trim();
    if (!ce) {
      flash('Сначала введите чеченский перевод', true);
      return 0;
    }

    const siblings = getDuplicateSiblings(sourceRow);
    const toUpdate = siblings.filter((item) => String(item.ce ?? '').trim() !== ce);
    if (!toUpdate.length) {
      flash('У всех дубликатов уже такой перевод');
      return 0;
    }

    const conflicting = toUpdate.filter((item) => {
      const existing = String(item.ce ?? '').trim();
      return existing && existing !== ce;
    });
    if (conflicting.length) {
      const ok = global.confirm(
        `У ${conflicting.length} ключей другой перевод.\n\nЗаменить на:\n«${truncateText(ce, 80)}»\n\nОтметки «проверено» не меняются.`
      );
      if (!ok) return 0;
    }

    toUpdate.forEach((item) => {
      const prevCe = item.ce ?? '';
      const prevStatus = item.status ?? 'todo';
      item.ce = ce;
      recordChange({
        key: item.key,
        action: 'spread',
        prevCe,
        prevStatus,
        ce,
      });
      updateRowChrome(item.key);
      const editor = document.querySelector(`textarea.editor[data-key="${CSS.escape(item.key)}"]`);
      if (editor) editor.value = ce;
    });

    persistLocal();
    stats();
    return toUpdate.length;
  }

  async function copyText(text) {
    const value = String(text ?? '');
    if (!value.trim()) {
      flash('Нечего копировать', true);
      return false;
    }
    try {
      await navigator.clipboard.writeText(value);
      flash('Скопировано');
      return true;
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.append(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      if (ok) flash('Скопировано');
      else flash('Не удалось скопировать', true);
      return ok;
    }
  }

  let pasteDialogTarget = null;
  let lastBecameVisibleAt = Date.now();

  function setPasteDialogWarning(message) {
    const warn = $('paste-dialog-warn');
    if (!warn) return;
    if (message) {
      warn.textContent = message;
      warn.hidden = false;
    } else {
      warn.textContent = '';
      warn.hidden = true;
    }
  }

  function looksLikeRussianSource(text, row) {
    const trimmed = String(text ?? '').trim();
    const ru = String(row.ru ?? '').trim();
    return Boolean(trimmed && ru && trimmed === ru);
  }

  function applyPastedText(editor, row, text, options = {}) {
    const prevCe = row.ce ?? '';
    const prevStatus = row.status ?? 'todo';
    editor.value = text;
    row.ce = text;
    updateRowChrome(row.key);
    stats();
    if (state.focusedKey === row.key) renderPreview(row);
    persistUiStateSoon();
    recordChange({
      key: row.key,
      action: options.action ?? 'paste',
      prevCe,
      prevStatus,
      ce: text,
    });
  }

  async function readClipboardPlainTextOnce() {
    if (!navigator.clipboard?.readText) return null;
    try {
      return await navigator.clipboard.readText();
    } catch {
      return null;
    }
  }

  async function readClipboardPlainTextFromItems() {
    if (!navigator.clipboard?.read) return null;
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (!item.types.includes('text/plain')) continue;
        const blob = await item.getType('text/plain');
        return await blob.text();
      }
    } catch {
      return null;
    }
    return null;
  }

  async function tryReadClipboardText(options = {}) {
    const retries = options.retries ?? (Date.now() - lastBecameVisibleAt < 4000 ? 4 : 2);
    for (let attempt = 0; attempt < retries; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => global.setTimeout(resolve, 40 * attempt));
      }
      await new Promise((resolve) => global.requestAnimationFrame(resolve));

      const text = (await readClipboardPlainTextOnce()) ?? (await readClipboardPlainTextFromItems());
      if (text != null) return text;
    }
    return null;
  }

  function openPasteDialog(editor, row, options = {}) {
    const dialog = $('paste-dialog');
    const input = $('paste-dialog-input');
    if (!dialog || !input) {
      editor.focus();
      flash('Вставьте в поле вручную (Ctrl+V)', true);
      return;
    }

    pasteDialogTarget = { editor, row };
    input.value = options.initialValue ?? '';
    setPasteDialogWarning(options.warning ?? '');
    dialog.hidden = false;
    global.setTimeout(() => input.focus(), 0);

    void tryReadClipboardText({ retries: 3 }).then((clip) => {
      if (!pasteDialogTarget || pasteDialogTarget.row !== row) return;
      const trimmed = String(clip ?? '').trim();
      if (!trimmed || input.value.trim()) return;
      if (looksLikeRussianSource(trimmed, row)) {
        setPasteDialogWarning(
          'В буфере русский исходник. Скопируйте перевод справа в Яндексе и вставьте сюда.'
        );
        return;
      }
      input.value = trimmed;
      setPasteDialogWarning('');
    });
  }

  function closePasteDialog() {
    const dialog = $('paste-dialog');
    if (dialog) dialog.hidden = true;
    pasteDialogTarget = null;
    setPasteDialogWarning('');
  }

  function applyPasteDialog() {
    const input = $('paste-dialog-input');
    if (!pasteDialogTarget || !input) return false;
    const text = String(input.value).trim();
    if (!text) {
      flash('Вставьте текст перевода', true);
      input.focus();
      return false;
    }
    const { editor, row } = pasteDialogTarget;
    if (looksLikeRussianSource(text, row)) {
      setPasteDialogWarning(
        'Похоже на русский исходник. Скопируйте перевод справа в Яндексе, затем вставьте сюда.'
      );
      flash('Это русский текст — нужен перевод из Яндекса', true, 4000);
      input.focus();
      return false;
    }
    applyPastedText(editor, row, text);
    closePasteDialog();
    flash('Перевод вставлен');
    return true;
  }

  async function pasteIntoEditor(editor, row) {
    state.focusedKey = row.key;

    const clip = await tryReadClipboardText();
    const trimmed = String(clip ?? '').trim();

    if (trimmed && !looksLikeRussianSource(trimmed, row)) {
      applyPastedText(editor, row, trimmed);
      flash('Вставлено из буфера');
      return;
    }

    if (trimmed && looksLikeRussianSource(trimmed, row)) {
      openPasteDialog(editor, row, {
        warning:
          'В буфере русский исходник — скопируйте перевод из Яндекса и вставьте ниже (Ctrl+V).',
      });
      flash('В буфере русский текст — нужен перевод', true, 3500);
      return;
    }

    editor.focus();
    await new Promise((resolve) => global.requestAnimationFrame(resolve));
    const clipAfterFocus = String((await tryReadClipboardText({ retries: 2 })) ?? '').trim();
    if (clipAfterFocus && !looksLikeRussianSource(clipAfterFocus, row)) {
      applyPastedText(editor, row, clipAfterFocus);
      flash('Вставлено из буфера');
      return;
    }

    openPasteDialog(editor, row, {
      warning: 'Буфер недоступен — вставьте перевод вручную (Ctrl+V).',
    });
  }

  async function refreshWorkbench() {
    setSaveFeedback('Обновляем страницу…', 'busy', 0);
    try {
      if ('caches' in global) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(async (name) => {
            const cache = await caches.open(name);
            const entries = await cache.keys();
            await Promise.all(
              entries
                .filter((req) => {
                  const path = new URL(req.url).pathname;
                  return path.includes('/ce-locale/') || path.includes('/admin/');
                })
                .map((req) => cache.delete(req))
            );
          })
        );
      }
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.update()));
      }
    } catch (error) {
      console.warn('Workbench refresh cache clear failed', error);
    }
    const url = new URL(global.location.href);
    url.searchParams.set('r', String(Date.now()));
    global.location.replace(url.toString());
  }

  function openYandexTranslate(text) {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) {
      flash('Нет русского текста', true);
      return;
    }
    global.open(yandexTranslateUrl(trimmed), '_blank', 'noopener,noreferrer');
  }

  function escapeTs(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
  }

  function collectEditorValues() {
    document.querySelectorAll('textarea.editor').forEach((editor) => {
      const row = state.rows.find((item) => item.key === editor.dataset.key);
      if (row) row.ce = editor.value;
    });
  }

  function withTimeout(promise, ms, message) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        global.setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  }

  function utf8ToBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return global.btoa(binary);
  }

  function utf8FromBase64(b64) {
    const binary = global.atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }

  function encodeCloudPayload(inner) {
    const savedAt = inner.savedAt || new Date().toISOString();
    return {
      format: 'b64-v2',
      savedAt,
      rowCount: Array.isArray(inner.rows) ? inner.rows.length : 0,
      body: utf8ToBase64(JSON.stringify(inner)),
    };
  }

  function decodeCloudPayload(stored) {
    if (!stored || typeof stored !== 'object') throw new Error('Пустой снимок из облака');
    if (stored.format === 'b64-v2' && stored.body) {
      return JSON.parse(utf8FromBase64(stored.body));
    }
    return stored;
  }

  function buildCloudPayload() {
    collectEditorValues();
    return encodeCloudPayload({
      version: 2,
      savedAt: new Date().toISOString(),
      rows: state.rows.map((row) => ({
        key: row.key,
        ce: row.ce ?? '',
        status: row.status ?? '',
      })),
    });
  }

  function applyCloudPayload(stored) {
    collectEditorValues();
    const payload = decodeCloudPayload(stored);
    const incoming = Array.isArray(payload.rows) ? payload.rows : null;
    if (!incoming) throw new Error('В облаке нет rows[]');

    const patchByKey = new Map(incoming.map((row) => [row.key, row]));
    state.rows = state.rows.map((row) => {
      const patch = patchByKey.get(row.key);
      if (!patch) return row;
      return {
        ...row,
        ce: mergeCloudCe(row.ce, patch.ce),
        status: mergeWorkflowStatus(row.status, patch.status),
      };
    });

    if (payload.assignees) {
      state.assignees = payload.assignees;
      persistAssignees();
    }
    loadLocalOverrides();
    initPackSelect();
    initGroupSelect();
    applyUiState(loadUiState());
    updateAssigneeField();
    renderGlossary();
    render();
    scrollToFocusedRow();
  }

  async function cloudPull(options = {}) {
    if (!global.AdminSupabase?.loadCeLocaleDraft) {
      throw new Error('Облако не подключено');
    }
    try {
      collectEditorValues();
      const data = await withTimeout(
        global.AdminSupabase.loadCeLocaleDraft(),
        15000,
        'Таймаут загрузки (15 с)'
      );
      if (!data?.payload) {
        if (!options.silent) setSaveFeedback('В облаке пока пусто', 'warn');
        return false;
      }
      if (
        !options.auto &&
        !options.silent &&
        !global.confirm('Заменить текущие строки данными из облака?')
      ) {
        return false;
      }
      state.cloudMeta = { updated_at: data.updated_at, updated_by: data.updated_by };
      applyCloudPayload(data.payload);
      persistLocalSafe();
      if (!options.silent) {
        setSaveFeedback(`Загружено · ${new Date(data.updated_at).toLocaleString('ru-RU')}`, 'ok');
      }
      return true;
    } catch (error) {
      if (!options.silent) {
        setSaveFeedback(error instanceof Error ? error.message : 'Ошибка загрузки', 'err');
      }
      throw error;
    }
  }

  async function cloudSave() {
    if (!global.AdminSupabase?.saveCeLocaleDraft) {
      throw new Error('Облако не подключено');
    }
    const payload = buildCloudPayload();
    await withTimeout(
      global.AdminSupabase.saveCeLocaleDraft(payload),
      20000,
      'Таймаут сохранения (20 с) — проверьте интернет'
    );
    state.cloudMeta = { updated_at: payload.savedAt, updated_by: state.cloudSession?.user?.email };
    return payload;
  }

  async function syncToCloud() {
    if (!state.cloudReady || state.cloudSyncInFlight) return;
    state.cloudSyncInFlight = true;
    setSaveFeedback('Синхронизация с сайтом…', 'busy', 0);
    try {
      const payload = await cloudSave();
      const stamp = new Date(payload.savedAt).toLocaleString('ru-RU');
      setSaveFeedback(`На сайте · ${stamp}`, 'ok');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка синхронизации';
      setSaveFeedback(`Локально сохранено · ${message}`, 'err');
    } finally {
      state.cloudSyncInFlight = false;
    }
  }

  async function refreshCloudSession(options = {}) {
    const session = await global.AdminSupabase.getSession().catch(() => null);
    state.cloudSession = session;
    state.cloudReady = Boolean(session?.access_token);
    if (!state.cloudReady) return false;

    try {
      const data = await withTimeout(
        global.AdminSupabase.loadCeLocaleDraft(),
        15000,
        'Таймаут загрузки (15 с)'
      );
      if (data?.updated_at) {
        state.cloudMeta = { updated_at: data.updated_at, updated_by: data.updated_by };
      }
      if (options.autoPull !== false && !state.cloudBootstrapped && data?.payload) {
        state.cloudBootstrapped = true;
        return cloudPull({ silent: true, auto: true });
      }
      if (data?.payload) state.cloudBootstrapped = true;
      return Boolean(data?.payload);
    } catch (error) {
      if (!options.silent) {
        setSaveFeedback(error instanceof Error ? error.message : 'Облако недоступно', 'warn');
      }
      return false;
    }
  }

  async function initCloud() {
    if (!global.AdminSupabase?.isEnabled?.()) return;
    const client = global.AdminSupabase.getClient();
    client?.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED') return;
      void refreshCloudSession({ autoPull: false, silent: true });
    });
    await refreshCloudSession({ autoPull: true, silent: true });
  }

  async function save(options = {}) {
    if (state.saveBusy) return;
    setSaveBusy(true);
    setSaveFeedback('Сохраняем…', 'busy', 0);

    try {
      collectEditorValues();
      if (options.markFocusedReviewed && state.focusedKey) {
        const row = state.rows.find((item) => item.key === state.focusedKey);
        if (row && !isReviewed(row)) {
          const prevStatus = row.status ?? 'todo';
          const prevCe = row.ce ?? '';
          row.status = 'reviewed';
          recordChange({ key: row.key, action: 'reviewed', prevStatus, prevCe });
        }
      }

      persistLocalSafe();
      stats();
      if (state.focusedKey) updateRowChrome(state.focusedKey);

      if (state.cloudReady) {
        setSaveFeedback(
          options.markFocusedReviewed ? 'Сохранено · синхронизация…' : 'Сохранено · синхронизация…',
          'ok'
        );
        void syncToCloud();
        return;
      }

      setSaveFeedback(
        options.markFocusedReviewed
          ? 'Сохранено локально · войдите в админку для синхронизации'
          : 'Сохранено локально · войдите в админку',
        'warn'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка сохранения';
      setSaveFeedback(message, 'err');
    } finally {
      setSaveBusy(false);
    }
  }

  function focusNext(fromKey) {
    collectEditorValues();
    const pool = state.filtered.length ? state.filtered : state.rows.filter((row) => rowInSelectedPack(row));
    const index = pool.findIndex((row) => row.key === fromKey);
    const next =
      pool.slice(index + 1).find((row) => !isReviewed(row)) ?? pool.find((row) => !isReviewed(row));
    if (!next) {
      flash('Все видимые строки проверены');
      return;
    }
    state.focusedKey = next.key;
    saveUiState();
    render();
    const editor = document.querySelector(`textarea.editor[data-key="${CSS.escape(next.key)}"]`);
    editor?.focus();
    editor?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function exportTs() {
    collectEditorValues();
    const lines = [
      "import type { MessageKey } from '@/locales/ru';",
      '',
      'const ce: Record<MessageKey, string> = {',
    ];
    state.rows.forEach((row, index) => {
      lines.push(`  '${row.key}': '${escapeTs(row.ce)}'${index < state.rows.length - 1 ? ',' : ''}`);
    });
    lines.push('};', '', 'export default ce;', '');
    downloadFile('ce.ts', lines.join('\n'), 'text/typescript;charset=utf-8');
    flash('ce.ts выгружен');
  }

  function exportEntriesJson(rows = state.rows) {
    collectEditorValues();
    const payload = rowsToEntriesObject(rows);
    downloadFile('ce.entries.json', `${JSON.stringify(payload, null, 2)}\n`, 'application/json;charset=utf-8');
    flash('ce.entries.json выгружен');
  }

  function exportPackJson() {
    collectEditorValues();
    const pack = getPackDef(getSelectedPack());
    const rows = state.rows.filter((row) => packMatchesKey(pack, row.key));
    const payload = {
      generatedAt: new Date().toISOString(),
      pack,
      progress: summarizeRows(rows),
      rows,
    };
    downloadFile(`${getSelectedPack()}.json`, `${JSON.stringify(payload, null, 2)}\n`, 'application/json;charset=utf-8');
    flash(`Пакет ${pack?.title ?? ''} выгружен`);
  }

  async function importJsonFile(file) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      state.rows = parsed;
    } else if (Array.isArray(parsed.rows)) {
      state.rows = parsed.rows;
      if (parsed.pack?.id && $('pack')) $('pack').value = parsed.pack.id;
    } else if (parsed && typeof parsed === 'object') {
      state.rows = entriesObjectToRows(parsed);
    } else {
      throw new Error('Неизвестный формат JSON');
    }
    loadLocalOverrides();
    initGroupSelect();
    render();
    flash('JSON импортирован');
  }

  async function loadData() {
    const response = await fetch('./data.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`data.json HTTP ${response.status}`);
    const payload = await response.json();
    state.rows = Array.isArray(payload.rows) ? payload.rows : [];
    state.meta = payload.meta ?? state.meta;
    state.packProgress = payload.packProgress ?? [];
    state.groupProgress = payload.groupProgress ?? [];
    state.glossary = payload.glossary ?? { categories: [] };
    loadLocalOverrides();
    loadAssignees();
    loadHistory();
    initPackSelect();
    initGroupSelect();
    applyUiState(loadUiState());
    updateAssigneeField();
    renderGlossary();
    renderHistory();
    render();
    scrollToFocusedRow();
  }

  function bindUi() {
    $('q')?.addEventListener('input', () => {
      persistUiStateSoon();
      render();
    });
    $('status')?.addEventListener('change', () => {
      saveUiState();
      render();
    });
    $('group')?.addEventListener('change', () => {
      saveUiState();
      render();
    });
    $('reset-filters')?.addEventListener('click', () => resetFilters({ allPacks: true }));
    $('pack')?.addEventListener('change', () => {
      persistLocal();
      updateAssigneeField();
      render();
    });
    $('pack-assignee')?.addEventListener('change', (event) => {
      setPackAssignee(getSelectedPack(), event.target.value);
      initPackSelect();
      $('pack').value = getSelectedPack();
    });
    $('pack-assignee')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        setPackAssignee(getSelectedPack(), event.target.value);
        initPackSelect();
        $('pack').value = getSelectedPack();
        flash('Ответственный сохранён');
      }
    });
    $('glossary-q')?.addEventListener('input', () => {
      persistUiStateSoon();
      renderGlossary();
    });
    document.querySelectorAll('.side-tab').forEach((btn) => {
      btn.addEventListener('click', () => switchSideTab(btn.dataset.sideTab ?? 'preview'));
    });
    $('clear-history')?.addEventListener('click', () => {
      if (!global.confirm('Очистить историю последних изменений?')) return;
      clearHistory();
    });
    $('save')?.addEventListener('click', () => {
      void save();
    });
    $('save-reviewed')?.addEventListener('click', () => {
      void save({ markFocusedReviewed: true });
    });
    $('reset')?.addEventListener('click', () => {
      if (!global.confirm('Удалить локальные правки в этом браузере?')) return;
      global.localStorage.removeItem(STORE_KEY);
      global.localStorage.removeItem(REVIEW_KEY);
      global.localStorage.removeItem(PACK_KEY);
      global.localStorage.removeItem(UI_KEY);
      global.localStorage.removeItem(HISTORY_KEY);
      global.location.reload();
    });
    $('export-ts')?.addEventListener('click', exportTs);
    $('export-entries')?.addEventListener('click', () => exportEntriesJson());
    $('export-pack')?.addEventListener('click', exportPackJson);
    $('import-json-btn')?.addEventListener('click', () => $('import-json')?.click());
    $('import-json')?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        await importJsonFile(file);
      } catch (error) {
        flash(error instanceof Error ? error.message : 'Ошибка импорта', true);
      }
      event.target.value = '';
    });
    $('next-unreviewed')?.addEventListener('click', () => focusNext(state.focusedKey ?? ''));
    $('refresh-app')?.addEventListener('click', () => {
      void refreshWorkbench();
    });
    $('refresh-app-footer')?.addEventListener('click', () => {
      void refreshWorkbench();
    });
    $('paste-dialog-cancel')?.addEventListener('click', closePasteDialog);
    $('paste-dialog-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      applyPasteDialog();
    });
    $('paste-dialog-input')?.addEventListener('input', () => {
      if (!pasteDialogTarget) return;
      const input = $('paste-dialog-input');
      if (!input) return;
      if (looksLikeRussianSource(input.value, pasteDialogTarget.row)) {
        setPasteDialogWarning('Похоже на русский исходник — нужен перевод из Яндекса.');
      } else {
        setPasteDialogWarning('');
      }
    });
    $('paste-dialog')?.addEventListener('click', (event) => {
      if (event.target?.id === 'paste-dialog') closePasteDialog();
    });

    global.document.addEventListener('visibilitychange', () => {
      if (!global.document.hidden) {
        lastBecameVisibleAt = Date.now();
        return;
      }
      flushLocalDraft();
      saveUiState();
    });
    global.window.addEventListener('pagehide', () => {
      flushLocalDraft();
      saveUiState();
    });
    global.window.addEventListener('focus', () => {
      lastBecameVisibleAt = Date.now();
    });

    global.document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save({ markFocusedReviewed: Boolean(event.shiftKey) });
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        void save({ markFocusedReviewed: true });
        focusNext(state.focusedKey ?? '');
      }
      if (event.key === 'Escape') {
        const dialog = $('paste-dialog');
        if (dialog && !dialog.hidden) {
          event.preventDefault();
          closePasteDialog();
        }
      }
    });
  }

  async function boot() {
    bindUi();
    try {
      await loadData();
      await initCloud();
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Не удалось загрузить data.json', true);
    }
  }

  global.CeWorkbench = { boot, save, render, getRows: () => state.rows };
})(window);
