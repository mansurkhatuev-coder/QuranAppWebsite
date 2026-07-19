import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const GIVEAWAY_MIN = 95;
const CAMPAIGN = 'tajweed_final_v1';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  });
}

function normalizePhone(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = `+${digits.slice(1).replace(/\D/g, '')}`;
  else digits = digits.replace(/\D/g, '');
  let national = digits.startsWith('+') ? digits.slice(1) : digits;
  if (national.startsWith('8') && national.length === 11) national = `7${national.slice(1)}`;
  if (national.length === 10 && /^9\d{9}$/.test(national)) national = `7${national}`;
  if (!/^\d{11,15}$/.test(national)) return null;
  return `+${national}`;
}

function makeCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'config' }, 500);

  const supabase = createClient(supabaseUrl, serviceKey);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid' }, 400);
  }

  const campaignId = typeof body.campaign_id === 'string' ? body.campaign_id : CAMPAIGN;
  const clientId = typeof body.client_id === 'string' ? body.client_id.trim() : '';
  const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : '';
  const phoneRaw = typeof body.phone_raw === 'string' ? body.phone_raw : String(body.phone ?? '');
  const scorePercent = typeof body.score_percent === 'number' ? Math.round(body.score_percent) : -1;
  const examVersion = typeof body.exam_version === 'string' ? body.exam_version : '';
  const attemptedAt = typeof body.attempted_at === 'string' ? body.attempted_at : null;
  const consentAt = typeof body.consent_at === 'string' ? body.consent_at : new Date().toISOString();

  if (!clientId || !displayName || !examVersion) return json({ error: 'invalid' }, 400);
  if (scorePercent < GIVEAWAY_MIN) return json({ error: 'score' }, 400);

  const phone = normalizePhone(typeof body.phone === 'string' ? body.phone : phoneRaw);
  if (!phone) return json({ error: 'phone' }, 400);

  const { data: settings, error: settingsError } = await supabase
    .from('academy_giveaway_settings')
    .select('active')
    .eq('campaign_id', campaignId)
    .maybeSingle();

  if (settingsError) return json({ error: 'server' }, 500);
  if (!settings?.active) return json({ error: 'inactive' }, 403);

  const { data: existing } = await supabase
    .from('academy_final_exam_entries')
    .select('code')
    .eq('campaign_id', campaignId)
    .eq('client_id', clientId)
    .maybeSingle();

  if (existing?.code) {
    return json({ existing_code: existing.code }, 409);
  }

  let code = makeCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { error: insertError } = await supabase.from('academy_final_exam_entries').insert({
      campaign_id: campaignId,
      client_id: clientId,
      code,
      display_name: displayName,
      phone,
      phone_raw: phoneRaw,
      score_percent: scorePercent,
      exam_version: examVersion,
      attempted_at: attemptedAt,
      consent_at: consentAt,
      status: 'entered',
      app_version: typeof body.app_version === 'string' ? body.app_version : null,
      platform: typeof body.platform === 'string' ? body.platform : null,
      locale: typeof body.locale === 'string' ? body.locale : null,
    });
    if (!insertError) return json({ code });
    if (String(insertError.message || '').includes('duplicate') || insertError.code === '23505') {
      code = makeCode();
      continue;
    }
    return json({ error: 'server', detail: insertError.message }, 500);
  }

  return json({ error: 'server' }, 500);
});
