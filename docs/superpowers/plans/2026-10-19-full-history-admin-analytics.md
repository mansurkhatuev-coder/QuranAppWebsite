# Full-history admin analytics Implementation Plan

> **For agentic workers:** Use this plan to implement the approved design in the current isolated branch. Keep changes limited to admin product analytics.

**Goal:** Make admin analytics cards, course breakdowns, and course funnels use complete server-side aggregates for the selected period.

**Architecture:** Extend the authenticated `analytics_dashboard(p_days)` RPC with full period totals, azkar category groups, per-course lesson totals, and course funnel counts. The browser uses that response as its source of truth and fetches recent raw events only as a clearly labelled compatibility fallback.

**Tech Stack:** PostgreSQL / Supabase RPC, browser JavaScript, static HTML admin page.

---

### Task 1: Add an incremental server analytics migration

**Files:**
- Create `admin/supabase-migration-analytics-full-history.sql`

- [x] Replace `analytics_dashboard(integer)` with an idempotent function that bounds selected and previous periods to `now()`, returns complete period totals, groups azkar completions by category, groups lesson completions by course including `__missing__`, and derives course funnels from all lesson events in the selected range.
- [x] Keep the current supported course thresholds (`names99=10`, `madina=23`, `tajweed=44`) and the existing authenticated execute grant.
- [x] Ensure all-time `period.active` is the all-time known installation count, with explicit UI semantics supplied by the client.

### Task 2: Make the browser use server aggregates

**Files:**
- Modify `admin/admin-analytics.js`
- Modify `admin/admin-supabase.js`
- Modify `admin/index.html`

- [x] Recognize a complete dashboard response by the presence of all server detail arrays; use it for category counts, lesson courses, and funnels.
- [x] Fetch raw events only if the server response lacks full-history details; preserve the existing fallback path for deployments awaiting the new migration.
- [x] Label fallback course and category details as derived from the recent event sample when the result is truncated.
- [x] Label period activity as `Активны за период`; label the all-time value as `Всего устройств` and update the analytics summary to match.
- [x] Bump the admin analytics script cache version.

### Task 3: Document deployment and fallback semantics

**Files:**
- Modify `admin/SUPABASE-SETUP.md`

- [x] Document applying the incremental migration after the base dashboard migration.
- [x] State that full-history details are available after migration and explain the labelled compatibility fallback before it is applied.

### Task 4: Review the resulting change set

- [x] Inspect the SQL function, client data flow, UI labels, setup order, and branch diff for consistency with the approved design.
- [x] Keep the production Supabase project and published website unchanged during this local implementation.
