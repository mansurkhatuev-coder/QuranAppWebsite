/**
 * Зачёт №3 · Задание 2 — слово → правила со стр. 68 (повторение).
 * Ученик отмечает все подходящие правила из списка урока 26.
 * По умолчанию 12 слов × 1.5 = 18 баллов.
 */
(function (global) {
  /** Short names as on textbook p.68 (Latin I = Ӏ in the book). */
  const RULES = [
    { id: 'hamza', title: 'ХIамза', page: 9 },
    { id: 'istila', title: 'ИстиIаъ', page: 11 },
    { id: 'article', title: 'Артикль', page: 38 },
    { id: 'madd_article', title: 'Мадд перед артиклем', page: 40 },
    { id: 'lam_allah', title: 'Льам в слове АллахI / АллохIумма', page: 48 },
    { id: 'qalqala', title: 'Къалкъала', page: 49 },
    { id: 'ra', title: 'Правила буквы Ро', page: 51 },
    { id: 'ghunnah_shadda', title: 'Мим и нун с ташдидом', page: 53 },
    { id: 'silent', title: 'Нечитаемая буква', page: 56 },
    { id: 'ikhfa_nun', title: 'Ихфаъ нуна', page: 54 },
    { id: 'idgham_nun', title: 'ИдгIом нуна', page: 57 },
    { id: 'iqlab_nun', title: 'Икълаб нуна', page: 61 },
    { id: 'izhar_nun', title: 'ИзхIар нуна', page: 63 },
    { id: 'ta_marbuta', title: 'Та марбута', page: 62 },
    { id: 'mim_sakin', title: 'Сукунированный мим', page: 65 },
  ];

  const WORDS = [{"id": "1", "arabic": "وَمَنْ عَادَ", "rules": ["izhar_nun"]}, {"id": "2", "arabic": "تُبْتُمْ", "rules": ["qalqala"]}, {"id": "3", "arabic": "وَشَاوِرْهُمْ", "rules": ["ra"]}, {"id": "4", "arabic": "مَآءࣰ ثَجَّاجࣰا", "rules": ["hamza", "ikhfa_nun"]}, {"id": "5", "arabic": "تُقَٰتِلُ", "rules": ["istila"]}, {"id": "6", "arabic": "مِن رِّزْقࣲ", "rules": ["idgham_nun", "istila", "ra"]}, {"id": "7", "arabic": "لَهُمْ ثِيَابࣱ", "rules": ["mim_sakin"]}, {"id": "8", "arabic": "قُلِ ٱللَّهُمَّ", "rules": ["article", "ghunnah_shadda", "istila", "lam_allah"]}, {"id": "9", "arabic": "ٱلْمُزَّمِّلُ", "rules": ["article", "ghunnah_shadda"]}, {"id": "10", "arabic": "عَذْبࣱ فُرَاتࣱ", "rules": ["ikhfa_nun", "ra"]}, {"id": "11", "arabic": "الْمَيْمَنَةِ", "rules": ["article", "ta_marbuta"]}, {"id": "12", "arabic": "بَأْسُهُم بَيْنَهُمْ", "rules": ["hamza", "mim_sakin"]}, {"id": "13", "arabic": "مَن دَسَّٰهَا", "rules": ["ikhfa_nun"]}, {"id": "14", "arabic": "إِذَا يَسْرِ", "rules": ["hamza", "ra"]}, {"id": "15", "arabic": "مُحَمَّدٌ", "rules": ["ghunnah_shadda"]}, {"id": "16", "arabic": "يَوْمُ ٱلْقِيَٰمَةِ", "rules": ["article", "istila", "ta_marbuta"]}, {"id": "17", "arabic": "لَئِن لَّمْ", "rules": ["idgham_nun"]}, {"id": "18", "arabic": "كَتَبَ ٱللَّهُ", "rules": ["article", "lam_allah"]}, {"id": "19", "arabic": "مِن نَّفْسࣲ", "rules": ["ghunnah_shadda", "idgham_nun"]}, {"id": "20", "arabic": "وَأَطَعْنَا", "rules": ["hamza", "istila"]}, {"id": "21", "arabic": "وَمِثْلَهُم مَّعَهُمْ", "rules": ["ghunnah_shadda", "mim_sakin"]}, {"id": "22", "arabic": "كَلِمَةَۢ بَاقِيَةࣰ", "rules": ["iqlab_nun", "istila", "ta_marbuta"]}, {"id": "23", "arabic": "فَأَثَرْنَ", "rules": ["hamza", "ra"]}, {"id": "24", "arabic": "لَعَلَّكُمْ تَهْتَدُونَ", "rules": ["mim_sakin"]}, {"id": "25", "arabic": "يَطْمَعُونَ", "rules": ["istila", "qalqala"]}, {"id": "26", "arabic": "وَاجِفَةٌ", "rules": ["ta_marbuta"]}, {"id": "27", "arabic": "مَلَكࣱ كَرِيمࣱ", "rules": ["ikhfa_nun", "ra"]}, {"id": "28", "arabic": "وَقَالَ أَمْرَهَا", "rules": ["hamza", "istila", "mim_sakin", "ra"]}, {"id": "29", "arabic": "فَاقِعࣱ لَّوْنُهَا", "rules": ["idgham_nun", "istila"]}, {"id": "30", "arabic": "نُمِدُّهُم بِهِ", "rules": ["mim_sakin"]}, {"id": "31", "arabic": "بِذِكْرِ ٱللَّهِ", "rules": ["article", "lam_allah", "ra"]}, {"id": "32", "arabic": "وَإِنْ خِفْتُمْ", "rules": ["hamza", "istila", "izhar_nun"]}, {"id": "33", "arabic": "لَمْ تَمُتْ", "rules": ["mim_sakin"]}, {"id": "34", "arabic": "إِنَّكُمْ", "rules": ["ghunnah_shadda", "hamza"]}, {"id": "35", "arabic": "مِنْ خِلَٰفٍ", "rules": ["istila", "izhar_nun"]}, {"id": "36", "arabic": "مِنۢ بَيْنِنَا", "rules": ["iqlab_nun"]}, {"id": "37", "arabic": "مُرْتَابٌ", "rules": ["ra"]}, {"id": "38", "arabic": "مَن ذَا ٱلَّذِي", "rules": ["article", "ikhfa_nun", "madd_article"]}, {"id": "39", "arabic": "عَلِيمُۢ بِٱلْمُتَّقِينَ", "rules": ["article", "iqlab_nun", "istila"]}, {"id": "40", "arabic": "وَعَمَّٰتُكُمْ", "rules": ["ghunnah_shadda"]}, {"id": "41", "arabic": "وَعَدَ ٱللَّهُ", "rules": ["article", "lam_allah"]}, {"id": "42", "arabic": "كَمْ لَبِثْتَ", "rules": ["mim_sakin"]}, {"id": "43", "arabic": "فَمِنْهُم مُّهْتَدࣲ", "rules": ["ghunnah_shadda", "izhar_nun", "mim_sakin"]}, {"id": "44", "arabic": "يَوْمَـِٕذࣲ يَتَذَكَّرُ", "rules": ["idgham_nun", "ra"]}, {"id": "45", "arabic": "وَاقِعُۢ بِهِمْ", "rules": ["iqlab_nun", "istila"]}, {"id": "46", "arabic": "لَجَمِيعٌ حَٰذِرُونَ", "rules": ["izhar_nun", "ra"]}, {"id": "47", "arabic": "غَلَبَتْ", "rules": ["istila"]}, {"id": "48", "arabic": "يُرِيدُ", "rules": ["ra"]}, {"id": "53", "arabic": "فَتَنفَعَهُ", "rules": ["ikhfa_nun"]}, {"id": "54", "arabic": "أُمِرْتُ", "rules": ["hamza", "ra"]}, {"id": "55", "arabic": "عَذَابࣱ يُخْزِيهِ", "rules": ["idgham_nun", "istila"]}, {"id": "56", "arabic": "نَجَّيْنَٰهُم بِسَحرࣲ", "rules": ["mim_sakin", "ra"]}, {"id": "57", "arabic": "لَكُمْ فَتْحࣱ", "rules": ["mim_sakin"]}, {"id": "58", "arabic": "مِنۢ بَنِي", "rules": ["iqlab_nun"]}, {"id": "59", "arabic": "فَضَّلْنَا", "rules": ["istila"]}, {"id": "60", "arabic": "بِعِلْمِ ٱللَّهِ", "rules": ["article", "lam_allah"]}, {"id": "61", "arabic": "أَمَنَةࣰ نُّعَاسࣰا", "rules": ["ghunnah_shadda", "hamza", "idgham_nun", "ta_marbuta"]}, {"id": "62", "arabic": "سَيُجْزَوْنَ", "rules": ["qalqala"]}, {"id": "63", "arabic": "وَٰحِدَةࣱ", "rules": ["ta_marbuta"]}, {"id": "64", "arabic": "يَنْهَوْنَ", "rules": ["izhar_nun"]}, {"id": "65", "arabic": "لَكُم مَّوْعِدࣰا", "rules": ["ghunnah_shadda", "mim_sakin"]}, {"id": "66", "arabic": "مِن مَّعِينࣲ", "rules": ["ghunnah_shadda", "idgham_nun"]}, {"id": "67", "arabic": "لَفِي خُسْرٍ", "rules": ["istila", "ra"]}, {"id": "68", "arabic": "ثَمَٰنِيَةࣱ", "rules": ["ta_marbuta"]}, {"id": "69", "arabic": "جَزَاءَۢ بِمَا كَانُوا۟", "rules": ["hamza", "iqlab_nun", "silent"]}, {"id": "70", "arabic": "أَصَابَهَا", "rules": ["hamza", "istila"]}, {"id": "71", "arabic": "مَكَانِۢ بَعِيدࣲ", "rules": ["iqlab_nun"]}, {"id": "72", "arabic": "لِمَن شِئْتَ", "rules": ["ikhfa_nun"]}, {"id": "73", "arabic": "حَكِيمٌ عَلِيمࣱ", "rules": ["izhar_nun"]}, {"id": "74", "arabic": "بَأْسُهُم بَيْنَهُمْ", "rules": ["hamza", "mim_sakin"]}, {"id": "75", "arabic": "سُبْحَٰنَكَ ٱللَّهُمَّ", "rules": ["article", "ghunnah_shadda", "lam_allah", "qalqala"]}, {"id": "76", "arabic": "مَا شَهِدْنَا", "rules": ["qalqala"]}, {"id": "77", "arabic": "تَعْرِفُ", "rules": ["ra"]}, {"id": "78", "arabic": "ٱلْوَاقِعَةُ", "rules": ["article", "istila", "ta_marbuta"]}, {"id": "79", "arabic": "عَلَيْكُم بِٱلْحَقِّ", "rules": ["article", "istila", "mim_sakin"]}, {"id": "80", "arabic": "تَحِيَّةࣰ وَسَلَٰمًا", "rules": ["idgham_nun", "ta_marbuta"]}, {"id": "81", "arabic": "ءَايَٰتِۢ بَيِّنَٰتࣲ", "rules": ["hamza", "iqlab_nun"]}, {"id": "82", "arabic": "فَأَنجَيْنَٰكُمْ", "rules": ["hamza", "ikhfa_nun"]}, {"id": "83", "arabic": "فَبَشِّرْهُ", "rules": ["ra"]}, {"id": "84", "arabic": "خَشِيَ", "rules": ["istila"]}, {"id": "85", "arabic": "وَنَطْبَعُ", "rules": ["istila", "qalqala"]}, {"id": "86", "arabic": "بِإِذْنِ ٱللَّهِ", "rules": ["article", "hamza", "lam_allah"]}, {"id": "87", "arabic": "مُخْتَلِفٌ أَلْوَٰنُهُ", "rules": ["hamza", "istila", "izhar_nun"]}, {"id": "88", "arabic": "يُمَتِّعْكُم مَّتَٰعًا", "rules": ["ghunnah_shadda", "mim_sakin"]}, {"id": "89", "arabic": "يُبَيِّن لَّنَا", "rules": ["idgham_nun"]}, {"id": "90", "arabic": "هُم مُّحْسِنُونَ", "rules": ["ghunnah_shadda", "mim_sakin"]}, {"id": "91", "arabic": "مَنۢ بَعَثَنَا", "rules": ["iqlab_nun"]}, {"id": "92", "arabic": "أَرْسَلْنَا", "rules": ["hamza", "ra"]}, {"id": "93", "arabic": "أَنزَلَ ٱللَّهُ", "rules": ["article", "hamza", "ikhfa_nun", "lam_allah"]}, {"id": "94", "arabic": "سَمَّيْتُهَا", "rules": ["ghunnah_shadda"]}, {"id": "95", "arabic": "ءَاذَنتُكُمْ", "rules": ["hamza", "ikhfa_nun"]}, {"id": "96", "arabic": "لَطِيفُۢ بِعِبَادِهِ", "rules": ["iqlab_nun", "istila"]}, {"id": "97", "arabic": "ٱلْعَاجِلَةَ", "rules": ["article", "ta_marbuta"]}, {"id": "98", "arabic": "وَتَنْحِتُونَ", "rules": ["izhar_nun"]}, {"id": "99", "arabic": "ءَامَنَّا", "rules": ["ghunnah_shadda", "hamza"]}, {"id": "100", "arabic": "شِهَابࣱ مُّبِينࣱ", "rules": ["ghunnah_shadda", "idgham_nun"]}];

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

  function pickWords(count) {
    const n = Math.max(1, Math.min(Number(count) || 12, WORDS.length));
    return shuffle(WORDS).slice(0, n);
  }

  function buildTask2Questions(opts) {
    const count = opts?.count != null ? opts.count : 12;
    const points = opts?.points != null ? opts.points : 1.5;
    return pickWords(count).map((word, index) => ({
      type: 'rule_choice',
      prompt: 'Отметьте все правила со стр. 68, которые есть в этом фрагменте.',
      payload: {
        word: word.arabic,
        word_id: word.id,
        options: RULES.map((r) => ({ id: r.id, label: r.title })),
        correct_rule_ids: (word.rules || []).slice(),
      },
      scoring: { points },
      position: index,
    }));
  }

  function lessonDraft() {
    return {
      title: 'Зачёт №3 · Задание 2 (слово → правила стр. 68)',
      subject: 'quran',
      level: 'beginner',
      description:
        'Учебник Медресе 2021, стр. 68–71. Двенадцать слов: отметить все подходящие правила из повторения (урок 26). 18 баллов.',
      questions: buildTask2Questions({ count: 12, points: 1.5 }),
    };
  }

  function renderRuleChoice(container, q, state) {
    const locked = Boolean(state?.locked);
    const selected = new Set((state?.selected || []).map(String));
    const word = String(q?.payload?.word || '');
    const options = Array.isArray(q?.payload?.options) ? q.payload.options : RULES;
    const buttons = options
      .map((opt) => {
        const id = String(opt.id);
        const on = selected.has(id);
        return `<button type="button" class="academy-btn academy-rule-choice${
          on ? ' academy-btn--primary is-selected' : ''
        }" data-rule="${escapeAttr(id)}" ${locked ? 'disabled' : ''} aria-pressed="${
          on ? 'true' : 'false'
        }">${escapeHtml(opt.label || id)}</button>`;
      })
      .join('');

    container.innerHTML = `
      <p class="academy-rule-word" lang="ar" dir="rtl">${escapeHtml(word)}</p>
      <p class="academy-muted academy-rule-hint">Можно отметить несколько правил. Затем нажмите «Ответить».</p>
      <div class="academy-rule-choices academy-rule-choices--many" role="group" aria-label="Правила стр. 68">${buttons}</div>
      <p class="academy-muted academy-letter-count">Отмечено: ${selected.size}</p>
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
