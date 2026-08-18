/** Скопируйте в supabase-config.js и подставьте значения из Supabase Dashboard. */
window.SUPABASE_CONFIG = {
  /** Project Settings → API → Project URL (только домен, без /rest/v1/) */
  url: 'https://YOUR_PROJECT_REF.supabase.co',

  /** Project Settings → API → anon public key */
  anonKey: 'YOUR_ANON_KEY',

  /** Edge Functions → publish-content → URL (после деплоя функции) */
  publishFunctionUrl: 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/publish-content',

  /** Edge Functions → rustore-version → live RuStore version for admin HUD / release form */
  rustoreVersionUrl: 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/rustore-version',

  /** Edge Functions → sync-app-release → sync store channels into app-release.json */
  syncAppReleaseUrl: 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-app-release',

  /** Edge Functions → store-downloads → RuStore CSV + App Store Connect */
  storeDownloadsUrl: 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/store-downloads',
};
