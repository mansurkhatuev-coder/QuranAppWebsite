/**
 * Зачёт №3 · Задание 1 — сукунированный нун (учебник Медресе 2021, стр. 69).
 * Ученик для каждого правила отмечает буквы на сетке алфавита.
 */
(function (global) {
  /** Classic 28 letters used with نْ / tanween (ء instead of ا). */
  const ALPHABET = [
    'ء',
    'ب',
    'ت',
    'ث',
    'ج',
    'ح',
    'خ',
    'د',
    'ذ',
    'ر',
    'ز',
    'س',
    'ش',
    'ص',
    'ض',
    'ط',
    'ظ',
    'ع',
    'غ',
    'ف',
    'ق',
    'ك',
    'ل',
    'م',
    'ن',
    'ه',
    'و',
    'ي',
  ];

  const RULES = [
    {
      id: 'izhar',
      title: 'ИзхIар',
      prompt: 'Отметьте все буквы правила «ИзхIар» сукунированного нуна. Затем нажмите «Готово».',
      correct: ['ء', 'ه', 'ع', 'ح', 'غ', 'خ'],
      points: 2.5,
    },
    {
      id: 'idgham',
      title: 'ИдгIом',
      prompt: 'Отметьте все буквы правила «ИдгIом» сукунированного нуна. Затем нажмите «Готово».',
      correct: ['ي', 'ر', 'م', 'ل', 'و', 'ن'],
      points: 2.5,
    },
    {
      id: 'iqlab',
      title: 'Икълаб',
      prompt: 'Отметьте букву правила «Икълаб» сукунированного нуна. Затем нажмите «Готово».',
      correct: ['ب'],
      points: 2.5,
    },
    {
      id: 'ikhfa',
      title: 'Ихфаъ',
      prompt: 'Отметьте все буквы правила «Ихфаъ» сукунированного нуна. Затем нажмите «Готово».',
      correct: ['ت', 'ث', 'ج', 'د', 'ذ', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ف', 'ق', 'ك'],
      points: 2.5,
    },
  ];

  function shuffle(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function buildTask1Questions(opts) {
    const seedShuffle = opts?.shuffle !== false;
    return RULES.map((rule, index) => ({
      type: 'letter_grid',
      prompt: rule.prompt,
      payload: {
        rule_id: rule.id,
        rule_title: rule.title,
        letters: seedShuffle ? shuffle(ALPHABET) : ALPHABET.slice(),
        correct_letters: rule.correct.slice(),
        confirm_label: 'Готово',
      },
      scoring: { points: rule.points },
      position: index,
    }));
  }

  function lessonDraft() {
    return {
      title: 'Зачёт №3 · Задание 1 (нун с сукуном)',
      subject: 'quran',
      level: 'beginner',
      description: 'Учебник Медресе 2021, стр. 69. Отметить буквы для каждого правила сукунированного нуна.',
      questions: buildTask1Questions({ shuffle: true }),
    };
  }

  /** Full Зачёт №3: задание 1 (нун) + задание 2 (правила стр. 68) as one lesson. */
  function examDraft() {
    const part1 = buildTask1Questions({ shuffle: true });
    const build2 = global.AcademyZahetTask2?.buildTask2Questions;
    const part2 = typeof build2 === 'function' ? build2({ count: 12, points: 1.5 }) : [];
    const questions = part1.concat(part2).map((q, position) => ({ ...q, position }));
    return {
      title: 'Зачёт №3 — таджвид',
      subject: 'quran',
      level: 'beginner',
      description:
        'Учебник Медресе 2021, стр. 68–71. Часть 1: буквы сукунированного нуна (10 б.). Часть 2: двенадцать слов → правила стр. 68 (18 б.). Всего 28 баллов.',
      questions,
    };
  }

  /** Shared play UI for letter_grid (join + homework). */
  function renderLetterGrid(container, q, state) {
    const locked = Boolean(state?.locked);
    const selected = new Set((state?.selected || []).map(String));
    const letters = Array.isArray(q?.payload?.letters) ? q.payload.letters : [];
    const ruleTitle = q?.payload?.rule_title ? String(q.payload.rule_title) : '';
    const confirmLabel = String(q?.payload?.confirm_label || 'Готово');
    const confirmed = Boolean(state?.confirmed);

    const cells = letters
      .map((letter) => {
        const L = String(letter);
        const on = selected.has(L);
        return `<button type="button" class="academy-letter-cell${on ? ' is-selected' : ''}" data-letter="${escapeAttr(
          L
        )}" ${locked || confirmed ? 'disabled' : ''} aria-pressed="${on ? 'true' : 'false'}">${escapeHtml(
          L
        )}</button>`;
      })
      .join('');

    container.innerHTML = `
      ${ruleTitle ? `<p class="academy-letter-rule">${escapeHtml(ruleTitle)}</p>` : ''}
      <p class="academy-muted academy-letter-hint">Нажмите буквы, чтобы отметить. Случайный тап можно снять повторным нажатием. Ответ уйдёт только после «${escapeHtml(
        confirmLabel
      )}».</p>
      <div class="academy-letter-grid" role="group" aria-label="Сетка букв">${cells}</div>
      <div class="academy-letter-actions">
        <button type="button" class="academy-btn" data-letter-clear ${
          locked || confirmed || !selected.size ? 'disabled' : ''
        }>Сбросить</button>
        ${
          confirmed
            ? `<button type="button" class="academy-btn" data-letter-edit ${
                locked ? 'disabled' : ''
              }>Изменить</button>`
            : `<button type="button" class="academy-btn academy-btn--primary" data-letter-confirm ${
                locked || !selected.size ? 'disabled' : ''
              }>${escapeHtml(confirmLabel)}</button>`
        }
      </div>
      <p class="academy-muted academy-letter-count">${
        confirmed
          ? 'Выбор подтверждён — нажмите «Ответить», чтобы отправить.'
          : `Отмечено: ${selected.size}`
      }</p>
    `;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, '&#39;');
  }

  global.AcademyZahetTask1 = {
    ALPHABET,
    RULES,
    buildTask1Questions,
    lessonDraft,
    examDraft,
    renderLetterGrid,
    shuffle,
  };
})(window);
