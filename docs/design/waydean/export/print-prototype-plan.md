# Waydean Print Studio Prototype Implementation Plan

> **For agentic workers:** Follow the approved Print Design System and work only in the local design prototype. Keep each change reviewable; do not publish or alter production.

**Goal:** Build a local interactive print-export prototype that lets a user choose tree scope and paper settings, inspect a paginated paper preview, and create local preview files from fictional data.

**Architecture:** Keep the prototype standalone under `docs/design/waydean/export/print-prototype/`. Put scope selection, tree placement, sheet recommendation, and page tiling in a pure ES module with Node tests; keep the UI in plain HTML/CSS/ES modules, reusing the shared 12-person fictional fixture. No production APIs, database, real family data, or public QR links.

**Tech Stack:** HTML, CSS, browser ES modules, SVG, Canvas, Node built-in test runner.

---

## Files

- Create `print-prototype/layout.mjs` for deterministic scope and page layout functions.
- Create `print-prototype/layout.test.mjs` for scope-depth, full-tree preservation, pagination, and format recommendation behavior.
- Create `print-prototype/index.html`, `styles.css`, and `app.mjs` for the responsive local preview and controls.
- Create `print-prototype/README.md` for local run instructions and prototype limits.
- Update `../README.md` and the main product specification with the local prototype status.

## Task 1: Tree scope and page layout

- [x] Write tests first for descendant depth, whole-tree inclusion, tiled-page completeness, and automatic paper recommendation.
- [x] Run `node --test docs/design/waydean/export/print-prototype/layout.test.mjs`; confirm the first failure is the missing module/API.
- [x] Implement the minimal pure functions in `layout.mjs` and rerun the focused test until all cases pass (6/6).

## Task 2: Local print configurator

- [x] Build a desktop-first dark Waydean studio with a compact settings column and a light, high-contrast paper preview; stack these regions at narrow widths.
- [x] Wire fictional-tree scope, person, direction, generation depth, photos/dates, A4–A0, orientation, format recommendation, page navigation, and tile overview to the pure layout module.
- [x] Keep QR visibly unavailable until the access model is approved; explain why it is unavailable.
- [x] Implement local SVG download and a print-only browser PDF flow; label prototype limits and preserve selected settings on errors. PNG export is excluded per the user's decision.

## Task 3: Review and record

- [x] Open the prototype from a local HTTP server at 1440 × 900 and narrow/mobile widths; verify controls, preview updates, pagination, and no overlap. Do not save a PNG screenshot.
- [x] Verify the local SVG is generated from the fictional-data snapshot and the print view contains only all paper pages.
- [x] Generate and visually review the local PDFs through Chromium's print-to-PDF path; validate all 33 pages and physical page sizes. This does not verify the interactive system dialog or the user's Save-as-PDF path.
- [ ] Verify the interactive system print dialog and a PDF saved through the button's normal user path. PNG export remains excluded per the user's decision; no PNG screenshot was saved.
- [x] Run `git diff --check`, check internal Markdown links, and update the roadmap to distinguish this local prototype from production export.
- [x] Leave the work local and uncommitted for user review; no push or production change in this plan.
