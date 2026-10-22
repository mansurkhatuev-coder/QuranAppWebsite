# Google Play manual CSV upload design

## Goal

Let an administrator import a Google Play installs report manually from the existing store analytics panel while preserving the current automatic Google Play refresh.

## Current structure

The store analytics panel already has a manual RuStore CSV upload and an automatic Google Play refresh. Both use the authenticated `store-downloads` Supabase Edge Function. Google Play report parsing lives in `supabase/functions/store-downloads/google-play-reports.ts`; imported store data is kept in `store_download_days`, separate from in-app installation analytics.

## Approaches considered

1. **Send CSV text to the existing authenticated Edge Function (recommended).** The function uses the existing Google Play parser and upserts rows in the current store table. This keeps parsing rules in one place and adds no secret, table, or object-storage bucket.
2. Parse the CSV in the browser and send JSON rows. This would duplicate Google Play parsing and aggregation in the admin client.
3. Store uploaded files in Supabase Storage and process them separately. This adds storage, access rules, and retention decisions without a need for asynchronous processing.

## Design

Add a **«Загрузить CSV Google Play»** button to the existing Google Play panel beside **«Обновить Google Play»**. The button opens a CSV file picker. The admin client decodes Google Play's UTF-16 CSV (including BOM and byte-pattern detection when a BOM is absent), then sends the text to the existing authenticated `store-downloads` function using a new `upload-google-play` action.

The Edge Function reuses the parser currently used by automatic report downloads. It accepts the Google Play installs overview CSV with the `Date` and `Daily User Installs` columns. Existing parser mappings are preserved: daily user installs become downloads, daily device upgrades become updates, daily user uninstalls become uninstalls, and current-user and active-device install columns remain snapshot values. Country rows are aggregated by day using the parser's existing rules.

The function upserts rows into `store_download_days` under `store = googleplay`, with source `google_play_manual_csv`. The existing `(store, day)` conflict key replaces a row when an imported date already exists, as requested. The function writes successful import metadata and returns the normal store snapshot. No schema migration is required. The automatic refresh action stays unchanged and can later update overlapping dates from Google's cloud report.

On success, the panel reports how many daily rows were imported and the covered date range. On an empty, unsupported, or malformed CSV, the server returns an actionable error and does not write rows. The file input is reset after each attempt so the same file can be selected again. The Google service-account secret remains server-side and is not used by manual upload.

## Acceptance criteria

- The Google Play panel offers manual CSV upload alongside the existing refresh action.
- A supported Play Console installs CSV imports daily rows through the existing authenticated function and current parser.
- Reimporting a date replaces that date's Google Play row without creating a duplicate.
- Invalid files produce a visible error and do not write partial data.
- A successful upload updates the normal admin snapshot and success message.
- Automatic Google Play refresh remains available and continues to use its existing action.
- The implementation introduces no new secret, table, or storage bucket.

## Scope and limitations

Manual upload supports the Google Play installs overview CSV understood by the current parser. It does not add revenue, ratings, acquisition, or other Play Console report types. Google Play values remain subject to the source report's publication delay.
