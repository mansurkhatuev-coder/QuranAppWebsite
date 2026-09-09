/**
 * Export standalone Academy Live question banks from QuranApp source data.
 *
 * Sources (QuranApp repo):
 * - assets/data/academy/knowledge/questions.json
 * - assets/data/academy/tajweed-beginner/lessons/*.json
 * - assets/data/academy/tuhfat/lessons/*.json
 * - assets/data/academy/madina/lessons/*.json
 * - assets/data/academy/names-course.json + assets/data/names.json
 * - locales/ru.ts (prompt/option labels)
 *
 * Filter: drop context-only prompts (картинка / выше / аудио / где буква …).
 * Output: academy/data/standalone-banks.json + admin/supabase-migration-academy-seed-app-banks.sql
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBSITE_ROOT = path.resolve(__dirname, '..');
const APP_ROOT = path.resolve(WEBSITE_ROOT, '..', 'QuranApp');

const CONTEXT_RE =
  /(выше|ниже|показан|картинк|иконк|на экране|это написани|слуша|аудио|где буква|на картинке|вы видите|перед вами|glyph|displayArabic|iconHint)/iu;

function loadRuMap() {
  const ruPath = path.join(APP_ROOT, 'locales', 'ru.ts');
  const text = fs.readFileSync(ruPath, 'utf8');
  const map = new Map();
  const re = /['"]([^'"]+)['"]\s*:\s*(['"`])([\s\S]*?)\2/g;
  let m;
  while ((m = re.exec(text))) {
    const key = m[1];
    if (!key.startsWith('academy.')) continue;
    let val = m[3];
    val = val.replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    map.set(key, val);
  }
  return map;
}

function t(ru, key, fallback = key) {
  return ru.get(key) || fallback;
}

function standalone(text) {
  if (!text || !String(text).trim()) return false;
  const t = String(text).trim();
  // Incomplete prompts that rely on lesson UI / preceding material
  if (/[…\.…]{1,}$/.test(t) || t.endsWith('...')) return false;
  if (t.length < 12) return false;
  return !CONTEXT_RE.test(t);
}

function sqlStr(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

function dedupe(items, key = 'prompt') {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const k = it[key];
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Deterministic RNG (mulberry32) from string seed */
function rngFromSeed(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rnd) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickDistinct(pool, excludeId, count, rnd) {
  const candidates = pool.filter((n) => n.number !== excludeId);
  return shuffle(candidates, rnd).slice(0, count);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function listJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => path.join(dir, f));
}

function exportKnowledge(ru) {
  const bank = readJson(path.join(APP_ROOT, 'assets/data/academy/knowledge/questions.json'));
  const out = [];
  for (const q of bank.questions || []) {
    const prompt = t(ru, q.questionKey);
    if (!standalone(prompt)) continue;
    const options = (q.options || []).map((o) => ({
      id: o.id,
      label: t(ru, o.labelKey),
    }));
    if (options.length < 2) continue;
    if (!options.some((o) => o.id === q.correctOptionId)) continue;
    out.push({
      id: q.id,
      module: 'knowledge',
      prompt,
      correctOptionId: q.correctOptionId,
      options,
      type: 'single_choice',
    });
  }
  return dedupe(out);
}

function exportTuhfat(ru) {
  const dir = path.join(APP_ROOT, 'assets/data/academy/tuhfat/lessons');
  const out = [];
  for (const file of listJson(dir)) {
    const lesson = readJson(file);
    const lessonId = lesson.id || path.basename(file, '.json');
    for (const q of lesson.quiz || []) {
      if (q.kind && q.kind !== 'pick_option') continue;
      const prompt = t(ru, q.promptKey);
      if (!standalone(prompt)) continue;
      let options = (q.options || []).map((o) => ({
        id: String(o.id),
        label: t(ru, o.labelKey),
      }));
      let correct = String(q.correctOptionId);
      if (correct === 'true' || correct === 'false') {
        if (options.length < 2) {
          options = [
            { id: 'true', label: 'Верно' },
            { id: 'false', label: 'Неверно' },
          ];
        }
      }
      if (options.length < 2) continue;
      if (!options.some((o) => o.id === correct)) continue;
      const type =
        options.length === 2 && options.every((o) => o.id === 'true' || o.id === 'false')
          ? 'true_false'
          : 'single_choice';
      out.push({
        id: q.id || `${lessonId}-${q.promptKey}`,
        module: 'tuhfat',
        lessonId,
        prompt,
        correctOptionId: correct,
        options,
        type,
      });
    }
  }
  return dedupe(out);
}

