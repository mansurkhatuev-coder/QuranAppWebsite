# Waydean Export Workshop Implementation Plan

> **For agentic workers:** Execute this plan inline in the current session. Keep unrelated working-tree files untouched.

**Goal:** Give users one export workshop with Video and Print tabs while preserving their selected family tree, person, and existing per-tool settings.

**Architecture:** Add a small shared handoff model and a responsive workshop shell at `/docs/design/waydean/export/`. The Waydean tree prepares one same-tab `sessionStorage` handoff containing the current scope and video snapshot; the shell seeds the existing print or video handoff before loading that mode in one embedded frame. The existing print and video renderers remain the owners of their domain controls, drafts, and output formats.

**Tech Stack:** Static HTML, CSS, ES modules, browser `sessionStorage`, existing Print Studio and browser video exporter.

---

### Task 1: Shared export handoff model

**Files:**
- Create: `docs/design/waydean/export/workshop-model.mjs`
- Create: `docs/design/waydean/export/workshop-model.test.mjs`

- [x] Normalize the requested mode to `print` or `video`; reject unknown tree scope data and invalid return contexts.
- [x] Build a versioned handoff that contains the existing print handoff and a `createBrowserVideoHandoff()` snapshot for the same tree/person/scope.
- [x] Add storage read/write helpers that fail closed on malformed JSON and never put people, dates, session tokens, or return URLs in the query string.
- [x] Add Node tests for round-tripping, malformed storage, the two initial modes, and safe return-context selection.

### Task 2: Unified responsive workshop shell

**Files:**
- Create: `docs/design/waydean/export/index.html`
- Create: `docs/design/waydean/export/workshop.css`
- Create: `docs/design/waydean/export/workshop.mjs`
- Modify: `docs/design/waydean/export/print-prototype/index.html`
- Modify: `docs/design/waydean/export/print-prototype/styles.css`
- Modify: `docs/design/waydean/export/video-prototype/browser-export.html`
- Modify: `docs/design/waydean/export/video-prototype/browser-export.css`

- [x] Render one Waydean header, one safe return-to-tree link, a small shared context summary, and two accessible tabs: `Видео` and `Печать`.
- [x] Use a single same-origin iframe for the selected export mode; seed its existing `sessionStorage` handoff immediately before navigation and restore it on every tab switch.
- [x] Preserve the selected mode in `?mode=print|video`, preserve a safe account/family return context, and open a four-person demo only when the workshop is opened without a tree handoff.
- [x] Add embedded styles that hide each child page's duplicate brand/header so it reads as one workspace; preserve both child pages as standalone routes.
- [x] Preserve Video's saved settings on subsequent tab visits by omitting its first-run settings override after the initial load.

### Task 3: Route existing export actions through the workshop

**Files:**
- Modify: `drewo/waydean-preview.js`
- Modify: `drewo/waydean-preview.html`

- [x] Replace separate print/video navigation handlers with one `openExportWorkshop(mode)` path.
- [x] Create both child handoffs from the same loaded tree before navigating, so changing the initial tab never changes the selected people or source.
- [x] Keep current tree mode and source in the return context so leaving the workshop returns to the already-authenticated Waydean tree in the same tab.
- [x] Keep the legacy `browser-export.html` and Print Studio URLs valid for existing bookmarks and direct use.

### Task 4: Verify and publish

- [x] Run the focused model tests and `git diff --check`.
- [x] Open both tabs locally with a large HOTI handoff; verify names/selection, no duplicate page headers, scroll behavior, and switching back and forth without losing each mode's saved settings.
- [ ] Inspect only the files in this plan when staging; preserve the two unrelated untracked background-planning documents.
- [ ] Merge to `main` after checks and verify the GitHub Pages deployment plus the production route with fresh assets.
