/**
 * Public async hubs (homework sets): catalog, self-paced runs, student role.
 * Uses the same academy_sessions / participants / answers tables with pacing='async'.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { publicQuestion, scoreAnswer } from './scoring.ts';

type JsonFn = (body: unknown, status?: number) => Response;

export type PublicAsyncDeps = {
  json: JsonFn;
  sha256Hex: (value: string) => Promise<string>;
  randomToken: () => string;
  randomCode: () => string;
  requireTeacher: (db: SupabaseClient, userId: string) => Promise<{ user_id: string; display_name: string; is_active: boolean }>;
  loadSession: (db: SupabaseClient, sessionId: string) => Promise<Record<string, unknown> | null>;
  settingsDefaults: (input: Record<string, unknown> | null | undefined) => Record<string, unknown>;
  publicStudentAnswer: (ans: Record<string, unknown> | null, revealCorrect: boolean) => Record<string, unknown> | null;
  enrichResultsAnswers: (
    session: Record<string, unknown>,
    answers: Array<Record<string, unknown>>,
  ) => Array<Record<string, unknown>>;
  buildResultsQuestions: (session: Record<string, unknown>) => Array<Record<string, unknown>>;
  canHost: (db: SupabaseClient, sessionId: string, userId: string) => Promise<boolean>;
};

function hubPublicUrl(token: string) {
  return `https://waydean.ru/q/?t=${encodeURIComponent(token)}`;
}

function randomHubToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function loadHubByToken(db: SupabaseClient, token: string) {
  const { data, error } = await db
    .from('academy_public_hubs')
    .select('id, owner_id, title, token, is_open, settings, updated_at')
    .eq('token', token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function loadHubLessons(db: SupabaseClient, hubId: string) {
  const { data: links, error } = await db
    .from('academy_public_hub_lessons')
    .select('lesson_id, position')
    .eq('hub_id', hubId)
    .order('position', { ascending: true });
  if (error) throw new Error(error.message);
  const ids = (links || []).map((l) => l.lesson_id);
  if (!ids.length) return [] as Array<Record<string, unknown>>;

  const { data: lessons, error: lErr } = await db
    .from('academy_lessons')
    .select('id, title, subject, level, description')
    .in('id', ids);
  if (lErr) throw new Error(lErr.message);
  const map = new Map((lessons || []).map((l) => [l.id, l]));
  const rows = (links || [])
    .map((link, i) => {
      const lesson = map.get(link.lesson_id);
      if (!lesson) return null;
      return {
        lesson_id: lesson.id,
        title: lesson.title,
        subject: lesson.subject,
        level: lesson.level,
        description: lesson.description || '',
        position: link.position ?? i,
        question_count: null as number | null,
      };
    })
    .filter(Boolean) as Array<Record<string, unknown>>;

  // Stable curriculum order (names 1:10…, madina 1…, tuhfa then muallim).
  return rows.sort((a, b) => compareLessonTitlesServer(String(a.title), String(b.title)));
}

function compareLessonTitlesServer(aTitle: string, bTitle: string) {
  const rank = (title: string): number[] => {
    const t = title.toLowerCase();
    let course = 9;
    if (t.includes('знани')) course = 0;
    else if (t.includes('тухф') || t.includes('туаллим') || t.includes('муаллим') || t.includes('муалим') || t.includes('таджвид')) {
      course = 1;
    } else if (t.includes('медин') || t.includes('мадин')) course = 2;
    else if (t.includes('99') || t.includes('имён') || t.includes('имена')) course = 3;

    let track = 0;
    if (course === 1) {
      if (t.includes('тухф')) track = 0;
      else if (t.includes('муаллим') || t.includes('муалим')) track = 1;
      else track = 2;
    }

    let num = 999;
    if (course === 3) {
      const range = title.match(/(\d+)\s*[–—:\-]\s*(\d+)/);
      if (range) num = Number(range[1]);
      else {
        const lesson = title.match(/урок\s+(\d+)/i);
        if (lesson) {
          const n = Number(lesson[1]);
          num = n >= 10 ? 91 : (n - 1) * 10 + 1;
        }
      }
    } else if (course === 2) {
      const lesson = title.match(/урок\s+(\d+)/i);
      if (lesson) num = Number(lesson[1]);
    } else if (course === 1) {
      const mod = title.match(/модул[ьяю]\s*(\d+)/i);
      if (mod) num = Number(mod[1]);
    }
    return [course, track, num];
  };
  const a = rank(aTitle);
  const b = rank(bTitle);
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return aTitle.localeCompare(bTitle, 'ru', { numeric: true });
}

async function attachQuestionCounts(db: SupabaseClient, lessons: Array<Record<string, unknown>>) {
  const ids = lessons.map((l) => String(l.lesson_id));
  if (!ids.length) return lessons;
  const { data } = await db.from('academy_questions').select('lesson_id').in('lesson_id', ids);
  const counts: Record<string, number> = {};
  (data || []).forEach((row) => {
    const id = String(row.lesson_id);
    counts[id] = (counts[id] || 0) + 1;
  });
  return lessons.map((l) => ({
    ...l,
    question_count: counts[String(l.lesson_id)] || 0,
  }));
}

export async function handleHubGet(
  db: SupabaseClient,
  userId: string,
  _body: Record<string, unknown>,
  deps: PublicAsyncDeps,
) {
  await deps.requireTeacher(db, userId);
  const { data: hubs, error } = await db
    .from('academy_public_hubs')
    .select('id, title, token, is_open, settings, updated_at, created_at')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false })
    .limit(5);
  if (error) return deps.json({ error: 'hub_load_failed' }, 500);
  const hub = (hubs && hubs[0]) || null;
  if (!hub) {
    return deps.json({ hub: null, lessons: [], public_url: null });
  }
  let lessons = await loadHubLessons(db, hub.id);
  lessons = await attachQuestionCounts(db, lessons);
  return deps.json({
    hub,
    lessons,
    public_url: hubPublicUrl(hub.token),
  });
}

export async function handleHubUpsert(
  db: SupabaseClient,
  userId: string,
  body: Record<string, unknown>,
  deps: PublicAsyncDeps,
) {
  await deps.requireTeacher(db, userId);
  const title = String(body.title || 'Домашние задания').trim().slice(0, 120) || 'Домашние задания';
  const lessonIds = Array.isArray(body.lesson_ids)
    ? [...new Set(body.lesson_ids.map((id) => String(id || '').trim()).filter(Boolean))]
    : null;
  const isOpen = typeof body.is_open === 'boolean' ? body.is_open : undefined;

  let hubId = typeof body.hub_id === 'string' ? body.hub_id : '';
  if (!hubId) {
    const { data: existingRows } = await db
      .from('academy_public_hubs')
      .select('id')
      .eq('owner_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1);
    hubId = existingRows?.[0]?.id || '';
  }

  if (hubId) {
    const { data: owned } = await db
      .from('academy_public_hubs')
      .select('id, owner_id')
      .eq('id', hubId)
      .maybeSingle();
    if (!owned || owned.owner_id !== userId) return deps.json({ error: 'forbidden' }, 403);
    const patch: Record<string, unknown> = { title, updated_at: new Date().toISOString() };
    if (typeof isOpen === 'boolean') patch.is_open = isOpen;
    const { error } = await db.from('academy_public_hubs').update(patch).eq('id', hubId);
    if (error) return deps.json({ error: 'hub_save_failed' }, 500);
  } else {
    const token = randomHubToken();
    const { data: created, error } = await db
      .from('academy_public_hubs')
      .insert({
        owner_id: userId,
        title,
        token,
        is_open: typeof isOpen === 'boolean' ? isOpen : true,
      })
      .select('id')
      .maybeSingle();
    if (error || !created) return deps.json({ error: 'hub_save_failed' }, 500);
    hubId = created.id;
  }

  if (lessonIds) {
    for (const lessonId of lessonIds) {
      const { data: lesson } = await db
        .from('academy_lessons')
        .select('id, owner_id')
        .eq('id', lessonId)
        .maybeSingle();
      if (!lesson) return deps.json({ error: 'lesson_not_found' }, 404);
      if (lesson.owner_id !== userId) {
        const { data: collab } = await db
          .from('academy_lesson_teachers')
          .select('role')
          .eq('lesson_id', lessonId)
          .eq('user_id', userId)
          .maybeSingle();
        if (!['owner', 'editor'].includes(String(collab?.role || ''))) {
          return deps.json({ error: 'forbidden' }, 403);
        }
      }
    }

    await db.from('academy_public_hub_lessons').delete().eq('hub_id', hubId);
    if (lessonIds.length) {
      const rows = lessonIds.map((lesson_id, position) => ({
        hub_id: hubId,
        lesson_id,
        position,
      }));
      const { error: linkErr } = await db.from('academy_public_hub_lessons').insert(rows);
      if (linkErr) return deps.json({ error: 'hub_save_failed' }, 500);
    }
  }

  return handleHubGet(db, userId, {}, deps);
}

export async function handleHubToggle(
  db: SupabaseClient,
  userId: string,
  body: Record<string, unknown>,
  deps: PublicAsyncDeps,
) {
  await deps.requireTeacher(db, userId);
  const hubId = String(body.hub_id || '');
  if (!hubId) return deps.json({ error: 'hub_id' }, 400);
  if (typeof body.is_open !== 'boolean') return deps.json({ error: 'params' }, 400);

  const { data: hub } = await db
    .from('academy_public_hubs')
    .select('id, owner_id')
    .eq('id', hubId)
    .maybeSingle();
  if (!hub || hub.owner_id !== userId) return deps.json({ error: 'forbidden' }, 403);

  const { error } = await db
    .from('academy_public_hubs')
    .update({ is_open: body.is_open, updated_at: new Date().toISOString() })
    .eq('id', hubId);
  if (error) return deps.json({ error: 'hub_save_failed' }, 500);
  return handleHubGet(db, userId, {}, deps);
}

export async function handlePublicCatalog(
  db: SupabaseClient,
  body: Record<string, unknown>,
  deps: PublicAsyncDeps,
) {
  const token = String(body.token || '').trim();
  if (!token || token.length < 8) return deps.json({ error: 'token' }, 400);
  const hub = await loadHubByToken(db, token);
  if (!hub) return deps.json({ error: 'hub_not_found' }, 404);
  if (!hub.is_open) {
    return deps.json({
      hub: { title: hub.title, token: hub.token, is_open: false },
      lessons: [],
      closed: true,
    });
  }
  let lessons = await loadHubLessons(db, hub.id);
  lessons = await attachQuestionCounts(db, lessons);
  return deps.json({
    hub: { title: hub.title, token: hub.token, is_open: true },
    lessons,
    closed: false,
  });
}

export async function handleEnsureStudent(
  db: SupabaseClient,
  user: { id: string; email?: string | null },
  body: Record<string, unknown>,
  deps: PublicAsyncDeps,
) {
  const fromBody = typeof body.display_name === 'string' ? body.display_name.trim() : '';
  const name = fromBody || user.email || 'Ученик';
  const { data, error } = await db
    .from('academy_students')
    .upsert(
      {
        user_id: user.id,
        display_name: name.slice(0, 80),
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select('user_id, display_name, is_active')
    .maybeSingle();
  if (error) return deps.json({ error: 'student_create_failed' }, 500);
  return deps.json({ student: data });
}

async function requireStudent(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from('academy_students')
    .select('user_id, display_name, is_active')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.is_active) {
    const err = new Error('not_student');
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  return data;
}

export async function handleAsyncStart(
  db: SupabaseClient,
  body: Record<string, unknown>,
  userId: string | null,
  deps: PublicAsyncDeps,
) {
  const token = String(body.token || '').trim();
  const lessonId = String(body.lesson_id || '').trim();
  let displayName = String(body.display_name || '').trim().slice(0, 40);
  const fingerprint =
    typeof body.client_fingerprint === 'string' ? body.client_fingerprint.trim().slice(0, 80) : '';

  if (!token || !lessonId) return deps.json({ error: 'params' }, 400);

  const hub = await loadHubByToken(db, token);
  if (!hub) return deps.json({ error: 'hub_not_found' }, 404);
  if (!hub.is_open) return deps.json({ error: 'hub_closed' }, 403);

  const { data: link } = await db
    .from('academy_public_hub_lessons')
    .select('lesson_id')
    .eq('hub_id', hub.id)
    .eq('lesson_id', lessonId)
    .maybeSingle();
  if (!link) return deps.json({ error: 'lesson_not_in_hub' }, 404);

  const { data: lesson } = await db
    .from('academy_lessons')
    .select('id, title, org_id')
    .eq('id', lessonId)
    .maybeSingle();
  if (!lesson) return deps.json({ error: 'lesson_not_found' }, 404);

  const { data: questions, error: qErr } = await db
    .from('academy_questions')
    .select('id, type, prompt, prompt_media, payload, scoring, position')
    .eq('lesson_id', lessonId)
    .order('position', { ascending: true });
  if (qErr) return deps.json({ error: qErr.message }, 500);
  if (!questions?.length) return deps.json({ error: 'no_questions' }, 400);

  let student = null as { user_id: string; display_name: string } | null;
  if (userId) {
    try {
      student = await requireStudent(db, userId);
      if (!displayName) displayName = student.display_name || '';
    } catch {
      // Auth user without student role can still play as guest name
      student = null;
    }
  }
  if (displayName.length < 2) return deps.json({ error: 'name' }, 400);

  const snapshot = questions.map((q, i) => ({ ...q, position: i }));
  const settings = deps.settingsDefaults({
    mode: 'learning',
    timer_seconds: 0,
    auto_advance: false,
    auto_advance_on_all: false,
    show_instant_feedback: true,
    reveal_answers: 'always',
    allow_late_join: false,
    hub_token: token,
  });

  const nowIso = new Date().toISOString();
  let code = deps.randomCode();
  let created: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await db
      .from('academy_sessions')
      .insert({
        lesson_id: lessonId,
        org_id: lesson.org_id,
        host_user_id: hub.owner_id,
        hub_id: hub.id,
        code,
        status: 'live',
        phase: 'answering',
        pacing: 'async',
        settings,
        current_index: 0,
        question_snapshot: snapshot,
        version: 1,
        started_at: nowIso,
        phase_started_at: nowIso,
        last_activity_at: nowIso,
      })
      .select('*')
      .maybeSingle();
    if (!error && data) {
      created = data as Record<string, unknown>;
      break;
    }
    if (error?.code === '23505') {
      code = deps.randomCode();
      continue;
    }
    return deps.json({ error: error?.message || 'create_failed' }, 500);
  }
  if (!created) return deps.json({ error: 'code_collision' }, 500);

  await db.from('academy_session_hosts').upsert({
    session_id: created.id,
    user_id: hub.owner_id,
  });

  const resumeToken = deps.randomToken();
  const resumeHash = await deps.sha256Hex(resumeToken);
  const { data: participant, error: pErr } = await db
    .from('academy_participants')
    .insert({
      session_id: created.id,
      display_name: displayName,
      user_id: student?.user_id || userId || null,
      resume_token_hash: resumeHash,
      client_fingerprint: fingerprint || null,
      status: 'active',
      last_seen_at: nowIso,
    })
    .select('id, display_name, session_id')
    .maybeSingle();
  if (pErr || !participant) return deps.json({ error: 'join_failed' }, 500);

  const first = snapshot[0] as Record<string, unknown>;
  return deps.json({
    resume_token: resumeToken,
    participant,
    session: {
      id: created.id,
      code: created.code,
      status: created.status,
      phase: created.phase,
      pacing: 'async',
      current_index: 0,
      version: created.version,
      settings,
      question_count: snapshot.length,
      lesson_title: lesson.title,
      hub_title: hub.title,
      current_question: publicQuestion(first, { reveal: false }),
    },
  });
}

export async function handleAsyncState(
  db: SupabaseClient,
  body: Record<string, unknown>,
  deps: PublicAsyncDeps,
) {
  const resumeToken = String(body.resume_token || '').trim();
  if (!resumeToken) return deps.json({ error: 'resume' }, 400);
  const hash = await deps.sha256Hex(resumeToken);

  const { data: participant } = await db
    .from('academy_participants')
    .select('id, display_name, session_id, status')
    .eq('resume_token_hash', hash)
    .maybeSingle();
  if (!participant || participant.status === 'kicked') return deps.json({ error: 'invalid_token' }, 401);

  const session = await deps.loadSession(db, participant.session_id);
  if (!session) return deps.json({ error: 'not_found' }, 404);
  if (String(session.pacing) !== 'async') return deps.json({ error: 'not_async' }, 400);

  await db
    .from('academy_participants')
    .update({ last_seen_at: new Date().toISOString(), status: 'active' })
    .eq('id', participant.id);

  const settings = deps.settingsDefaults(session.settings as Record<string, unknown>);
  const snap = Array.isArray(session.question_snapshot) ? session.question_snapshot : [];
  const idx = Number(session.current_index) || 0;
  const q = snap[idx] as Record<string, unknown> | undefined;

  const { data: answers } = await db
    .from('academy_answers')
    .select('question_index, is_correct, score, answer_payload')
    .eq('participant_id', participant.id)
    .order('question_index');

  const myAnswerRow = (answers || []).find((a) => Number(a.question_index) === idx) || null;
  const finished = String(session.status) === 'finished' || String(session.phase) === 'results';
  const reveal = finished || Boolean(settings.show_instant_feedback && myAnswerRow);

  return deps.json({
    participant: {
      id: participant.id,
      display_name: participant.display_name,
      session_id: participant.session_id,
    },
    session: {
      id: session.id,
      code: session.code,
      status: session.status,
      phase: session.phase,
      pacing: 'async',
      current_index: idx,
      version: session.version,
      settings,
      question_count: snap.length,
      current_question: finished || !q ? null : publicQuestion(q, { reveal: false }),
      answered_count: (answers || []).length,
    },
    my_answer: deps.publicStudentAnswer(myAnswerRow as Record<string, unknown> | null, Boolean(reveal)),
    progress: {
      answered: (answers || []).length,
      total: snap.length,
      correct: (answers || []).filter((a) => a.is_correct === true).length,
    },
  });
}

/** Async-aware submit: only unanswered current_index while live/answering; then advance. */
export async function handleAsyncSubmit(
  db: SupabaseClient,
  body: Record<string, unknown>,
  deps: PublicAsyncDeps,
) {
  const resumeToken = String(body.resume_token || '');
  const questionIndex = Number(body.question_index);
  const answerPayload = (body.answer || {}) as Record<string, unknown>;
  if (!resumeToken || !Number.isFinite(questionIndex)) return deps.json({ error: 'params' }, 400);

  const hash = await deps.sha256Hex(resumeToken);
  const { data: participant } = await db
    .from('academy_participants')
    .select('id, session_id, status')
    .eq('resume_token_hash', hash)
    .maybeSingle();
  if (!participant || participant.status === 'kicked') return deps.json({ error: 'invalid_token' }, 401);

  const session = await deps.loadSession(db, participant.session_id);
  if (!session) return deps.json({ error: 'not_found' }, 404);
  if (String(session.pacing) !== 'async') return deps.json({ error: 'not_async' }, 400);
  if (session.status !== 'live' || session.phase !== 'answering') {
    return deps.json({ error: 'not_accepting' }, 409);
  }
  if (questionIndex !== Number(session.current_index)) {
    return deps.json({ error: 'wrong_question' }, 409);
  }

  const snap = Array.isArray(session.question_snapshot) ? session.question_snapshot : [];
  const q = snap[questionIndex] as Record<string, unknown> | undefined;
  if (!q) return deps.json({ error: 'no_question' }, 400);

  const { data: existing } = await db
    .from('academy_answers')
    .select('*')
    .eq('participant_id', participant.id)
    .eq('question_index', questionIndex)
    .maybeSingle();
  if (existing) {
    return deps.json({
      ok: true,
      already: true,
      answer: deps.publicStudentAnswer(existing as Record<string, unknown>, true),
      feedback: { accepted: true, is_correct: existing.is_correct },
      advanced: false,
      finished: false,
    });
  }

  const scored = scoreAnswer(
    String(q.type),
    (q.payload || {}) as Record<string, unknown>,
    answerPayload,
    (q.scoring || {}) as Record<string, unknown>,
  );

  const row = {
    session_id: session.id,
    participant_id: participant.id,
    question_index: questionIndex,
    question_id: String(q.id || ''),
    answer_payload: answerPayload,
    is_correct: scored.is_correct,
    score: scored.score,
    response_ms: null,
    scored_at: scored.pending ? null : new Date().toISOString(),
    scored_by: scored.pending ? null : 'auto',
  };

  const { data: inserted, error } = await db.from('academy_answers').insert(row).select('*').maybeSingle();
  if (error) {
    if (error.code === '23505') {
      const { data: again } = await db
        .from('academy_answers')
        .select('*')
        .eq('participant_id', participant.id)
        .eq('question_index', questionIndex)
        .maybeSingle();
      return deps.json({
        ok: true,
        already: true,
        answer: deps.publicStudentAnswer(again as Record<string, unknown> | null, true),
        feedback: { accepted: true },
      });
    }
    return deps.json({ error: 'submit_failed' }, 500);
  }

  const nextIndex = questionIndex + 1;
  const finished = nextIndex >= snap.length;
  const now = new Date();
  const patch: Record<string, unknown> = {
    version: Number(session.version) + 1,
    last_activity_at: now.toISOString(),
  };
  if (finished) {
    patch.status = 'finished';
    patch.phase = 'results';
    patch.finished_at = now.toISOString();
    patch.phase_ends_at = null;
    patch.phase_started_at = null;
  } else {
    patch.current_index = nextIndex;
    patch.phase_started_at = now.toISOString();
  }

  await db.from('academy_sessions').update(patch).eq('id', session.id).eq('version', session.version);
  await db
    .from('academy_participants')
    .update({ last_seen_at: now.toISOString() })
    .eq('id', participant.id);

  let next_question = null as Record<string, unknown> | null;
  if (!finished) {
    const nq = snap[nextIndex] as Record<string, unknown>;
    next_question = publicQuestion(nq, { reveal: false });
  }

  return deps.json({
    ok: true,
    answer: deps.publicStudentAnswer(inserted as Record<string, unknown>, true),
    feedback: scored.pending
      ? { accepted: true }
      : { accepted: true, is_correct: scored.is_correct },
    advanced: !finished,
    finished,
    next_index: finished ? questionIndex : nextIndex,
    next_question,
  });
}