function exportBeginner(ru) {
  const dir = path.join(APP_ROOT, 'assets/data/academy/tajweed-beginner/lessons');
  const out = [];
  for (const file of listJson(dir)) {
    const lesson = readJson(file);
    const lessonId = lesson.id || path.basename(file, '.json');
    for (const step of lesson.steps || []) {
      if (step.kind !== 'quiz') continue;
      const p = step.payload || {};
      const promptKey = p.questionKey;
      if (!promptKey) continue;
      let prompt = t(ru, promptKey);
      // Glyph/spot quizzes without arabic in text → skip
      if (p.displayArabic) {
        if (!standalone(prompt) && !/[\u0600-\u06FF]/.test(prompt)) {
          // Try to make standalone by inlining arabic
          prompt = `${prompt} (${p.displayArabic})`;
        }
      }
      if (!standalone(prompt)) continue;
      // Reject "где буква" / spot even with arabic — still visual
      if (/где буква|spot/i.test(promptKey) || /где буква/i.test(prompt)) continue;

      const options = (p.options || []).map((o) => ({
        id: String(o.id),
        label: t(ru, o.labelKey),
      }));
      const correctIds = (p.correctOptionIds || []).map(String);
      if (options.length < 2 || !correctIds.length) continue;
      const correct = correctIds[0];
      if (!options.some((o) => o.id === correct)) continue;
      out.push({
        id: step.id || `${lessonId}-${promptKey}`,
        module: 'tajweed-beginner',
        lessonId,
        prompt,
        correctOptionId: correct,
        options,
        type: 'single_choice',
      });
    }
  }
  return dedupe(out);
}

function exportMadina() {
  const dir = path.join(APP_ROOT, 'assets/data/academy/madina/lessons');
  const out = [];
  for (const file of listJson(dir)) {
    const lesson = readJson(file);
    const lessonId = lesson.id || path.basename(file, '.json');
    const lessonNo = Number(String(lessonId).replace(/\D/g, '')) || 0;
    const exercises = lesson.exercises || {};

    const acceptExercise = (ex) => {
      if (!ex || typeof ex !== 'object') return;
      if (ex.kind === 'vocab-quiz') {
        for (const item of ex.items || []) {
          let prompt = item.promptRu || item.instructionRu || 'Что значит это слово?';
          const ar = item.promptAr || item.focusAr || '';
          if (ar) prompt = `${prompt} — ${ar}`;
          if (!standalone(prompt) && !ar) continue;
          if (/на картинке|перед вами/i.test(prompt) && !ar) continue;
          const options = (item.options || []).map((o) => ({
            id: String(o.id),
            label: o.labelRu || o.labelEn || o.labelAr || String(o.id),
          }));
          const correct = String(item.correctOptionId);
          if (options.length < 2 || !options.some((o) => o.id === correct)) continue;
          out.push({
            id: `madina-${lessonId}-${item.id}`,
            module: `madina-${lessonNo || lessonId}`,
            lesson: lessonNo,
            prompt,
            correctOptionId: correct,
            options,
            type: 'single_choice',
            explain: item.explainRu,
          });
        }
        return;
      }
      if (ex.kind === 'single-choice') {
        for (const item of ex.items || []) {
          let prompt = item.promptRu || '';
          const ar = item.focusAr || item.promptAr || '';
          if (ar && !prompt.includes(ar)) prompt = `${prompt} — ${ar}`;
          if (!standalone(prompt)) continue;
          if (/на картинке|перед вами/i.test(prompt) && !ar) continue;
          const options = (item.options || []).map((o) => ({
            id: String(o.id),
            label: o.labelRu || o.labelEn || o.labelAr || String(o.id),
          }));
          const correct = String(item.correctOptionId);
          if (options.length < 2 || !options.some((o) => o.id === correct)) continue;
          out.push({
            id: `madina-${lessonId}-${item.id}`,
            module: `madina-${lessonNo || lessonId}`,
            lesson: lessonNo,
            prompt,
            correctOptionId: correct,
            options,
            type: 'single_choice',
            explain: item.explainRu,
          });
        }
      }
    };

    // Prefer known exercise ids; also scan all exercises
    for (const key of Object.keys(exercises)) {
      if (['ex-identify-objects', 'ex-yesno', 'ex-who', 'ex-gender-sort'].includes(key)) continue;
      acceptExercise(exercises[key]);
    }
  }
  return dedupe(out);
}

