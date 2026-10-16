import { createClient } from '@supabase/supabase-js';
import { clampLimit, normalizeDays, normalizeMinRating, publicError } from './format.js';

const FULL_SELECT =
  'id,course_id,lesson_id,rating,comment,display_name,client_id,locale,app_version,platform,created_at,updated_at';
const LEGACY_SELECT = 'id,course_id,lesson_id,rating,comment,locale,app_version,platform,created_at';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_EMAIL', 'SUPABASE_PASSWORD'];

let clientPromise = null;

export function readConfig(env = process.env) {
  const config = {
    url: String(env.SUPABASE_URL ?? '').trim(),
    anonKey: String(env.SUPABASE_ANON_KEY ?? '').trim(),
    email: String(env.SUPABASE_EMAIL ?? '').trim(),
    password: String(env.SUPABASE_PASSWORD ?? ''),
  };
  config.missing = REQUIRED_ENV.filter((key) => !String(env[key] ?? '').trim());
  return config;
}

export function assertReadOnlyKey(key) {
  if (/^sb_secret_/i.test(key)) {
    throw new Error('Нужен anon/publishable ключ, не service role. Вход — email и пароль пользователя админки.');
  }
  const parts = String(key).split('.');
  if (parts.length !== 3) return;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload?.role === 'service_role') {
      throw new Error('Нужен anon/publishable ключ, не service role. Вход — email и пароль пользователя админки.');
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Нужен anon')) throw error;
  }
}

export function getClient() {
  if (!clientPromise) {
    const pending = createAuthedClient().catch((error) => {
      if (clientPromise === pending) clientPromise = null;
      throw error;
    });
    clientPromise = pending;
  }
  return clientPromise;
}

async function createAuthedClient() {
  const config = readConfig();
  if (config.missing.length) {
    throw new Error(`Не заданы ${config.missing.join(', ')}. Скопируйте jarvis-mcp/.env.example в .env.`);
  }
  assertReadOnlyKey(config.anonKey);
  const client = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  const { error } = await client.auth.signInWithPassword({
    email: config.email,
    password: config.password,
  });
  if (error) {
    throw new Error('Вход в Supabase не удался. Проверьте email и пароль пользователя админки.');
  }
  return client;
}

function throwQueryError(error, kind) {
  const wrapped = error instanceof Error ? error : new Error(error?.message || 'Ошибка Supabase');
  throw new Error(publicError(wrapped, kind));
}

export async function fetchAnalyticsDashboard(days) {
  const client = await getClient();
  const pDays = normalizeDays(days);
  // RPC only. Do not fall back to analytics_events: that table is large and not voice-safe.
  const { data, error } = await client.rpc('analytics_dashboard', { p_days: pDays });
  if (error) throwQueryError(error, 'analytics');
  let payload = data;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      throw new Error('Аналитика недоступна: analytics_dashboard вернул пустой ответ.');
    }
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('Аналитика недоступна: analytics_dashboard вернул пустой ответ.');
  }
  if (payload.days == null) payload = { ...payload, days: pDays };
  return payload;
}

async function selectFeedback(client, columns, { limit, minRating, ratingsOnly = false }) {
  let query = client.from('academy_course_feedback').select(columns);
  if (!ratingsOnly) query = query.order('created_at', { ascending: false });
  if (minRating != null) query = query.gte('rating', minRating);
  if (limit != null) query = query.limit(limit);
  return query;
}

export async function fetchAcademyFeedback({ limit, minRating } = {}) {
  const client = await getClient();
  const capped = clampLimit(limit);
  const rating = normalizeMinRating(minRating);
  let result = await selectFeedback(client, FULL_SELECT, { limit: capped, minRating: rating });
  if (result.error && /column/i.test(result.error.message || '')) {
    result = await selectFeedback(client, LEGACY_SELECT, { limit: capped, minRating: rating });
  }
  if (result.error) throwQueryError(result.error, 'feedback');
  return result.data ?? [];
}

export async function fetchFeedbackStats({ minRating } = {}) {
  const client = await getClient();
  const rating = normalizeMinRating(minRating);
  const pageSize = 1000;
  const ratings = [];
  let total = null;

  for (let from = 0; from < 20000; from += pageSize) {
    let query = client
      .from('academy_course_feedback')
      .select('rating', { count: 'exact' })
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (rating != null) query = query.gte('rating', rating);
    const result = query;
    const { data, error, count } = await result;
    if (error) throwQueryError(error, 'feedback');
    if (typeof count === 'number') total = count;
    const rows = data ?? [];
    for (const row of rows) {
      const n = Number(row.rating);
      if (Number.isFinite(n)) ratings.push(n);
    }
    if (rows.length < pageSize) break;
  }

  const count = total ?? ratings.length;
  const avg = ratings.length ? Math.round((ratings.reduce((sum, n) => sum + n, 0) / ratings.length) * 10) / 10 : null;
  return {
    count,
    avg_rating: avg,
    ...(rating != null ? { min_rating: rating } : {}),
  };
}
