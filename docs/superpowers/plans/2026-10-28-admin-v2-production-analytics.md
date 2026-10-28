# Admin V2 production integration and analytics audit

> **For agentic workers:** Execute this plan inline in the current isolated checkout. Preserve unrelated untracked preview files and never write credentials into source or logs.

**Goal:** Prepare the unified Admin V2 behind the existing Supabase login, preserve the old `/admin/` route as a clear return button, and prevent legacy analytics fallbacks from presenting partial data as authoritative totals.

**Architecture:** Keep the existing `/admin/` application and its data/publishing paths intact. Add `/admin-v2/` as a separate authenticated route that shares the existing Supabase session; in production the overview reads real analytics and reports unavailable data instead of inventing demo values. Audit old product, Academy, store, and service-health analytics separately, then fix only reproducible defects.

**Tech Stack:** Static HTML/CSS/JS, existing Supabase browser client and RPCs, Node.js `node:test`, GitHub Pages.

---

## Current facts

- The isolated branch has been fast-forwarded to current `origin/main` (`39e16c8c750d3263090fba4e66ada18da34cab76`); the local Admin V2 files remain untracked test work and are not on GitHub yet.
- Production `https://waydean.ru/admin/` returns the current legacy admin. `https://waydean.ru/admin-v2/` returns 404.
- The legacy product analytics source is `admin/admin-analytics.js`; its backend is `admin/admin-supabase.js`; the system health panel checks analytics in `admin/admin-command-center.js`.
- If `analytics_dashboard` is unavailable, the legacy UI silently falls back to a recent event sample (maximum 5,000 rows), uses that sample for an all-time device count, and renders unavailable new-install counts as zero.
- The overview currently uses a labeled demo series when it cannot receive live data. Keep that fixture only on localhost; a production route must show a clear empty/unavailable state.
- Store download data is a distinct source from in-app usage. Preserve CSV import and report delays; do not merge store downloads with anonymous device analytics.

## Tasks

- [x] Add regression tests that reproduce the legacy analytics fallback behavior without requiring production credentials or database writes.
- [x] Correct the fallback presentation: identify sampled event counts, show unknown totals as `—`, and never report the 5,000-row sample as all-time devices or unavailable new installs as zero.
- [x] Audit old product analytics, Academy feedback counts, store reports, and the command-center health check; label bounded review samples and keep store/app sources separate.
- [x] Restrict demo chart data to localhost/test preview; production uses read-only analytics series and shows unavailable data instead of demo values.
- [x] Add a shared-session auth gate for `/admin-v2/` using the existing `/admin/` Supabase client and login flow; add links in both directions without changing legacy save/publish behavior.
- [x] Keep V2 editing and publishing local-only. Production content changes continue through the old `/admin/` until the unified editor has a verified API/data mapping.
- [x] Run the local suite, syntax checks, and route checks. No SQL was applied, no Supabase policy or credential was changed, and the authenticated live-browser view remains unverified.
- [x] Update operational notes with source-of-truth semantics, validation evidence, and the remaining production-write boundary.

## Current delivery boundary

The production change is additive: `/admin-v2/` is an authenticated, read-only preview route with a visible return button; `/admin/` remains the live editing and publishing route and gains a link to the preview. Do not describe the unified editor as production-write-ready until its live catalog and save/publish paths have been verified.

Validation in this checkout: `node --test` over `admin` and `admin-v2` — 58/58 passing; JavaScript syntax checks and `git diff --check` pass; local `/admin/` and `/admin-v2/` return HTTP 200. Before publication, production `/admin-v2/` was still 404; `/admin/` returned HTTP 200.