function latinForName(name, latinMap) {
  // Prefer standard Latin transliteration; avoid Chechen orthography in names.json
  const fromMap = latinMap?.[String(name.number)];
  if (fromMap) return fromMap;
  return name.transliteration || '';
}

function exportNames99(ru) {
  const course = readJson(path.join(APP_ROOT, 'assets/data/academy/names-course.json'));
  const names = readJson(path.join(APP_ROOT, 'assets/data/names.json'));
  const latinFile = readJson(path.join(APP_ROOT, 'assets/data/names-english-transliteration.v1.json'));
  const latinMap = latinFile.items || {};
  const byNumber = new Map(names.map((n) => [n.number, n]));
  const out = [];

  for (const lesson of course.lessons || []) {
    const nums = lesson.nameNumbers || [];
    const pool = nums.map((n) => byNumber.get(n)).filter(Boolean);
    if (pool.length < 4) continue;
    const lessonNum = Number(String(lesson.id).replace(/\D/g, '')) || 0;
    const lessonTitle =
      t(ru, `academy.names.lesson${lessonNum}Title`) ||
      lesson.titleRu ||
      `Урок ${lessonNum || lesson.id}`;

    for (const name of pool) {
      const latin = latinForName(name, latinMap);
      const rnd = rngFromSeed(`names-live-${lesson.id}-${name.number}`);
      // Type A: Arabic → meaning (RU)
      {
        const distractors = pickDistinct(pool, name.number, 3, rnd);
        if (distractors.length < 3) continue;
        const options = shuffle(
          [
            { id: 'a', label: name.meaning || name.translation, correct: true },
            ...distractors.map((d, i) => ({
              id: String.fromCharCode(98 + i),
              label: d.meaning || d.translation,
              correct: false,
            })),
          ],
          rnd
        );
        const remapped = options.map((o, i) => ({
          id: String.fromCharCode(97 + i),
          label: o.label,
          wasCorrect: o.correct,
        }));
        const correctOptionId = remapped.find((o) => o.wasCorrect).id;
        const prompt = latin
          ? `Что означает имя «${name.arabic}» (${latin})?`
          : `Что означает имя «${name.arabic}»?`;
        out.push({
          id: `names-${lesson.id}-meaning-${name.number}`,
          module: `names-${lesson.id}`,
          lessonId: lesson.id,
          lessonTitle,
          prompt,
          correctOptionId,
          options: remapped.map(({ id, label }) => ({ id, label })),
          type: 'single_choice',
        });
      }

      // Type B: meaning → Arabic (every other name)
      if (name.number % 2 === 0) {
        const rnd2 = rngFromSeed(`names-live-ar-${lesson.id}-${name.number}`);
        const distractors = pickDistinct(pool, name.number, 3, rnd2);
        if (distractors.length < 3) continue;
        const labelOf = (n) => {
          const lat = latinForName(n, latinMap);
          return lat ? `${n.arabic} — ${lat}` : n.arabic;
        };
        const options = shuffle(
          [
            { id: 'a', label: labelOf(name), correct: true },
            ...distractors.map((d, i) => ({
              id: String.fromCharCode(98 + i),
              label: labelOf(d),
              correct: false,
            })),
          ],
          rnd2
        );
        const remapped = options.map((o, i) => ({
          id: String.fromCharCode(97 + i),
          label: o.label,
          wasCorrect: o.correct,
        }));
        const correctOptionId = remapped.find((o) => o.wasCorrect).id;
        const meaning = name.meaning || name.translation;
        out.push({
          id: `names-${lesson.id}-arabic-${name.number}`,
          module: `names-${lesson.id}`,
          lessonId: lesson.id,
          lessonTitle,
          prompt: `Какое имя Аллаха означает «${meaning}»?`,
          correctOptionId,
          options: remapped.map(({ id, label }) => ({ id, label })),
          type: 'single_choice',
        });
      }
    }
  }
  return dedupe(out);
}

