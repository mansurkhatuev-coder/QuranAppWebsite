/**
 * Зачёт №3 · Задание 2 — слово → правило сукунированного нуна (стр. 70–71).
 * Ученик выбирает одно из четырёх правил. По умолчанию 12 слов × 1.5 = 18 баллов.
 */
(function (global) {
  const RULES = [
    { id: 'izhar', title: 'ИзхӀар' },
    { id: 'idgham', title: 'ИдгӀом' },
    { id: 'iqlab', title: 'Икълаб' },
    { id: 'ikhfa', title: 'Ихфаъ' },
  ];

  /** Words with auto-tagged nun/tanween rules (subset of tables 1–2). */
  const WORDS = [
    { id: '1', arabic: 'وَمَنْ عَادَ', rule: 'izhar' },
    { id: '4', arabic: 'مَآءࣰ ثَجَّاجࣰا', rule: 'ikhfa' },
    { id: '6', arabic: 'مِن رِّزْقࣲ', rule: 'idgham' },
    { id: '10', arabic: 'عَذْبࣱ فُرَاتࣱ', rule: 'ikhfa' },
    { id: '13', arabic: 'مَن دَسَّٰهَا', rule: 'ikhfa' },
    { id: '17', arabic: 'لَئِن لَّمْ', rule: 'idgham' },
    { id: '19', arabic: 'مِن نَّفْسࣲ', rule: 'idgham' },
    { id: '22', arabic: 'كَلِمَةَۢ بَاقِيَةࣰ', rule: 'iqlab' },
    { id: '27', arabic: 'مَلَكࣱ كَرِيمࣱ', rule: 'ikhfa' },
    { id: '29', arabic: 'فَاقِعࣱ لَّوْنُهَا', rule: 'idgham' },
    { id: '32', arabic: 'وَإِنْ خِفْتُمْ', rule: 'izhar' },
    { id: '35', arabic: 'مِنْ خِلَٰفٍ', rule: 'izhar' },
    { id: '36', arabic: 'مِنۢ بَيْنِنَا', rule: 'iqlab' },
    { id: '38', arabic: 'مَن ذَا ٱلَّذِي', rule: 'ikhfa' },
    { id: '39', arabic: 'عَلِيمُۢ بِٱلْمُتَّقِينَ', rule: 'iqlab' },
    { id: '43', arabic: 'فَمِنْهُم مُّهْتَدࣲ', rule: 'izhar' },
    { id: '44', arabic: 'يَوْمَـِٕذࣲ يَتَذَكَّرُ', rule: 'idgham' },
    { id: '45', arabic: 'وَاقِعُۢ بِهِمْ', rule: 'iqlab' },
    { id: '46', arabic: 'لَجَمِيعٌ حَٰذِرُونَ', rule: 'izhar' },
    { id: '53', arabic: 'فَتَنفَعَهُ', rule: 'ikhfa' },
    { id: '55', arabic: 'عَذَابࣱ يُخْزِيهِ', rule: 'idgham' },
    { id: '58', arabic: 'مِنۢ بَنِي', rule: 'iqlab' },
    { id: '61', arabic: 'أَمَنَةࣰ نُّعَاسࣰا', rule: 'idgham' },
    { id: '64', arabic: 'يَنْهَوْنَ', rule: 'izhar' },
    { id: '66', arabic: 'مِن مَّعِينࣲ', rule: 'idgham' },
    { id: '69', arabic: 'جَزَاءَۢ بِمَا كَانُوا۟', rule: 'iqlab' },
    { id: '71', arabic: 'مَكَانِۢ بَعِيدࣲ', rule: 'iqlab' },
    { id: '72', arabic: 'لِمَن شِئْتَ', rule: 'ikhfa' },
    { id: '73', arabic: 'حَكِيمٌ عَلِيمࣱ', rule: 'izhar' },
    { id: '80', arabic: 'تَحِيَّةࣰ وَسَلَٰمًا', rule: 'idgham' },
    { id: '81', arabic: 'ءَايَٰتِۢ بَيِّنَٰتࣲ', rule: 'iqlab' },
    { id: '82', arabic: 'فَأَنجَيْنَٰكُمْ', rule: 'ikhfa' },
    { id: '87', arabic: 'مُخْتَلِفٌ أَلْوَٰنُهُ', rule: 'izhar' },
    { id: '89', arabic: 'يُبَيِّن لَّنَا', rule: 'idgham' },
    { id: '91', arabic: 'مَنۢ بَعَثَنَا', rule: 'iqlab' },
    { id: '93', arabic: 'أَنزَلَ ٱللَّهُ', rule: 'ikhfa' },
    { id: '95', arabic: 'ءَاذَنتُكُمْ', rule: 'ikhfa' },
    { id: '96', arabic: 'لَطِيفُۢ بِعِبَادِهِ', rule: 'iqlab' },
    { id: '98', arabic: 'وَتَنْحِتُونَ', rule: 'izhar' },
    { id: '100', arabic: 'شِهَابࣱ مُّبِينࣱ', rule: 'idgham' },
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

  function ruleTitle(id) {
    const hit = RULES.find((r) => r.id === id);
    return hit ? hit.title : id;
  }

  /** Prefer a mix of all four rules when picking N words. */
  function pickWords(count) {
    const n = Math.max(1, Math.min(Number(count) || 12, WORDS.length));
    const byRule = {};
    RULES.forEach((r) => {
      byRule[r.id] = shuffle(WORDS.filter((w) => w.rule === r.id));
    });
    const picked = [];
    const used = new Set();
    // round-robin so each rule appears when possible
    let guard = 0;
    while (picked.length < n && guard < n * 8) {
      guard += 1;
      for (const r of RULES) {
        if (picked.length >= n) break;
        const pool = byRule[r.id] || [];
        while (pool.length) {
          const w = pool.pop();
          if (!used.has(w.id)) {
            used.add(w.id);
            picked.push(w);
            break;
          }
        }
      }
    }
    if (picked.length < n) {
      shuffle(WORDS).forEach((w) => {
        if (picked.length >= n) return;
        if (used.has(w.id)) return;
        used.add(w.id);
        picked.push(w);
      });
    }
    return shuffle(picked).slice(0, n);
  }

  function buildTask2Questions(opts) {
    const count = opts?.count != null ? opts.count : 12;
    const points = opts?.points != null ? opts.points : 1.5;
    return pickWords(count).map((word, index) => ({
      type: 'rule_choice',
      prompt: 'Какое правило сукунированного нуна / танвина в этом фрагменте?',
      payload: {
        word: word.arabic,
        word_id: word.id,
        options: RULES.map((r) => ({ id: r.id, label: r.title })),
        correct_rule_id: word.rule,
      },
      scoring: { points },
      position: index,
    }));
  }

  function lessonDraft() {
    return {
      title: 'Зачёт №3 · Задание 2 (слово → правило)',
      subject: 'quran',
      level: 'beginner',
      description:
        'Учебник Медресе 2021, стр. 70–71. Двенадцать слов: выбрать ИзхӀар / ИдгӀом / Икълаб / Ихфаъ. 18 баллов.',
      questions: buildTask2Questions({ count: 12, points: 1.5 }),
    };
  }

  function renderRuleChoice(container, q, state) {
    const locked = Boolean(state?.locked);
    const selected = state?.selected ? String(state.selected) : '';
    const word = String(q?.payload?.word || '');
    const options = Array.isArray(q?.payload?.options) ? q.payload.options : RULES;
    const buttons = options
      .map((opt) => {
        const id = String(opt.id);
        const on = selected === id;
        return `<button type="button" class="academy-btn academy-rule-choice${
          on ? ' academy-btn--primary is-selected' : ''
        }" data-rule="${escapeAttr(id)}" ${locked ? 'disabled' : ''} aria-pressed="${
          on ? 'true' : 'false'
        }">${escapeHtml(opt.label || id)}</button>`;
      })
      .join('');

    container.innerHTML = `
      <p class="academy-rule-word" lang="ar" dir="rtl">${escapeHtml(word)}</p>
      <p class="academy-muted academy-rule-hint">Выберите одно правило, затем нажмите «Ответить».</p>
      <div class="academy-rule-choices" role="group" aria-label="Правила нуна">${buttons}</div>
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

  global.AcademyZahetTask2 = {
    RULES,
    WORDS,
    ruleTitle,
    pickWords,
    buildTask2Questions,
    lessonDraft,
    renderRuleChoice,
    shuffle,
  };
})(window);
