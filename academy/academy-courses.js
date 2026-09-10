/**
 * Shared course taxonomy + lesson ordering for Academy (teacher + public /q/).
 * Тухфа + Муаллим = один курс «Таджвид», как в приложении.
 */
(function (global) {
  const COURSE_ORDER = ['knowledge', 'tajweed', 'madina', 'names99', 'other'];

  const COURSE_META = {
    knowledge: { label: 'Знания', hint: 'Исламская викторина' },
    tajweed: { label: 'Таджвид', hint: 'Тухфа, затем Муаллим — по порядку' },
    madina: { label: 'Мединский арабский', hint: 'Уроки с 1-го по порядку' },
    names99: { label: 'Имена Аллаха', hint: 'Блоки 1:10 … 91:99' },
    other: { label: 'Другие уроки', hint: 'Свои и прочие материалы' },
  };

  function courseKeyFromTitle(title) {
    const t = String(title || '').toLowerCase();
    if (t.includes('знани')) return 'knowledge';
    if (
      t.includes('тухф') ||
      t.includes('туҳф') ||
      t.includes('муаллим') ||
      t.includes('муалим') ||
      (t.includes('таджвид') && !t.includes('медин'))
    ) {
      return 'tajweed';
    }
    if (t.includes('алфавит') && (t.includes('тадж') || t.includes('букв'))) return 'tajweed';
    if (t.includes('медин') || t.includes('мадин')) return 'madina';
    if (t.includes('99') && (t.includes('им') || t.includes('имя') || t.includes('име') || t.includes('аллах'))) {
      return 'names99';
    }
    if (t.includes('имён аллах') || t.includes('имена аллах') || t.startsWith('99 им')) return 'names99';
    return 'other';
  }

  function courseLabel(key) {
    return COURSE_META[key]?.label || key;
  }

  function courseHint(key) {
    return COURSE_META[key]?.hint || '';
  }

  function firstInt(match) {
    if (!match) return null;
    const n = Number(match[1]);
    return Number.isFinite(n) ? n : null;
  }

  /** Tajweed track: 0 = Тухфа, 1 = Муаллим, 2 = прочее таджвид */
  function tajweedTrack(title) {
    const t = String(title || '').toLowerCase();
    if (t.includes('тухф') || t.includes('туҳф')) return 0;
    if (t.includes('муаллим') || t.includes('муалим')) return 1;
    return 2;
  }

  function namesRange(title) {
    const raw = String(title || '');
    const range = raw.match(/(\d+)\s*[–—:\-]\s*(\d+)/);
    if (range) {
      return { from: Number(range[1]), to: Number(range[2]) };
    }
    const lesson = raw.match(/урок\s+(\d+)/i);
    if (lesson) {
      const n = Number(lesson[1]);
      if (!Number.isFinite(n) || n < 1) return null;
      if (n >= 10) return { from: 91, to: 99 };
      return { from: (n - 1) * 10 + 1, to: n * 10 };
    }
    return null;
  }

  function lessonSortTuple(title) {
    const key = courseKeyFromTitle(title);
    const courseIdx = COURSE_ORDER.indexOf(key);
    const t = String(title || '');

    if (key === 'tajweed') {
      const track = tajweedTrack(t);
      const mod = firstInt(t.match(/модул[ьяю]\s*(\d+)/i)) ?? firstInt(t.match(/(\d+)/)) ?? 999;
      return [courseIdx, track, mod, t];
    }
    if (key === 'madina') {
      const num =
        firstInt(t.match(/урок\s+(\d+)/i)) ??
        firstInt(t.match(/·\s*(\d+)/)) ??
        firstInt(t.match(/(\d+)/)) ??
        999;
      return [courseIdx, num, 0, t];
    }
    if (key === 'names99') {
      const range = namesRange(t);
      const from = range?.from ?? 999;
      return [courseIdx, from, range?.to ?? 0, t];
    }
    return [courseIdx, 0, 0, t];
  }

  function compareLessons(a, b) {
    const ta = lessonSortTuple(a?.title || a);
    const tb = lessonSortTuple(b?.title || b);
    for (let i = 0; i < 3; i += 1) {
      if (ta[i] !== tb[i]) return ta[i] - tb[i];
    }
    return String(ta[3]).localeCompare(String(tb[3]), 'ru', { numeric: true, sensitivity: 'base' });
  }

  function sortLessons(lessons) {
    return (lessons || []).slice().sort(compareLessons);
  }

  function lessonDisplayTitle(lessonOrTitle, courseKey) {
    const title = typeof lessonOrTitle === 'string' ? lessonOrTitle : String(lessonOrTitle?.title || '');
    const key = courseKey || courseKeyFromTitle(title);

    if (key === 'names99') {
      const range = namesRange(title);
      if (range) {
        const label = `${range.from}:${range.to}`;
        // Keep a short hint from the original title when it adds meaning (lesson 1).
        const hint = title.split('·').map((p) => p.trim()).filter(Boolean).pop() || '';
        if (hint && !/^\d/.test(hint) && !/^имена\s+\d/i.test(hint) && !/^урок\s+\d/i.test(hint)) {
          return `${label} · ${hint}`;
        }
        if (hint && /^имена\s+\d/i.test(hint)) return label;
        return label;
      }
    }

    if (key === 'madina') {
      const num = firstInt(title.match(/урок\s+(\d+)/i));
      if (num != null) return `Урок ${num}`;
    }

    if (key === 'tajweed') {
      const track = tajweedTrack(title);
      const mod = firstInt(title.match(/модул[ьяю]\s*(\d+)/i));
      const trackLabel = track === 0 ? 'Тухфа' : track === 1 ? 'Муаллим' : 'Таджвид';
      if (mod != null) return `${trackLabel} · модуль ${mod}`;
      return trackLabel;
    }

    const parts = title.split('·').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const rest = parts.slice(1).join(' · ');
      if (rest) return rest;
    }
    return title;
  }

  function groupLessonsByCourse(lessons) {
    const sorted = sortLessons(lessons);
    const groups = [];
    const map = new Map();
    sorted.forEach((lesson) => {
      const key = courseKeyFromTitle(lesson.title);
      if (!map.has(key)) {
        const group = { key, label: courseLabel(key), hint: courseHint(key), lessons: [] };
        map.set(key, group);
        groups.push(group);
      }
      map.get(key).lessons.push(lesson);
    });
    return groups;
  }

  global.AcademyCourses = {
    COURSE_ORDER,
    COURSE_META,
    courseKeyFromTitle,
    courseLabel,
    courseHint,
    namesRange,
    tajweedTrack,
    lessonSortTuple,
    compareLessons,
    sortLessons,
    lessonDisplayTitle,
    groupLessonsByCourse,
  };
})(window);