function toAcademyPayload(q) {
  if (q.type === 'true_false') {
    return {
      type: 'true_false',
      payload: { correct: q.correctOptionId === 'true' },
    };
  }
  return {
    type: 'single_choice',
    payload: {
      options: q.options,
      correct_option_id: q.correctOptionId,
    },
  };
}

function buildLessons(banks) {
  const lessons = [];

  if (banks.knowledge.length) {
    lessons.push({
      title: 'Знания: исламская викторина',
      subject: 'other',
      level: 'beginner',
      description: 'Самостоятельные вопросы из раздела «Знания» приложения',
      questions: banks.knowledge,
    });
  }

  for (const [i, ch] of chunk(banks.tuhfat, 8).entries()) {
    if (!ch.length) continue;
    lessons.push({
      title: `Таджвид (Тухфа) · модуль ${i + 1}`,
      subject: 'quran',
      level: 'beginner',
      description: 'Самостоятельные вопросы Тухфат аль-Атфаль из приложения',
      questions: ch,
    });
  }

  for (const [i, ch] of chunk(banks.tajweedBeginner, 8).entries()) {
    if (!ch.length) continue;
    lessons.push({
      title: `Таджвид (Муаллим) · модуль ${i + 1}`,
      subject: 'quran',
      level: 'beginner',
      description: 'Самостоятельные вопросы курса Муаллим из приложения',
      questions: ch,
    });
  }

  const byLesson = new Map();
  for (const q of banks.madina) {
    const k = q.lesson || 0;
    if (!byLesson.has(k)) byLesson.set(k, []);
    byLesson.get(k).push(q);
  }
  for (const lessonNo of [...byLesson.keys()].sort((a, b) => a - b)) {
    const qs = byLesson.get(lessonNo).slice(0, 10);
    if (qs.length < 3) continue;
    lessons.push({
      title: `Мединский арабский · урок ${lessonNo}`,
      subject: 'arabic',
      level: 'beginner',
      description: `Самостоятельные вопросы урока ${lessonNo} мединского курса`,
      questions: qs,
    });
  }

  const byNamesLesson = new Map();
  for (const q of banks.names99) {
    const k = q.lessonId || 'names';
    if (!byNamesLesson.has(k)) byNamesLesson.set(k, []);
    byNamesLesson.get(k).push(q);
  }
  const namesLessonIds = [...byNamesLesson.keys()].sort((a, b) => {
    const na = Number(String(a).replace(/\D/g, '')) || 0;
    const nb = Number(String(b).replace(/\D/g, '')) || 0;
    return na - nb || String(a).localeCompare(String(b));
  });
  for (const lessonId of namesLessonIds) {
    const qs = byNamesLesson.get(lessonId);
    const capped = qs.slice(0, 12);
    const titleHint = qs[0]?.lessonTitle || lessonId;
    lessons.push({
      title: `99 имён · ${titleHint}`,
      subject: 'aqida',
      level: 'beginner',
      description: 'Детерминированные вопросы по именам Аллаха (из данных приложения)',
      questions: capped,
    });
  }

  return lessons;
}

