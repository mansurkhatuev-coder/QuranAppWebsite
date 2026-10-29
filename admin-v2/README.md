# Terra admin

`/admin-v2/` is the Figma-directed production entry for the new admin. It uses the existing Supabase account and production APIs. `/admin/` remains available through the always-visible “Старый вариант” link and the sign-in fallback.

The UI keeps its local preview separate: on localhost it reads sample content, shows no production analytics, and disables actions that publish or modify cloud data. On `https://waydean.ru/admin-v2/`, the app requires the existing Supabase admin session.

## Connected modules

- Overview and interactive analytics use the existing analytics dashboard and read-only store-download data. The chart shows only the dates returned by the server; all-time totals are shown separately.
- Dua records load from Supabase, preserve their IDs and extra fields, save as cloud drafts, and publish through the existing content publisher after confirmation.
- Azkar and Tajweed documents open in the existing specialist editor with its original Arabic keyboard, font settings, normalization, selection, rule palette, and mark handling. Its existing cloud draft workflow remains intact.
- Home banners and daily pools, app release metadata, course feedback, giveaway entries, translations, and service checks use their existing admin handlers.
- Translation strings are saved as a cloud draft. Publishing those strings into the mobile app remains a separate release step.

No database migration is applied by this UI change. The existing `/admin/` route and its specialist modules remain intact.
