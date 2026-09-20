#!/usr/bin/env node
/**
 * Create / update an Academy teacher Auth user + academy_teachers row.
 *
 * Auth (one of):
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_ACCESS_TOKEN  (fetches service_role via Management api-keys)
 *
 * Also needs:
 *   SUPABASE_URL or SUPABASE_PROJECT_REF (default rivjkiksknnesahrvamf)
 *
 * Usage:
 *   node scripts/create-academy-teacher.mjs \
 *     --email teacher@example.com \
 *     --password '••••••••' \
 *     --name 'Учитель медресе'
 */
import { createHash } from 'node:crypto';

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const email = String(arg('email') || process.env.TEACHER_EMAIL || '')
  .trim()
  .toLowerCase();
const password = String(arg('password') || process.env.TEACHER_PASSWORD || '');
const displayName = String(arg('name') || process.env.TEACHER_NAME || 'Учитель медресе').trim();
const ref = String(process.env.SUPABASE_PROJECT_REF || 'rivjkiksknnesahrvamf').trim();
const url = String(process.env.SUPABASE_URL || `https://${ref}.supabase.co`).replace(/\/$/, '');
const accessToken = String(process.env.SUPABASE_ACCESS_TOKEN || '').trim();
let serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const UA = 'Mozilla/5.0 (compatible; WaydeanTeacherProvision/1.0; +https://waydean.ru)';

if (!email || !password || password.length < 8) {
  console.error('Need --email and --password (min 8 chars)');
  process.exit(1);
}

async function fetchServiceRole(token) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'User-Agent': UA,
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`api-keys HTTP ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  }
  if (!Array.isArray(data)) throw new Error('unexpected api-keys response');
  for (const row of data) {
    const name = String(row?.name || row?.id || '').toLowerCase();
    const typ = String(row?.type || '').toLowerCase();
    const key = row?.api_key || row?.value || row?.key;
    if (!key) continue;
    if (name === 'service_role' || name === 'secret' || typ === 'service_role' || typ === 'secret') {
      return key;
    }
    if (name.includes('service')) return key;
  }
  for (const row of data) {
    const key = row?.api_key || row?.value;
    if (!key || String(key).split('.').length !== 3) continue;
    try {
      const payload = JSON.parse(
        Buffer.from(String(key).split('.')[1] + '==', 'base64url').toString('utf8'),
      );
      if (payload?.role === 'service_role') return key;
    } catch {
      /* ignore */
    }
  }
  throw new Error('service_role key not found');
}

if (!serviceKey) {
  if (!accessToken) {
    console.error('Need SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ACCESS_TOKEN');
    process.exit(1);
  }
  serviceKey = await fetchServiceRole(accessToken);
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

async function listUsersByEmail(target) {
  // Prefer filter; fall back to scan first page if filter unsupported.
  const q = new URLSearchParams({ page: '1', per_page: '200' });
  const res = await fetch(`${url}/auth/v1/admin/users?${q}`, { headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`list users HTTP ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  }
  const users = Array.isArray(body?.users) ? body.users : Array.isArray(body) ? body : [];
  return users.filter((u) => String(u?.email || '').toLowerCase() === target);
}

async function createUser() {
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: displayName },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.msg || body?.error_description || body?.message || res.status;
    const err = new Error(String(msg));
    err.body = body;
    err.status = res.status;
    throw err;
  }
  return body?.id || body?.user?.id;
}

async function updateUser(userId) {
  const res = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: displayName },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `update user HTTP ${res.status}: ${body?.msg || body?.message || JSON.stringify(body).slice(0, 200)}`,
    );
  }
  return body?.id || userId;
}

async function upsertTeacher(userId) {
  const res = await fetch(`${url}/rest/v1/academy_teachers?on_conflict=user_id`, {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({
      user_id: userId,
      display_name: displayName,
      is_active: true,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`academy_teachers upsert failed: ${text || res.status}`);
  return text;
}

async function verifyLogin() {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`login verify failed: ${body?.error_description || body?.msg || res.status}`);
  }
  return Boolean(body?.access_token);
}

const existing = await listUsersByEmail(email);
let userId;
let action = 'created';
if (existing.length) {
  userId = existing[0].id;
  await updateUser(userId);
  action = 'updated';
} else {
  try {
    userId = await createUser();
  } catch (err) {
    // Race / already exists — try update path.
    const again = await listUsersByEmail(email);
    if (!again.length) throw err;
    userId = again[0].id;
    await updateUser(userId);
    action = 'updated';
  }
}

if (!userId) {
  console.error('No user id');
  process.exit(1);
}

await upsertTeacher(userId);
await verifyLogin();

console.log(
  JSON.stringify(
    {
      ok: true,
      action,
      user_id: userId,
      email,
      display_name: displayName,
      login: 'https://waydean.ru/academy/',
      password_fingerprint: createHash('sha256').update(password).digest('hex').slice(0, 12),
    },
    null,
    2,
  ),
);
