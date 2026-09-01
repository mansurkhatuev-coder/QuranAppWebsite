(function initCeWorkbench(global) {
  const STORE_KEY = 'quranapp_ce_workbench_v3';
  const REVIEW_KEY = 'quranapp_ce_workbench_review_v3';
  const PACK_KEY = 'quranapp_ce_workbench_pack_v1';
  const ASSIGNEE_KEY = 'quranapp_ce_workbench_assignees_v1';

  const state = {
    rows: [],
    filtered: [],
    focusedKey: null,
    meta: { packs: [], groups: {}, defaultPackId: 'pack-01-core' },
    glossary: { categories: [] },
    packProgress: [],
    groupProgress: [],
    assignees: {},
    cloudReady: false,
    cloudBusy: false,
    cloudMeta: null,
    saveBusy: false,
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
      if (tone === 'ok') setCloudStatus(message, 'ok');
      else if (tone === 'err') setCloudStatus(message, 'err');
      else if (tone === 'busy') setCloudStatus(message);
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
    return row.status === 'reviewed';
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
      const ceMap = ceRaw ? new Map(JSON.parse(ceRaw).map((x) => [x.key, x.ce])) : new Map();
      const reviewMap = reviewRaw ? new Map(JSON.parse(reviewRaw)) : new Map();
      state.rows.forEach((row) => {
        if (ceMap.has(row.key)) row.ce = ceMap.get(row.key);
        if (reviewMap.has(row.key)) row.status = reviewMap.get(row.key);
      });
      const savedPack = global.localStorage.getItem(PACK_KEY);
      if (savedPack && $('pack')) $('pack').value = savedPack;
    } catch (error) {
      console.warn('Workbench local restore failed', error);
    }
  }

  function persistLocal() {
    const cePayload = state.rows.map((row) => ({ key: row.key, ce: row.ce }));
    const reviewPayload = state.rows
      .filter((row) => row.status === 'reviewed')
      .map((row) => [row.key, row.status]);
    global.localStorage.setItem(STORE_KEY, JSON.stringify(cePayload));
    global.localStorage.setItem(REVIEW_KEY, JSON.stringify(reviewPayload));
    global.localStorage.setItem(PACK_KEY, getSelectedPack());
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
    return {
      total,
      filled,
      empty: total - filled,
      sameAsRu,
      translated,
      reviewed,
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
        status: row.status === 'reviewed' ? 'reviewed' : row.sourceStatus || 'ai-draft',
        note:
          row.status === 'reviewed'
            ? 'Reviewed in translation workbench'
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
          status: row.status === 'reviewed' || row.status === 'manual' ? 'reviewed' : 'todo',
          sourceStatus: row.status ?? 'ai-draft',
          note: row.note ?? '',
          updatedAt: row.updatedAt ?? null,
          group: grp(key),
        };
      });
  }

  function rowBadgeMeta(row) {
    if (isReviewed(row)) return { className: 'badge reviewed', text: 'Проверено' };
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
        const filled = isFilled(row);
        const reviewed = isReviewed(row);
        if (statusFilter === 'empty' && filled) return false;
        if (statusFilter === 'filled' && !filled) return false;
        if (statusFilter === 'reviewed' && !reviewed) return false;
        if (statusFilter === 'todo' && reviewed) return false;
        if (statusFilter === 'same-as-ru' && !isSameAsRu(row)) return false;
        if (statusFilter === 'translated' && !isTranslated(row)) return false;
        if (statusFilter === 'needs-review' && (!filled || reviewed || isSameAsRu(row))) return false;
        if (!term) return true;
        return (
          row.key.toLowerCase().includes(term) ||
          row.ru.toLowerCase().includes(term) ||
          String(row.ce).toLowerCase().includes(term) ||
          String(row.hint ?? '').toLowerCase().includes(term)
        );
      })
      .sort((a, b) => (a.priority ?? 999999) - (b.priority ?? 999999) || a.key.localeCompare(b.key));

    const table = $('table');
    if (!table) return;
    table.innerHTML = '';

    const fragment = document.createDocumentFragment();
    state.filtered.forEach((row) => {
      const article = document.createElement('article');
      article.className = 'row';
      if (!isFilled(row)) article.classList.add('empty');
      if (isSameAsRu(row)) article.classList.add('same-as-ru');
      if (isReviewed(row)) article.classList.add('reviewed');
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
      ru.innerHTML = `<div class="label">Русский</div><div class="source">${escapeHtml(row.ru)}</div>`;

      const editorWrap = document.createElement('div');
      const editorLabel = document.createElement('div');
      editorLabel.className = 'label';
      editorLabel.textContent = 'Нохчийн';
      const editor = document.createElement('textarea');
      editor.className = 'editor';
      editor.value = row.ce ?? '';
      editor.dataset.key = row.key;
      editor.addEventListener('focus', () => {
        state.focusedKey = row.key;
        document.querySelectorAll('.row.focused').forEach((el) => el.classList.remove('focused'));
        article.classList.add('focused');
        renderPreview(row);
      });
      editor.addEventListener('input', () => {
        row.ce = editor.value;
        updateRowChrome(row.key);
        stats();
        if (state.focusedKey === row.key) renderPreview(row);
      });
      editorWrap.append(editorLabel, editor);

      const actions = document.createElement('div');
      actions.className = 'row-actions';
      const reviewBtn = document.createElement('button');
      reviewBtn.type = 'button';
      reviewBtn.className = isReviewed(row) ? 'secondary' : 'primary';
      reviewBtn.textContent = isReviewed(row) ? 'Снять ✓' : 'Проверено ✓';
      reviewBtn.addEventListener('click', () => {
        row.status = isReviewed(row) ? 'todo' : 'reviewed';
        persistLocal();
        render();
        flash(isReviewed(row) ? 'Отмечено проверенным' : 'Снята отметка');
      });
      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'secondary';
      nextBtn.textContent = 'Далее →';
      nextBtn.addEventListener('click', () => focusNext(row.key));
      actions.append(reviewBtn, nextBtn);

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

  function escapeTs(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
  }

  function collectEditorValues() {
    document.querySelectorAll('textarea.editor').forEach((editor) => {
      const row = state.rows.find((item) => item.key === editor.dataset.key);
      if (row) row.ce = editor.value;
    });
  }

  function setCloudStatus(message, tone = '') {
    const el = $('cloud-status');
    if (!el) return;
    el.textContent = message || '';
    el.className = `cloud-status${tone ? ` ${tone}` : ''}`;
  }

  function updateCloudUi() {
    const login = $('cloud-login');
    const actions = $('cloud-actions');
    const user = $('cloud-user');
    const saveBtn = $('cloud-save');
    const pullBtn = $('cloud-pull');
    const signoutBtn = $('cloud-signout');
    const signinBtn = $('cloud-signin');

    const enabled = Boolean(global.AdminSupabase?.isEnabled?.());
    if (!enabled) {
      setCloudStatus('Supabase не настроен — сохранение только в браузере', 'err');
      return;
    }

    if (state.cloudReady) {
      if (login) login.hidden = true;
      if (actions) actions.hidden = false;
      if (user) {
        const email = state.cloudSession?.user?.email || 'админ';
        const stamp = state.cloudMeta?.updated_at
          ? ` · облако ${new Date(state.cloudMeta.updated_at).toLocaleString('ru-RU')}`
          : '';
        user.textContent = `${email}${stamp}`;
      }
    } else {
      if (login) login.hidden = false;
      if (actions) actions.hidden = true;
      if (!state.cloudBusy) setCloudStatus('Войдите тем же email/паролем, что в админке');
    }

    const disabled = state.cloudBusy || state.saveBusy || !state.cloudReady;
    if (saveBtn) saveBtn.disabled = disabled;
    if (pullBtn) pullBtn.disabled = disabled;
    if (signoutBtn) signoutBtn.disabled = state.cloudBusy;
    if (signinBtn) signinBtn.disabled = state.cloudBusy;
  }

  function buildCloudPayload() {
    collectEditorValues();
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      meta: state.meta,
      glossary: state.glossary,
      assignees: state.assignees,
      rows: state.rows.map((row) => ({
        key: row.key,
        ce: row.ce ?? '',
        ru: row.ru ?? '',
        en: row.en ?? '',
        status: row.status ?? '',
        note: row.note ?? '',
        group: row.group ?? grp(row.key),
        priority: row.priority ?? 999,
      })),
    };
  }

  function applyCloudPayload(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('Пустой снимок из облака');
    const rows = Array.isArray(payload.rows) ? payload.rows : null;
    if (!rows) throw new Error('В облаке нет rows[]');

    state.rows = rows;
    if (payload.meta) state.meta = payload.meta;
    if (payload.glossary) state.glossary = payload.glossary;
    if (payload.assignees) {
      state.assignees = payload.assignees;
      persistAssignees();
    }
    loadLocalOverrides();
    initPackSelect();
    initGroupSelect();
    updateAssigneeField();
    renderGlossary();
    render();
  }

  async function cloudPull(options = {}) {
    if (!global.AdminSupabase?.loadCeLocaleDraft) {
      throw new Error('Облако не подключено');
    }
    state.cloudBusy = true;
    updateCloudUi();
    setCloudStatus('Загружаем из облака…');
    try {
      const data = await global.AdminSupabase.loadCeLocaleDraft();
      if (!data?.payload) {
        if (!options.silent) flash('В облаке пока пусто — сначала сохраните', true);
        setCloudStatus('В облаке пока пусто');
        return false;
      }
      if (
        !options.auto &&
        !options.silent &&
        !global.confirm('Заменить текущие строки данными из облака? Локальные правки в полях будут перезаписаны.')
      ) {
        setCloudStatus('Загрузка отменена');
        return false;
      }
      state.cloudMeta = { updated_at: data.updated_at, updated_by: data.updated_by };
      applyCloudPayload(data.payload);
      persistLocal();
      setCloudStatus(`Загружено из облака · ${new Date(data.updated_at).toLocaleString('ru-RU')}`, 'ok');
      if (!options.silent) flash('Загружено из облака');
      return true;
    } finally {
      state.cloudBusy = false;
      updateCloudUi();
    }
  }

  async function cloudSave(options = {}) {
    if (!global.AdminSupabase?.saveCeLocaleDraft) {
      throw new Error('Облако не подключено');
    }
    state.cloudBusy = true;
    updateCloudUi();
    if (!options.silent) setSaveFeedback('Сохраняем на сайт…', 'busy', 0);
    else setCloudStatus('Сохраняем на сайт…');
    try {
      const payload = buildCloudPayload();
      const savePromise = global.AdminSupabase.saveCeLocaleDraft(payload);
      const timeoutMs = 45000;
      const result = await Promise.race([
        savePromise,
        new Promise((_, reject) => {
          global.setTimeout(() => reject(new Error('Таймаут сохранения (45 с)')), timeoutMs);
        }),
      ]);
      state.cloudMeta = { updated_at: payload.savedAt, updated_by: state.cloudSession?.user?.email };
      const stamp = new Date(payload.savedAt).toLocaleString('ru-RU');
      const message = `Сохранено на сайт · ${stamp}`;
      setCloudStatus(message, 'ok');
      if (!options.silent) setSaveFeedback(message, 'ok');
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка сохранения';
      setCloudStatus(message, 'err');
      if (!options.silent) setSaveFeedback(message, 'err');
      throw error;
    } finally {
      state.cloudBusy = false;
      updateCloudUi();
    }
  }

  async function cloudSignIn() {
    const email = String($('cloud-email')?.value ?? '').trim();
    const password = String($('cloud-password')?.value ?? '');
    if (!email || !password) {
      flash('Введите email и пароль админки', true);
      return;
    }
    state.cloudBusy = true;
    updateCloudUi();
    setCloudStatus('Вход…');
    try {
      await global.AdminSupabase.signIn(email, password);
      await refreshCloudSession({ autoPull: true });
      if ($('cloud-password')) $('cloud-password').value = '';
      flash('Вход выполнен, данные загружены');
    } catch (error) {
      setCloudStatus(error instanceof Error ? error.message : 'Ошибка входа', 'err');
      flash(error instanceof Error ? error.message : 'Ошибка входа', true);
    } finally {
      state.cloudBusy = false;
      updateCloudUi();
    }
  }

  async function cloudSignOut() {
    state.cloudBusy = true;
    updateCloudUi();
    try {
      await global.AdminSupabase.signOut?.();
    } catch {
      // ignore
    }
    state.cloudReady = false;
    state.cloudSession = null;
    state.cloudMeta = null;
    setCloudStatus('Вы вышли — сохранение только в браузере');
    updateCloudUi();
  }

  async function refreshCloudSession(options = {}) {
    const session = await global.AdminSupabase.getSession().catch(() => null);
    state.cloudSession = session;
    state.cloudReady = Boolean(session?.access_token);
    updateCloudUi();
    if (!state.cloudReady) return false;

    try {
      const data = await global.AdminSupabase.loadCeLocaleDraft();
      if (data?.updated_at) {
        state.cloudMeta = { updated_at: data.updated_at, updated_by: data.updated_by };
        updateCloudUi();
      }
      if (options.autoPull !== false && data?.payload) {
        return cloudPull({ silent: true, auto: true });
      }
      if (data?.payload) {
        setCloudStatus(`В облаке · ${new Date(data.updated_at).toLocaleString('ru-RU')}`);
      }
      return Boolean(data?.payload);
    } catch (error) {
      setCloudStatus(error instanceof Error ? error.message : 'Не удалось проверить облако', 'err');
      return false;
    }
  }

  async function initCloud() {
    updateCloudUi();
    if (!global.AdminSupabase?.isEnabled?.()) return;
    await refreshCloudSession({ autoPull: true });
  }

  async function save(options = {}) {
    if (state.saveBusy) return;
    setSaveBusy(true);
    setSaveFeedback('Сохраняем…', 'busy', 0);

    try {
      collectEditorValues();
      if (options.markFocusedReviewed && state.focusedKey) {
        const row = state.rows.find((item) => item.key === state.focusedKey);
        if (row) row.status = 'reviewed';
      }

      persistLocalSafe();
      stats();
      if (state.focusedKey) updateRowChrome(state.focusedKey);

      if (state.cloudReady && !options.skipCloud) {
        await cloudSave({ silent: true });
        const message = options.markFocusedReviewed
          ? 'Проверено и сохранено на сайт'
          : 'Сохранено в браузере и на сайт';
        setSaveFeedback(message, 'ok');
        return;
      }

      const message = state.cloudReady
        ? options.markFocusedReviewed
          ? 'Сохранено и отмечено проверенным'
          : 'Сохранено локально'
        : options.markFocusedReviewed
          ? 'Проверено · только в этом браузере (войдите для сохранения на сайт)'
          : 'Сохранено только в этом браузере · войдите ниже для сайта';
      setSaveFeedback(message, state.cloudReady ? 'ok' : 'warn');
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
    initPackSelect();
    initGroupSelect();
    updateAssigneeField();
    renderGlossary();
    render();
  }

  function bindUi() {
    $('q')?.addEventListener('input', render);
    $('status')?.addEventListener('change', render);
    $('group')?.addEventListener('change', render);
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
    $('glossary-q')?.addEventListener('input', renderGlossary);
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
    $('cloud-signin')?.addEventListener('click', () => {
      void cloudSignIn();
    });
    $('cloud-signout')?.addEventListener('click', () => {
      void cloudSignOut();
    });
    $('cloud-save')?.addEventListener('click', () => {
      void cloudSave();
    });
    $('cloud-pull')?.addEventListener('click', () => {
      void cloudPull();
    });
    $('cloud-password')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void cloudSignIn();
      }
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