export async function handleHubReports(
  db: SupabaseClient,
  userId: string,
  body: Record<string, unknown>,
  deps: PublicAsyncDeps,
) {
  await deps.requireTeacher(db, userId);
  const hubId = String(body.hub_id || '');
  if (!hubId) return deps.json({ error: 'hub_id' }, 400);

  const { data: hub } = await db
    .from('academy_public_hubs')
    .select('id, owner_id, title, token')
    .eq('id', hubId)
    .maybeSingle();
  if (!hub || hub.owner_id !== userId) return deps.json({ error: 'forbidden' }, 403);

  const { data: sessions, error } = await db
    .from('academy_sessions')
    .select('id, lesson_id, status, started_at, finished_at, code, pacing')
    .eq('hub_id', hubId)
    .eq('pacing', 'async')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return deps.json({ error: 'hub_load_failed' }, 500);

  const sessionRows = sessions || [];
  const lessonIds = [...new Set(sessionRows.map((s) => s.lesson_id).filter(Boolean))];
  let lessonMap: Record<string, { title: string; subject: string }> = {};
  if (lessonIds.length) {
    const { data: lessons } = await db
      .from('academy_lessons')
      .select('id, title, subject')
      .in('id', lessonIds);
    (lessons || []).forEach((l) => {
      lessonMap[l.id] = { title: l.title, subject: l.subject };
    });
  }

  const ids = sessionRows.map((s) => s.id);
  const peopleBySession: Record<string, string[]> = {};
  const scoreBySession: Record<string, { correct: number; total: number }> = {};
  if (ids.length) {
    const { data: people } = await db
      .from('academy_participants')
      .select('session_id, display_name, status, user_id')
      .in('session_id', ids);
    (people || []).forEach((p) => {
      if (p.status === 'kicked') return;
      if (!peopleBySession[p.session_id]) peopleBySession[p.session_id] = [];
      const name = String(p.display_name || '').trim();
      if (name && !peopleBySession[p.session_id].includes(name)) {
        peopleBySession[p.session_id].push(name);
      }
    });
    const { data: answers } = await db
      .from('academy_answers')
      .select('session_id, is_correct')
      .in('session_id', ids);
    (answers || []).forEach((a) => {
      if (!scoreBySession[a.session_id]) scoreBySession[a.session_id] = { correct: 0, total: 0 };
      scoreBySession[a.session_id].total += 1;
      if (a.is_correct === true) scoreBySession[a.session_id].correct += 1;
    });
  }

  const runs = sessionRows.map((s) => ({
    id: s.id,
    code: s.code,
    status: s.status,
    started_at: s.started_at,
    finished_at: s.finished_at,
    lesson_id: s.lesson_id,
    lesson_title: lessonMap[s.lesson_id]?.title || 'Урок',
    lesson_subject: lessonMap[s.lesson_id]?.subject || '',
    students: peopleBySession[s.id] || [],
    score: scoreBySession[s.id] || { correct: 0, total: 0 },
  }));

  return deps.json({ hub, runs });
}

