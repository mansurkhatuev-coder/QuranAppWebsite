import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const PROJECT_REF = 'rivjkiksknnesahrvamf';

const CREATE_SQL = `
create table if not exists public.store_download_days (
  store text not null check (store in ('rustore', 'appstore')),
  day date not null,
  downloads integer not null default 0 check (downloads >= 0),
  updates integer not null default 0 check (updates >= 0),
  source text not null default 'csv',
  fetched_at timestamptz not null default now(),
  primary key (store, day)
);

create table if not exists public.store_download_meta (
  key text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.store_download_days enable row level security;
alter table public.store_download_meta enable row level security;

drop policy if exists "authenticated read store download days" on public.store_download_days;
create policy "authenticated read store download days"
  on public.store_download_days
  for select
  to authenticated
  using (true);

drop policy if exists "authenticated read store download meta" on public.store_download_meta;
create policy "authenticated read store download meta"
  on public.store_download_meta
  for select
  to authenticated
  using (true);

create index if not exists store_download_days_day_idx
  on public.store_download_days (day desc);
`;

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  return /does not exist|relation|schema cache/i.test(String(error.message || ''));
}

async function applySqlViaManagementApi(): Promise<boolean> {
  const token = (Deno.env.get('SUPABASE_MGMT_TOKEN') || Deno.env.get('SUPABASE_ACCESS_TOKEN') || '').trim();
  if (!token) return false;
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: CREATE_SQL }),
  });
  return response.ok;
}

let ensured: Promise<void> | null = null;

export function ensureStoreDownloadSchema(client: SupabaseClient): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const probe = await client.from('store_download_days').select('day').limit(1);
      if (!probe.error) return;
      if (!isMissingTable(probe.error)) throw probe.error;
      const created = await applySqlViaManagementApi();
      if (!created) {
        throw new Error('Таблица store_download_days ещё не создана. Выполните SQL миграцию.');
      }
      const again = await client.from('store_download_days').select('day').limit(1);
      if (again.error) throw again.error;
    })().catch((error) => {
      ensured = null;
      throw error;
    });
  }
  return ensured;
}
