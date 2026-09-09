import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { publicQuestion, scoreAnswer } from './scoring.ts';

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('config');
  return createClient(url, key);
}

function anonAuthedClient(authHeader: string | null): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anon) throw new Error('config');
  return createClient(url, anon, {
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, '0');
}

async function requireTeacher(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from('academy_teachers')
    .select('user_id, display_name, is_active')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.is_active) {
    const err = new Error('not_teacher');
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  return data;
}

/** Any signed-in Auth user (admin signup is closed) can become an Academy teacher. */
async function upsertTeacher(
  db: SupabaseClient,
  user: { id: string; email?: string | null },
  displayName?: string,
) {
  const name = (displayName || '').trim() || user.email || 'Учитель';
  const { data, error } = await db
    .from('academy_teachers')
    .upsert(
      {
        user_id: user.id,
        display_name: name,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select('user_id, display_name, is_active')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function handleEnsureTeacher(
  db: SupabaseClient,
  user: { id: string; email?: string | null },
  body: Record<string, unknown>,
) {
  try {
    const fromBody = typeof body.display_name === 'string' ? body.display_name.trim() : '';
    const teacher = await upsertTeacher(db, user, fromBody);
    return json({ teacher });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

async function handleSaveLesson(
  db: SupabaseClient,
  user: { id: string; email?: string | null },
  body: Record<string, unknown>,
) {
  try {
    await upsertTeacher(db, user, user.email || 'Учитель');
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
  await requireTeacher(db, user.id);

  const title = String(body.title || '').trim();
  const subject = String(body.subject || 'other').trim() || 'other';
  const level = String(body.level || 'beginner');
  const description = String(body.description || '');
  const questions = Array.isArray(body.questions) ? body.questions : [];
  if (!title) return json({ error: 'title' }, 400);
  if (!questions.length) return json({ error: 'no_questions' }, 400);

  const { data: lesson, error: lessonErr } = await db
    .from('academy_lessons')
    .insert({
      owner_id: user.id,
      title,
      subject,
      level,
      description,
    })
    .select('id, title')
    .maybeSingle();
  if (lessonErr) return json({ error: lessonErr.message }, 500);
  if (!lesson) return json({ error: 'lesson_create_failed' }, 500);

  const rows = questions.map((raw, position) => {
    const q = (raw || {}) as Record<string, unknown>;
    return {
      lesson_id: lesson.id,
      type: String(q.type || 'single_choice'),
      prompt: String(q.prompt || ''),
      prompt_media: q.prompt_media ?? null,
      payload: (q.payload || {}) as Record<string, unknown>,
      scoring: (q.scoring || { method: 'auto', points: 1 }) as Record<string, unknown>,
      position,
    };
  });

  const { error: qErr } = await db.from('academy_questions').insert(rows);
  if (qErr) {
    await db.from('academy_lessons').delete().eq('id', lesson.id);
    return json({ error: qErr.message }, 500);
  }

  return json({ lesson });
}

async function canHost(db: SupabaseClient, sessionId: string, userId: string) {
  const { data: session } = await db
    .from('academy_sessions')
    .select('id, host_user_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return false;
  if (session.host_user_id === userId) return true;
  const { data: host } = await db
    .from('academy_session_hosts')
    .select('user_id')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(host);
}

function settingsDefaults(input: Record<string, unknown> | null | undefined) {
  return {
    mode: typeof input?.mode === 'string' ? input.mode : 'learning',
    timer_seconds: typeof input?.timer_seconds === 'number' ? input.timer_seconds : 0,
    leaderboard: Boolean(input?.leaderboard),
    shuffle_questions: Boolean(input?.shuffle_questions),
    shuffle_options: Boolean(input?.shuffle_options),
    reveal_answers: typeof input?.reveal_answers === 'string' ? input.reveal_answers : 'learning_only',
    allow_late_join: input?.allow_late_join !== false,
  };
}

function shouldReveal(settings: Record<string, unknown>, phase: string): boolean {
  if (phase === 'reveal' || phase === 'results') {
    if (settings.reveal_answers === 'never') return false;
    if (settings.reveal_answers === 'learning_only') return settings.mode === 'learning';
    return true;
  }
  return false;
}

async function loadSession(db: SupabaseClient, sessionId: string) {
  const { data, error } = await db.from('academy_sessions').select('*').eq('id', sessionId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function participantCount(db: SupabaseClient, sessionId: string) {
  const { count } = await db
    .from('academy_participants')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('status', 'active');
  return count ?? 0;
}

async function answeredCount(db: SupabaseClient, sessionId: string, questionIndex: number) {
  const { count } = await db
    .from('academy_answers')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('question_index', questionIndex);
  return count ?? 0;
}

function currentPublicQuestion(session: Record<string, unknown>, reveal: boolean) {
  const snap = Array.isArray(session.question_snapshot) ? session.question_snapshot : [];
  const idx = Number(session.current_index) || 0;
  const q = snap[idx] as Record<string, unknown> | undefined;
  if (!q) return null;
  return publicQuestion(q, { reveal });
}

async function handleCreate(db: SupabaseClient, userId: string, body: Record<string, unknown>) {
  await requireTeacher(db, userId);
  const lessonId = String(body.lesson_id || '');
  if (!lessonId) return json({ error: 'lesson_id' }, 400);

  const { data: lesson, error: lessonErr } = await db
    .from('academy_lessons')
    .select('id, owner_id, org_id, title')
    .eq('id', lessonId)
    .maybeSingle();
  if (lessonErr) return json({ error: lessonErr.message }, 500);
  if (!lesson) return json({ error: 'lesson_not_found' }, 404);

  const { data: collab } = await db
    .from('academy_lesson_teachers')
    .select('role')
    .eq('lesson_id', lessonId)
    .eq('user_id', userId)
    .maybeSingle();
  if (lesson.owner_id !== userId && !['owner', 'editor'].includes(String(collab?.role || ''))) {
    return json({ error: 'forbidden' }, 403);
  }

  const { data: questions, error: qErr } = await db
    .from('academy_questions')
    .select('id, type, prompt, prompt_media, payload, scoring, position')
    .eq('lesson_id', lessonId)
    .order('position', { ascending: true });
  if (qErr) return json({ error: qErr.message }, 500);
  if (!questions?.length) return json({ error: 'no_questions' }, 400);

  const settings = settingsDefaults(body.settings as Record<string, unknown>);
  let snapshot = questions.map((q, i) => ({ ...q, position: i }));
  if (settings.shuffle_questions) {
    snapshot = [...snapshot].sort(() => Math.random() - 0.5).map((q, i) => ({ ...q, position: i }));
  }

  let code = randomCode();
  let created = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await db
      .from('academy_sessions')
      .insert({
        lesson_id: lessonId,
        org_id: lesson.org_id,
        host_user_id: userId,
        code,
        status: 'lobby',
        phase: 'lobby',
        pacing: 'live',
        settings,
        current_index: 0,
        question_snapshot: snapshot,
        version: 1,
        last_activity_at: new Date().toISOString(),
      })
      .select('*')
      .maybeSingle();
    if (!error && data) {
      created = data;
      break;
    }
    if (error?.code === '23505') {
      code = randomCode();
      continue;
    }
    return json({ error: error?.message || 'create_failed' }, 500);
  }
  if (!created) return json({ error: 'code_collision' }, 500);

  await db.from('academy_session_hosts').upsert({ session_id: created.id, user_id: userId });

  return json({
    session: {
      id: created.id,
      code: created.code,
      status: created.status,
      phase: created.phase,
      version: created.version,
      lesson_title: lesson.title,
      question_count: snapshot.length,
      join_url: `https://waydean.ru/join/?c=${created.code}`,
    },
  });
}

async function handleJoin(db: SupabaseClient, body: Record<string, unknown>) {
  const code = String(body.code || '').trim();
  const displayName = String(body.display_name || '').trim();
  if (!/^\d{4,8}$/.test(code)) return json({ error: 'code' }, 400);
  if (displayName.length < 2) return json({ error: 'name' }, 400);

  const { data: session, error } = await db
    .from('academy_sessions')
    .select('*')
    .eq('code', code)
    .in('status', ['lobby', 'live', 'paused'])
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!session) return json({ error: 'session_not_found' }, 404);

  const settings = settingsDefaults(session.settings);
  if (session.status !== 'lobby' && !settings.allow_late_join) {
    return json({ error: 'late_join_disabled' }, 403);
  }

  const resumeToken = randomToken();
  const resumeHash = await sha256Hex(resumeToken);
  const { data: participant, error: pErr } = await db
    .from('academy_participants')
    .insert({
      session_id: session.id,
      display_name: displayName.slice(0, 40),
      resume_token_hash: resumeHash,
      status: 'active',
      last_seen_at: new Date().toISOString(),
    })
    .select('id, display_name, session_id')
    .maybeSingle();
  if (pErr) return json({ error: pErr.message }, 500);

  await db
    .from('academy_sessions')
    .update({ last_activity_at: new Date().toISOString() })
    .eq('id', session.id);

  const reveal = shouldReveal(settings, session.phase);
  return json({
    resume_token: resumeToken,
    participant,
    session: {
      id: session.id,
      code: session.code,
      status: session.status,
      phase: session.phase,
      current_index: session.current_index,
      version: session.version,
      settings,
      question_count: Array.isArray(session.question_snapshot) ? session.question_snapshot.length : 0,
      current_question: ['answering', 'reveal'].includes(session.phase)
        ? currentPublicQuestion(session, reveal)
        : null,
    },
  });
}

async function handleResume(db: SupabaseClient, body: Record<string, unknown>) {
  const code = String(body.code || '').trim();
  const resumeToken = String(body.resume_token || '').trim();
  if (!code || !resumeToken) return json({ error: 'resume' }, 400);
  const hash = await sha256Hex(resumeToken);

  const { data: participant, error } = await db
    .from('academy_participants')
    .select('id, display_name, session_id, status')
    .eq('resume_token_hash', hash)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!participant || participant.status === 'kicked') return json({ error: 'invalid_token' }, 401);

  const session = await loadSession(db, participant.session_id);
  if (!session || session.code !== code) return json({ error: 'session_mismatch' }, 404);

  await db
    .from('academy_participants')
    .update({ last_seen_at: new Date().toISOString(), status: 'active' })
    .eq('id', participant.id);

  const settings = settingsDefaults(session.settings);
  const reveal = shouldReveal(settings, session.phase);

  let myAnswer = null;
  if (['answering', 'reveal', 'results'].includes(session.phase)) {
    const { data: ans } = await db
      .from('academy_answers')
      .select('question_index, is_correct, score, answer_payload')
      .eq('participant_id', participant.id)
      .eq('question_index', session.current_index)
      .maybeSingle();
    myAnswer = ans;
  }

  return json({
    participant: { id: participant.id, display_name: participant.display_name, session_id: participant.session_id },
    session: {
      id: session.id,
      code: session.code,
      status: session.status,
      phase: session.phase,
      current_index: session.current_index,
      version: session.version,
      settings,
      question_count: Array.isArray(session.question_snapshot) ? session.question_snapshot.length : 0,
      current_question: ['answering', 'reveal'].includes(session.phase)
        ? currentPublicQuestion(session, reveal)
        : null,
      finished: session.status === 'finished' || session.phase === 'results',
    },
    my_answer: myAnswer,
  });
}

async function handleControl(db: SupabaseClient, userId: string, body: Record<string, unknown>) {
  await requireTeacher(db, userId);
  const sessionId = String(body.session_id || '');
  const command = String(body.command || '');
  const expectedVersion = Number(body.expected_version);
  if (!sessionId || !command) return json({ error: 'params' }, 400);
  if (!(await canHost(db, sessionId, userId))) return json({ error: 'forbidden' }, 403);

  const session = await loadSession(db, sessionId);
  if (!session) return json({ error: 'not_found' }, 404);
  if (Number.isFinite(expectedVersion) && session.version !== expectedVersion) {
    return json({ error: 'version_conflict', session }, 409);
  }

  const snap = Array.isArray(session.question_snapshot) ? session.question_snapshot : [];
  const settings = settingsDefaults(session.settings);
  const now = new Date();
  const patch: Record<string, unknown> = {
    version: session.version + 1,
    last_activity_at: now.toISOString(),
  };

  if (command === 'start') {
    if (session.status !== 'lobby' && session.status !== 'paused') return json({ error: 'bad_state' }, 400);
    patch.status = 'live';
    patch.phase = 'answering';
    patch.current_index = 0;
    patch.started_at = session.started_at || now.toISOString();
    if (settings.timer_seconds > 0) {
      patch.phase_ends_at = new Date(now.getTime() + settings.timer_seconds * 1000).toISOString();
    } else patch.phase_ends_at = null;
  } else if (command === 'reveal') {
    if (session.phase !== 'answering') return json({ error: 'bad_state' }, 400);
    patch.phase = 'reveal';
    patch.phase_ends_at = null;
  } else if (command === 'next') {
    if (!['answering', 'reveal', 'lobby'].includes(session.phase) && session.status !== 'paused') {
      return json({ error: 'bad_state' }, 400);
    }
    const nextIndex = session.phase === 'lobby' ? 0 : Number(session.current_index) + 1;
    if (nextIndex >= snap.length) {
      patch.status = 'finished';
      patch.phase = 'results';
      patch.finished_at = now.toISOString();
      patch.phase_ends_at = null;
    } else {
      patch.status = 'live';
      patch.phase = 'answering';
      patch.current_index = nextIndex;
      if (settings.timer_seconds > 0) {
        patch.phase_ends_at = new Date(now.getTime() + settings.timer_seconds * 1000).toISOString();
      } else patch.phase_ends_at = null;
    }
  } else if (command === 'finish') {
    patch.status = 'finished';
    patch.phase = 'results';
    patch.finished_at = now.toISOString();
    patch.phase_ends_at = null;
  } else if (command === 'pause') {
    if (session.status !== 'live') return json({ error: 'bad_state' }, 400);
    patch.status = 'paused';
    patch.phase_ends_at = null;
  } else if (command === 'abandon') {
    patch.status = 'abandoned';
    patch.finished_at = now.toISOString();
    patch.phase_ends_at = null;
  } else {
    return json({ error: 'unknown_command' }, 400);
  }

  const { data: updated, error } = await db
    .from('academy_sessions')
    .update(patch)
    .eq('id', sessionId)
    .eq('version', session.version)
    .select('*')
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!updated) return json({ error: 'version_conflict' }, 409);

  const participants = await participantCount(db, sessionId);
  const answered = await answeredCount(db, sessionId, updated.current_index);
  return json({
    session: {
      id: updated.id,
      code: updated.code,
      status: updated.status,
      phase: updated.phase,
      current_index: updated.current_index,
      version: updated.version,
      phase_ends_at: updated.phase_ends_at,
      settings: settingsDefaults(updated.settings),
      question_count: snap.length,
      current_question: ['answering', 'reveal'].includes(updated.phase)
        ? currentPublicQuestion(updated, shouldReveal(settingsDefaults(updated.settings), updated.phase))
        : null,
      participants,
      answered,
    },
  });
}

async function handleSubmit(db: SupabaseClient, body: Record<string, unknown>) {
  const resumeToken = String(body.resume_token || '');
  const questionIndex = Number(body.question_index);
  const answerPayload = (body.answer || {}) as Record<string, unknown>;
  if (!resumeToken || !Number.isFinite(questionIndex)) return json({ error: 'params' }, 400);

  const hash = await sha256Hex(resumeToken);
  const { data: participant } = await db
    .from('academy_participants')
    .select('id, session_id, status')
    .eq('resume_token_hash', hash)
    .maybeSingle();
  if (!participant || participant.status === 'kicked') return json({ error: 'invalid_token' }, 401);

  const session = await loadSession(db, participant.session_id);
  if (!session) return json({ error: 'not_found' }, 404);
  if (session.status !== 'live' || session.phase !== 'answering') return json({ error: 'not_accepting' }, 409);
  if (questionIndex !== session.current_index) return json({ error: 'wrong_question' }, 409);

  const snap = Array.isArray(session.question_snapshot) ? session.question_snapshot : [];
  const q = snap[questionIndex] as Record<string, unknown> | undefined;
  if (!q) return json({ error: 'no_question' }, 400);

  const { data: existing } = await db
    .from('academy_answers')
    .select('*')
    .eq('participant_id', participant.id)
    .eq('question_index', questionIndex)
    .maybeSingle();
  if (existing) {
    return json({ ok: true, already: true, answer: existing });
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
      return json({ ok: true, already: true, answer: again });
    }
    return json({ error: error.message }, 500);
  }

  await db
    .from('academy_participants')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', participant.id);

  const settings = settingsDefaults(session.settings);
  const feedback =
    settings.mode === 'learning' && !scored.pending
      ? { is_correct: scored.is_correct, correct: publicQuestion(q, { reveal: true }).payload }
      : { accepted: true };

  return json({ ok: true, answer: inserted, feedback });
}

async function handleHeartbeat(db: SupabaseClient, body: Record<string, unknown>) {
  const resumeToken = typeof body.resume_token === 'string' ? body.resume_token : '';
  const sessionId = typeof body.session_id === 'string' ? body.session_id : '';
  const now = new Date().toISOString();

  if (resumeToken) {
    const hash = await sha256Hex(resumeToken);
    await db
      .from('academy_participants')
      .update({ last_seen_at: now })
      .eq('resume_token_hash', hash);
  }
  if (sessionId) {
    await db.from('academy_sessions').update({ last_activity_at: now }).eq('id', sessionId);
  }
  return json({ ok: true, at: now });
}

async function handleHostState(db: SupabaseClient, userId: string, body: Record<string, unknown>) {
  await requireTeacher(db, userId);
  const sessionId = String(body.session_id || '');
  if (!sessionId) return json({ error: 'session_id' }, 400);
  if (!(await canHost(db, sessionId, userId))) return json({ error: 'forbidden' }, 403);
  const session = await loadSession(db, sessionId);
  if (!session) return json({ error: 'not_found' }, 404);
  const participants = await participantCount(db, sessionId);
  const answered = await answeredCount(db, sessionId, session.current_index);
  const { data: people } = await db
    .from('academy_participants')
    .select('id, display_name, last_seen_at, status')
    .eq('session_id', sessionId)
    .order('joined_at', { ascending: true });

  return json({
    session: {
      id: session.id,
      code: session.code,
      status: session.status,
      phase: session.phase,
      current_index: session.current_index,
      version: session.version,
      phase_ends_at: session.phase_ends_at,
      settings: settingsDefaults(session.settings),
      question_count: Array.isArray(session.question_snapshot) ? session.question_snapshot.length : 0,
      current_question: currentPublicQuestion(session, true),
      participants,
      answered,
      people: people || [],
      join_url: `https://waydean.ru/join/?c=${session.code}`,
    },
  });
}

async function handleResults(db: SupabaseClient, body: Record<string, unknown>, userId: string | null) {
  const sessionId = String(body.session_id || '');
  const resumeToken = typeof body.resume_token === 'string' ? body.resume_token : '';
  if (!sessionId) return json({ error: 'session_id' }, 400);
  const session = await loadSession(db, sessionId);
  if (!session) return json({ error: 'not_found' }, 404);

  if (userId && (await canHost(db, sessionId, userId))) {
    const { data: answers } = await db
      .from('academy_answers')
      .select('participant_id, question_index, is_correct, score, answer_payload')
      .eq('session_id', sessionId);
    const { data: people } = await db
      .from('academy_participants')
      .select('id, display_name')
      .eq('session_id', sessionId);
    return json({ role: 'host', session_id: sessionId, participants: people || [], answers: answers || [] });
  }

  if (!resumeToken) return json({ error: 'forbidden' }, 403);
  const hash = await sha256Hex(resumeToken);
  const { data: participant } = await db
    .from('academy_participants')
    .select('id, display_name, session_id')
    .eq('resume_token_hash', hash)
    .maybeSingle();
  if (!participant || participant.session_id !== sessionId) return json({ error: 'forbidden' }, 403);
  const { data: answers } = await db
    .from('academy_answers')
    .select('question_index, is_correct, score')
    .eq('participant_id', participant.id)
    .order('question_index');
  const total = (answers || []).reduce((sum, a) => sum + (Number(a.score) || 0), 0);
  const correct = (answers || []).filter((a) => a.is_correct === true).length;
  return json({
    role: 'student',
    participant,
    answers: answers || [],
    summary: { total_score: total, correct_count: correct, answered: (answers || []).length },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const action = String(body.action || '');
  const authHeader = req.headers.get('Authorization');

  try {
    const db = serviceClient();

    if (['create', 'control', 'host_state', 'ensure_teacher', 'save_lesson'].includes(action)) {
      if (!authHeader) return json({ error: 'auth' }, 401);
      const userClient = anonAuthedClient(authHeader);
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) return json({ error: 'auth' }, 401);
      const userId = userData.user.id;
      if (action === 'ensure_teacher') {
        return await handleEnsureTeacher(db, userData.user, body);
      }
      if (action === 'save_lesson') {
        return await handleSaveLesson(db, userData.user, body);
      }
      if (action === 'create') return await handleCreate(db, userId, body);
      if (action === 'control') return await handleControl(db, userId, body);
      return await handleHostState(db, userId, body);
    }

    if (action === 'join') return await handleJoin(db, body);
    if (action === 'resume') return await handleResume(db, body);
    if (action === 'submit') return await handleSubmit(db, body);
    if (action === 'heartbeat') return await handleHeartbeat(db, body);
    if (action === 'results') {
      let userId: string | null = null;
      if (authHeader) {
        const userClient = anonAuthedClient(authHeader);
        const { data: userData } = await userClient.auth.getUser();
        userId = userData?.user?.id ?? null;
      }
      return await handleResults(db, body, userId);
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = (err as { status?: number })?.status || (message === 'config' ? 500 : 500);
    return json({ error: message }, status);
  }
});
