# Waydean Real Data Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Validate the approved Waydean desktop and mobile visual direction against the read-only `drewo/family-tree.json` dataset, then capture local screenshots and a static performance baseline.

**Architecture:** Add a separate read-only preview page under `drewo/` that consumes a pure tree-normalization module. Keep `drewo/index.html`, its editor, remote APIs, backups, and deployment workflows unchanged. Use existing family records only at runtime; do not add names or real-data screenshots to committed artifacts.

**Tech Stack:** HTML, CSS, browser ES modules, Node.js built-in test runner, local Edge/Playwright verification.

---

### Task 1: Normalize the nested family tree safely

**Files:**
- Create: `drewo/waydean-preview-model.mjs`
- Create: `drewo/waydean-preview-model.test.mjs`
- Read only: `drewo/family-tree.json`

- [x] Add unit cases for parent IDs, generation depth, date normalization, photo flags, and child counts using a small fictional fixture.
- [x] Add an integration assertion that the local source file loads 157 records, without printing record names or identifiers.
- [x] Implement the minimal normalization helper and pass the tests.

### Task 2: Build an isolated read-only preview

**Files:**
- Create: `drewo/waydean-preview.html`
- Create: `drewo/waydean-preview.css`
- Create: `drewo/waydean-preview.js`
- Reuse: `docs/design/waydean/assets/references/waydean-mobile-cinematic-background.png`

- [x] Load the local JSON without authentication or writes; make no requests to Supabase or the publish function.
- [x] Show the 157-person count, a three-generation context around a real selected person, profile, search, filters, path/branch focus, and empty states.
- [x] Keep the layout responsive at the approved 1440 × 900 desktop and 390 × 844 mobile viewports.
- [x] Use a neutral face-free silhouette only where a record has no photo; for the single photo-tagged record, load its existing local thumbnail only. Do not call remote photo endpoints or copy photos into the branch.

### Task 3: Verify and document the real-data review

**Files:**
- Modify: `docs/design/waydean/states/screen-state-catalog.md`
- Create or update: local screenshot outputs only; never commit screenshots containing real family data.

- [x] Verify counts and tree depth, core interactions, empty states, and no JavaScript errors in Edge.
- [x] Measure local parse/render time and DOM node count at initial view; record it as a static local baseline, not a device performance result.
- [x] Capture desktop and mobile screenshots for the user to review, while keeping them outside Git.
- [x] Run `node --test drewo/waydean-preview-model.test.mjs`, `node --check drewo/waydean-preview.js`, and `git diff --check`.
- [x] Commit/push only the preview code and documentation to the existing review branch after local checks. Do not publish or merge to production.
