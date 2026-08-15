/** Скопируйте в supabase-config.js и подставьте значения из Supabase Dashboard. */
window.SUPABASE_CONFIG = {
  /** Project Settings → API → Project URL (только домен, без /rest/v1/) */
  url: 'https://YOUR_PROJECT_REF.supabase.co',

  /** Project Settings → API → anon public key */
  anonKey: 'YOUR_ANON_KEY',

  /** Edge Functions → publish-drewo → hub-overview + status */
  publishDrewoUrl: 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/publish-drewo',
};
