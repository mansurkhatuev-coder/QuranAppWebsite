# Google Play manual CSV upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual Google Play installs CSV upload beside the current automatic refresh, reusing the authenticated Edge Function and Google Play parser.

**Architecture:** The browser decodes the selected CSV and calls the existing `store-downloads` endpoint through `AdminSupabase`. The Edge Function reuses the current Google Play parser and upserts by `(store, day)`, so imported days replace collisions while automatic refresh remains available.

**Tech Stack:** Plain admin JavaScript, Supabase Edge Functions (Deno/TypeScript), existing `store_download_days` table.

---

## File map

- Modify `supabase/functions/store-downloads/google-play-reports.ts`: export the existing install CSV parser for reuse by manual import.
- Modify `supabase/functions/store-downloads/index.ts`: add the authenticated `upload-google-play` action; persist parsed rows and import metadata.
- Modify `admin/admin-supabase.js`: expose an authenticated `uploadGooglePlayCsv(csv)` method.
- Modify `admin/admin-analytics.js`: add a Google Play file picker and button, decode UTF-16 CSV, show upload progress/results, and reset the picker for repeat selection.
- Modify `admin/index.html`: bump the versioned URLs for the two updated admin scripts to avoid stale browser cache.
- Do not change the database schema or add secrets.

### Task 1: Reuse the existing Google Play parser

**Files:**
- Modify: `supabase/functions/store-downloads/google-play-reports.ts`

- [x] Rename the current `parseInstallReport` function to exported `parseGooglePlayInstallReport`, preserving its body exactly, and update automatic sync to call the renamed function. This keeps required headers (`Date`, `Daily User Installs`), country aggregation, and all existing metric mappings in one parser.
- [x] Review the diff to confirm automatic sync calls the same parser and has no metric changes.

### Task 2: Add the authenticated manual import action

**Files:**
- Modify: `supabase/functions/store-downloads/index.ts`

- [x] Import `parseGooglePlayInstallReport` from `./google-play-reports.ts`.
- [x] Add the following action after the existing `upload-rustore` branch:

```ts
if (action === 'upload-google-play') {
  const csv = String(body.csv || '');
  const rows = parseGooglePlayInstallReport(csv);
  if (!rows.length) {
    return jsonResponse({
      error: 'Не удалось распознать CSV Google Play: нужны колонки «Date» и «Daily User Installs».',
    }, 400);
  }
  const firstDay = rows[0].day;
  const lastDay = rows[rows.length - 1].day;
  const fetchedAt = new Date().toISOString();
  await upsertDays('googleplay', rows, 'google_play_manual_csv');
  await writeMeta('googleplay', {
    status: 'ok',
    message: `CSV Google Play загружен: ${rows.length} дн. · ${firstDay} — ${lastDay}`,
    fetchedAt,
  });
  return jsonResponse({
    ...await snapshot(),
    googlePlayCsvImport: { rows: rows.length, firstDay, lastDay },
  });
}
```

- [x] Keep the existing top-level `requireUser(request)` guard and leave `refresh-google-play` unchanged.
- [x] Review the branch to confirm invalid CSV returns before any upsert or metadata write.

### Task 3: Connect the admin API and file picker

**Files:**
- Modify: `admin/admin-supabase.js`
- Modify: `admin/admin-analytics.js`
- Modify: `admin/index.html`

- [x] Add the wrapper and include it in the exported API:

```js
async function uploadGooglePlayCsv(csv) {
  return callStoreDownloads({ action: 'upload-google-play', csv });
}
```

- [x] Add a persistent hidden `.csv` file input outside `#analytics-stores`, matching the RuStore picker lifecycle.
- [x] Add a **Загрузить CSV Google Play** button beside **Обновить Google Play**. Disable both while any store action is running. Show upload-specific progress text without changing the automatic refresh wording when refresh is idle.
- [x] Extend CSV decoding to detect UTF-16LE/BE BOMs and UTF-16 byte patterns when the BOM is absent; preserve UTF-8 and current RuStore encoding fallback behavior.
- [x] On file selection, read/decode the file, reject an empty file locally, and call `AdminSupabase.uploadGooglePlayCsv(csv)` through `runStoreAction`. Apply the returned snapshot and show imported row count and date range from `googlePlayCsvImport`.
- [x] Reset the input value after success or failure so the same file can be selected again.
- [x] Bump the cache query values for `admin-supabase.js` and `admin-analytics.js` in `admin/index.html`.
- [x] Review markup and event bindings to confirm upload and refresh buttons call distinct actions.

### Task 4: Static review and delivery state

**Files:**
- Review: all files listed above

- [x] Run `git diff --check` and confirm it reports no whitespace errors.
- [x] Review the final diff for authenticated access, error-before-write behavior, overwrite-on-day-conflict semantics, and no changes to secrets or schema.
- [x] Do not run or add automated tests unless the user asks for testing.
- [x] Push the isolated `google-play-manual-csv` branch and prepare a draft PR for review; do not merge, publish, or deploy as part of this plan.