export async function handleStudentHistory(
  db: SupabaseClient,
  userId: string,
  _body: Record<string, unknown>,
  deps: PublicAsyncDeps,
) {
  await requireStudent(db, userId);
  const { data: parts, error } = await db
    .from('academy_participants')
    .select('id, display_name, session_id, joined_at')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false })
    .limit(50);
  if (error) return deps.json({ error: 'history_failed' }, 500);
  const sessionIds = [...new Set((parts || []).map((p) => p.session_id))];
  if (!sessionIds.length) return deps.json({ history: [], leaderboard: [] });

  const { data: sessions } = await db
    .from('academy_sessions')
    .select('id, lesson_id, hub_id, status, finished_at, started_at, pacing, question_snapshot')
    .in('id', sessionIds)
    .eq('pacing', 'async');

  const sessionMap = new Map((sessions || []).map((s) => [s.id, s]));
  const lessonIds = [...new Set((sessions || []).map((s) => s.lesson_id).filter(Boolean))];
  let lessonMap: Record<string, string> = {};
  if (lessonIds.length) {
    const { data: lessons } = await db.from('academy_lessons').select('id, title').in('id', lessonIds);
    (lessons || []).forEach((l) => {
      lessonMap[l.id] = l.title;
    });
  }

  const partIds = (parts || []).map((p) => p.id);
  const { data: answers } = await db
    .from('academy_answers')
    .select('participant_id, is_correct, score')
    .in('participant_id', partIds);
  const byPart: Record<string, { correct: number; total: number; score: number }> = {};
  (answers || []).forEach((a) => {
    if (!byPart[a.participant_id]) byPart[a.participant_id] = { correct: 0, total: 0, score: 0 };
    byPart[a.participant_id].total += 1;
    if (a.is_correct === true) byPart[a.participant_id].correct += 1;
    byPart[a.participant_id].score += Number(a.score) || 0;
  });

  const history = (parts || [])
    .map((p) => {
      const s = sessionMap.get(p.session_id);
      if (!s) return null;
      const qCount = Array.isArray(s.question_snapshot) ? s.question_snapshot.length : 0;
      const stats = byPart[p.id] || { correct: 0, total: 0, score: 0 };
      return {
        session_id: s.id,
        lesson_id: s.lesson_id,
        lesson_title: lessonMap[s.lesson_id] || 'Урок',
        status: s.status,
        finished_at: s.finished_at,
        started_at: s.started_at,
        hub_id: s.hub_id,
        correct: stats.correct,
        answered: stats.total,
        question_count: qCount,
        score: stats.score,
      };
    })
    .filter(Boolean);

  // Aggregate leaderboard for hubs the student participated in (no raw answers).
  const hubIds = [...new Set((sessions || []).map((s) => s.hub_id).filter(Boolean))] as string[];
  const leaderboard: Array<Record<string, unknown>> = [];
  for (const hubId of hubIds.slice(0, 3)) {
    const { data: hubSessions } = await db
      .from('academy_sessions')
      .select('id')
      .eq('hub_id', hubId)
      .eq('pacing', 'async')
      .eq('status', 'finished')
      .limit(200);
    const hsIds = (hubSessions || []).map((s) => s.id);
    if (!hsIds.length) continue;

    const { data: allPeople } = await db
      .from('academy_participants')
      .select('id, display_name, user_id, session_id')
      .in('session_id', hsIds)
      .neq('status', 'kicked');
    const { data: allAnswers } = await db
      .from('academy_answers')
      .select('participant_id, is_correct')
      .in(
        'participant_id',
        (allPeople || []).map((p) => p.id),
      );

    const ansByPart: Record<string, { correct: number; total: number }> = {};
    (allAnswers || []).forEach((a) => {
      if (!ansByPart[a.participant_id]) ansByPart[a.participant_id] = { correct: 0, total: 0 };
      ansByPart[a.participant_id].total += 1;
      if (a.is_correct === true) ansByPart[a.participant_id].correct += 1;
    });

    type Agg = { name: string; runs: number; correct: number; total: number };
    const byKey = new Map<string, Agg>();
    (allPeople || []).forEach((p) => {
      const key = p.user_id ? `u:${p.user_id}` : `n:${String(p.display_name).toLowerCase()}`;
      const cur = byKey.get(key) || { name: p.display_name, runs: 0, correct: 0, total: 0 };
      cur.runs += 1;
      const st = ansByPart[p.id] || { correct: 0, total: 0 };
      cur.correct += st.correct;
      cur.total += st.total;
      byKey.set(key, cur);
    });

    const { data: hub } = await db.from('academy_public_hubs').select('title').eq('id', hubId).maybeSingle();
    const rows = [...byKey.values()]
      .map((r) => ({
        display_name: r.name,
        runs: r.runs,
        accuracy: r.total ? Math.round((r.correct / r.total) * 100) : 0,
      }))
      .sort((a, b) => b.accuracy - a.accuracy || b.runs - a.runs)
      .slice(0, 10);

    leaderboard.push({
      hub_id: hubId,
      hub_title: hub?.title || 'Набор',
      rows,
    });
  }

  return deps.json({ history, leaderboard });
}

export const PUBLIC_ASYNC_TEACHER_ACTIONS = ['hub_get', 'hub_upsert', 'hub_toggle', 'hub_reports'] as const;
export const PUBLIC_ASYNC_AUTH_ACTIONS = ['ensure_student', 'student_history'] as const;
export const PUBLIC_ASYNC_PUBLIC_ACTIONS = [
  'public_catalog',
  'async_start',
  'async_state',
  'async_submit',
] as const;
