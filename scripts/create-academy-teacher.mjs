#!/usr/bin/env node
/**
 * Create a dedicated Academy teacher Auth user + academy_teachers row.
 *
 * Requires:
 *   SUPABASE_URL              (e.g. https://xxxx.supabase.co)
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/create-academy-teacher.mjs \
 *     --email teacher@example.com \
 *     --password '••••••••' \
 *     --name 'Учитель медресе'
 */

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
const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');

if (!url || !serviceKey) {
  console.error('Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!email || !password || password.length < 8) {
  console.error('Need --email and --password (min 8 chars)');
  process.exit(1);
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

const createRes = await fetch(`${url}/auth/v1/admin/users`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: displayName },
  }),
});
const created = await createRes.json().catch(() => ({}));
if (!createRes.ok) {
  console.error('Auth createUser failed:', created?.msg || created?.error_description || created?.message || createRes.status);
  process.exit(1);
}

const userId = created?.id || created?.user?.id;
if (!userId) {
  console.error('No user id returned', created);
  process.exit(1);
}

const upsertRes = await fetch(
  `${url}/rest/v1/academy_teachers?on_conflict=user_id`,
  {
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
  },
);
const upsertBody = await upsertRes.text();
if (!upsertRes.ok) {
  console.error('academy_teachers upsert failed:', upsertBody || upsertRes.status);
  console.error('Auth user was created:', userId, email);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      user_id: userId,
      email,
      display_name: displayName,
      login: 'https://waydean.ru/academy/',
    },
    null,
    2,
  ),
);