function writeSql(lessons) {
  const lines = [];
  lines.push('-- Seed Academy lessons from QuranApp course banks (standalone filter).');
  lines.push('-- Sources: knowledge / tuhfat / tajweed-beginner / madina / names99.');
  lines.push('-- Additive: skips if lesson with same title already exists for owner.');
  lines.push('-- No DELETE / TRUNCATE.');
  lines.push('');
  lines.push('do $$');
  lines.push('declare');
  lines.push('  t record;');
  lines.push('  lesson_id uuid;');
  lines.push('begin');
  lines.push('  for t in');
  lines.push('    select user_id from public.academy_teachers where is_active = true');
  lines.push('  loop');

  for (const les of lessons) {
    const title = les.title;
    lines.push('    if not exists (');
    lines.push('      select 1 from public.academy_lessons l');
    lines.push(`      where l.owner_id = t.user_id and l.title = ${sqlStr(title)}`);
    lines.push('    ) then');
    lines.push('      insert into public.academy_lessons (owner_id, title, subject, level, description)');
    lines.push(
      `      values (t.user_id, ${sqlStr(title)}, ${sqlStr(les.subject)}, ${sqlStr(les.level)}, ${sqlStr(les.description)})`
    );
    lines.push('      returning id into lesson_id;');
    lines.push('      insert into public.academy_questions (lesson_id, type, prompt, payload, scoring, position) values');
    const values = les.questions.map((q, pos) => {
      const { type, payload } = toAcademyPayload(q);
      return `      (lesson_id, ${sqlStr(type)}, ${sqlStr(q.prompt)}, ${sqlStr(JSON.stringify(payload))}::jsonb, '{"method":"auto","points":1}'::jsonb, ${pos})`;
    });
    lines.push(values.join(',\n') + ';');
    lines.push('    end if;');
  }

  lines.push('  end loop;');
  lines.push('end $$;');
  lines.push('');
  return lines.join('\n');
}

function main() {
  if (!fs.existsSync(path.join(APP_ROOT, 'assets/data/academy'))) {
    console.error('QuranApp not found at', APP_ROOT);
    process.exit(1);
  }
  const ru = loadRuMap();
  console.log('ru academy keys', [...ru.keys()].filter((k) => k.startsWith('academy.')).length);

  const banks = {
    source: 'QuranApp assets + locales/ru.ts',
    filter: 'standalone only: no picture/audio/above-glyph context',
    knowledge: exportKnowledge(ru),
    tuhfat: exportTuhfat(ru),
    tajweedBeginner: exportBeginner(ru),
    madina: exportMadina(),
    names99: exportNames99(ru),
  };
  banks.stats = {
    knowledge: banks.knowledge.length,
    tuhfat: banks.tuhfat.length,
    tajweedBeginner: banks.tajweedBeginner.length,
    madina: banks.madina.length,
    names99: banks.names99.length,
  };
  console.log('STATS', banks.stats);

  const lessons = buildLessons(banks);
  console.log(
    'lessons',
    lessons.length,
    'total Q',
    lessons.reduce((s, l) => s + l.questions.length, 0)
  );

  const dataDir = path.join(WEBSITE_ROOT, 'academy', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'standalone-banks.json'), JSON.stringify(banks, null, 2), 'utf8');
  fs.writeFileSync(
    path.join(dataDir, 'seed-lessons-plan.json'),
    JSON.stringify(
      lessons.map((l) => ({
        title: l.title,
        subject: l.subject,
        questionCount: l.questions.length,
      })),
      null,
      2
    ),
    'utf8'
  );
  fs.writeFileSync(
    path.join(dataDir, 'README.md'),
    [
      '# Academy Live — банки из приложения',
      '',
      '`standalone-banks.json` — только самостоятельные вопросы:',
      '',
      '- знания, таджвид (Тухфа + Муаллим), мединский курс, 99 имён (детерминированные MCQ)',
      '- без картинки / «выше» / аудио / «где буква»',
      '',
      'Сиды: `admin/supabase-migration-academy-seed-app-banks.sql` (additive).',
      '',
      'Пересборка: `node scripts/export-academy-live-standalone-banks.mjs` (нужен соседний репозиторий `../QuranApp`).',
      '',
    ].join('\n'),
    'utf8'
  );

  const sqlPath = path.join(WEBSITE_ROOT, 'admin', 'supabase-migration-academy-seed-app-banks.sql');
  fs.writeFileSync(sqlPath, writeSql(lessons), 'utf8');
  console.log('wrote', sqlPath);

  for (const l of lessons) {
    console.log(`  ${l.title}: ${l.questions.length} Q`);
  }
}

main();
