/** Скопируйте в supabase-config.js и подставьте значения из Supabase Dashboard. */
window.SUPABASE_CONFIG = {
  /** Project Settings → API → Project URL */
  url: 'https://YOUR_PROJECT_REF.supabase.co',

  /** Project Settings → API → anon public key */
  anonKey: 'YOUR_ANON_KEY',

  /** Edge Functions → publish-content → URL (после деплоя функции) */
  publishFunctionUrl: 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/publish-content',
};
