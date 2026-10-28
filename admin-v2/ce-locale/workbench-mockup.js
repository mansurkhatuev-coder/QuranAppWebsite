(function initCeWorkbenchMockup(global) {
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function displayText(row) {
    const ce = String(row.ce ?? '').trim();
    return ce || String(row.ru ?? '');
  }

  function lookupTabLabels(rows) {
    const tabs = {};
    for (const row of rows) {
      if (!row.key.startsWith('tabs.')) continue;
      const id = row.key.replace('tabs.', '');
      tabs[id] = displayText(row);
    }
    return tabs;
  }

  function tabBarHtml(activeKey, tabs) {
    const order = ['home', 'namaz', 'quran', 'azkar', 'settings'];
    const labels = order.map((id) => ({
      id,
      label: tabs[id] || id,
      active: activeKey === `tabs.${id}`,
    }));
  return `
    <div class="mockup-tabs">
      ${labels
        .map(
          (tab) =>
            `<div class="mockup-tab${tab.active ? ' active' : ''}"><span class="mockup-tab-dot"></span><span class="mockup-tab-label">${escapeHtml(tab.label)}</span></div>`
        )
        .join('')}
    </div>`;
  }

  function shell(title, body, footer = '') {
    return `
      <div class="mockup-phone">
        <div class="mockup-notch"></div>
        <div class="mockup-status">9:41</div>
        ${title ? `<div class="mockup-title">${escapeHtml(title)}</div>` : ''}
        <div class="mockup-body">${body}</div>
        ${footer}
      </div>`;
  }

  function pickTemplate(row) {
    const key = row.key;
    const group = row.group;
    if (key.startsWith('tabs.')) return 'tabs';
    if (key.startsWith('topBar.')) return 'topBar';
    if (key.startsWith('home.')) return 'home';
    if (group === 'settings' || key.startsWith('settings.')) return 'settings';
    if (group === 'namaz' || group === 'prayer') return 'prayer';
    if (group === 'quran' || group === 'sura' || group === 'mushaf') return 'quran';
    if (group === 'azkar' || group === 'ruqya') return 'azkar';
    if (group === 'playback' || group === 'listening' || group === 'audio') return 'player';
    if (group === 'share') return 'share';
    if (group === 'academy') return 'academy';
    if (group === 'common') return 'button';
    if (key.includes('empty') || key.includes('Empty')) return 'empty';
    if (key.includes('error') || key.includes('Error')) return 'alert';
    if (key.includes('title') || key.includes('Title')) return 'title';
    return 'list';
  }

  function render(row, allRows = []) {
    const text = displayText(row);
    const template = pickTemplate(row);
    const tabs = lookupTabLabels(allRows);

    switch (template) {
      case 'tabs':
        return shell('', tabBarHtml(row.key, tabs), tabBarHtml(row.key, tabs));

      case 'topBar':
        return shell(text, '<div class="mockup-content muted">…содержимое экрана…</div>');

      case 'home':
        return shell(
          tabs.home || 'Коьрта',
          `
          <div class="mockup-card hero">
            <div class="mockup-card-kicker">Маор</div>
            <div class="mockup-card-main">${escapeHtml(text)}</div>
            <div class="mockup-card-sub muted">12:34 · Магриб</div>
          </div>
          <div class="mockup-card">
            <div class="mockup-card-main muted">Аьят дийнан…</div>
          </div>
        `,
          tabBarHtml('tabs.home', tabs)
        );

      case 'settings':
        return shell(
          tabs.settings || 'ГIирсаш',
          `
          <div class="mockup-list">
            <div class="mockup-row active">
              <span class="mockup-row-label">${escapeHtml(text)}</span>
              <span class="mockup-row-value">›</span>
            </div>
            <div class="mockup-row muted"><span>Тема</span><span>Теман</span></div>
            <div class="mockup-row muted"><span>Язык</span><span>Нохчийн</span></div>
          </div>
        `,
          tabBarHtml('tabs.settings', tabs)
        );

      case 'prayer':
        return shell(
          tabs.namaz || 'Маор',
          `
          <div class="mockup-prayer-grid">
            <div class="mockup-prayer-item muted"><span>Фаджр</span><span>05:12</span></div>
            <div class="mockup-prayer-item active"><span>${escapeHtml(text)}</span><span>12:34</span></div>
            <div class="mockup-prayer-item muted"><span>Аср</span><span>15:40</span></div>
          </div>
        `,
          tabBarHtml('tabs.namaz', tabs)
        );

      case 'quran':
        return shell(
          tabs.quran || 'Куран',
          `
          <div class="mockup-sura-row active">
            <span class="mockup-sura-num">1</span>
            <span class="mockup-sura-name">${escapeHtml(text)}</span>
          </div>
          <div class="mockup-sura-row muted"><span class="mockup-sura-num">2</span><span>Аль-Бакъара</span></div>
        `,
          tabBarHtml('tabs.quran', tabs)
        );

      case 'azkar':
        return shell(
          tabs.azkar || 'Азkarash',
          `
          <div class="mockup-card">
            <div class="mockup-card-main">${escapeHtml(text)}</div>
            <div class="mockup-card-sub muted">33× · утро</div>
          </div>
        `,
          tabBarHtml('tabs.azkar', tabs)
        );

      case 'player':
        return shell(
          'Сура 1',
          `
          <div class="mockup-player">
            <div class="mockup-player-title">${escapeHtml(text)}</div>
            <div class="mockup-player-bar"><div></div></div>
            <div class="mockup-player-controls">⏮ ▶ ⏭</div>
          </div>
        `
        );

      case 'share':
        return shell(
          'Поделиться',
          `<div class="mockup-share-card"><div class="mockup-share-text">${escapeHtml(text)}</div></div>`
        );

      case 'academy':
        return shell(
          'Академи',
          `
          <div class="mockup-quiz">
            <div class="mockup-quiz-q">${escapeHtml(text)}</div>
            <div class="mockup-quiz-opt muted">Вариант A</div>
            <div class="mockup-quiz-opt muted">Вариант B</div>
          </div>
        `
        );

      case 'button':
        return shell(
          '',
          `<div class="mockup-actions"><button type="button" class="mockup-btn secondary muted">Ца оьшу</button><button type="button" class="mockup-btn primary">${escapeHtml(text)}</button></div>`
        );

      case 'alert':
        return shell(
          '',
          `<div class="mockup-alert"><div class="mockup-alert-text">${escapeHtml(text)}</div><button type="button" class="mockup-btn primary">OK</button></div>`
        );

      case 'empty':
        return shell(
          '',
          `<div class="mockup-empty"><div class="mockup-empty-icon">○</div><div>${escapeHtml(text)}</div></div>`
        );

      case 'title':
        return shell(text, '<div class="mockup-content muted">…</div>');

      case 'list':
      default:
        return shell(
          row.groupLabel || row.group || 'Экран',
          `<div class="mockup-list"><div class="mockup-row active"><span>${escapeHtml(text)}</span><span>›</span></div><div class="mockup-row muted"><span>Другой пункт</span><span>›</span></div></div>`
        );
    }
  }

  function templateLabel(row) {
    const labels = {
      tabs: 'Нижняя вкладка',
      topBar: 'Шапка экрана',
      home: 'Карточка на главной',
      settings: 'Строка настроек',
      prayer: 'Расписание намаза',
      quran: 'Список сур',
      azkar: 'Карточка азкара',
      player: 'Плеер',
      share: 'Шаринг-карточка',
      academy: 'Вопрос академии',
      button: 'Кнопка / диалог',
      alert: 'Сообщение об ошибке',
      empty: 'Пустое состояние',
      title: 'Заголовок',
      list: 'Строка списка',
    };
    return labels[pickTemplate(row)] ?? 'Экран приложения';
  }

  global.CeWorkbenchMockup = { render, templateLabel, displayText };
})(window);
