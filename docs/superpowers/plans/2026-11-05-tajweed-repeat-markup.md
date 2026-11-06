# Repeated Tajweed Markup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an editor reuse the selected word or phrase's visual Tajweed marks on one, all exact, or manually approved similar occurrences in the current document, with one-step undo.

**Architecture:** Add a pure helper under `admin-v2/tajweed-editor/` for token matching, sentence candidates, mark-range replacement, and source-to-target mapping. Keep document state and undo integration in `editor.js`; render the review and selection UI in a native dialog. Similar candidates are suggestions only and copy marks to unchanged, unambiguously aligned words.

**Tech Stack:** Existing static HTML/CSS/JavaScript, browser `window` helpers, Node's built-in `node:test` and `vm` for local unit tests.

---

## File map

- `admin-v2/tajweed-editor/reapply-markup.js` — pure token matching and mark-copying helpers; no editor state or DOM.
- `admin-v2/tajweed-editor/reapply-markup.test.mjs` — matching, alignment, range splitting, and immutable text tests.
- `admin-v2/tajweed-editor/index.html` — action button, review dialog, helper script tag, and help text.
- `admin-v2/tajweed-editor/editor.js` — selected-source handling, preview list, selected-target application, and one history checkpoint.
- `admin-v2/tajweed-editor/editor.css` — responsive dialog and candidate list styling.

## Task 1: Add deterministic matching and mark-copying helpers

**Files:**
- Create `admin-v2/tajweed-editor/reapply-markup.js`
- Create `admin-v2/tajweed-editor/reapply-markup.test.mjs`

- [x] **Step 1: Write local behavior tests**

Use the existing `vm.runInNewContext(source, { window })` test pattern. Cover exact whole-word and phrase matches, case and repeated-space normalization, preservation of apostrophes/diacritics, similar sentence ranking, minimum two matched words, and leaving changed words untouched.

Also test that applying to disjoint targets splits existing marks and preserves their non-target left/right pieces and metadata; text input is never modified; ambiguous source/target token lengths are reported as skipped.

- [x] **Step 2: Implement the helper API**

Expose `window.AdminV2TajweedReapplyMarkup` with:

```js
{
  findExactMatches(text, start, end),
  findSimilarCandidates(text, start, end),
  applyToTargets(text, marks, sourceRange, targetRanges),
}
```

Tokenize whole words while retaining original UTF-16 offsets. Compare NFC, case-folded tokens; keep diacritics and apostrophe characters in token keys. Exact matches require the selected token sequence to be consecutive. Similar candidates are sentence spans that preserve token order, share at least two words, and match at least half the source words. Rank candidates by matching-word ratio.

For each target, align identical tokens in order and transfer only visible mark fields (`rules`, `accent`, `hidden`). Replace visual marks inside target token ranges, preserve note metadata and split crossing marks to preserve their outside segments, and report any token whose normalized text matches but whose original length prevents a safe offset mapping. Leave the source document text untouched.

- [x] **Step 3: Run focused tests locally**

Run `node --test admin-v2/tajweed-editor/reapply-markup.test.mjs`.

Expected: local checks (133 Admin V2 tests, JavaScript syntax, diff whitespace) passed. Manual selection/apply/undo in the browser remains unverified because the local preview did not deliver text selection to the editor.

## Task 2: Add the review dialog and editor integration

**Files:**
- Modify `admin-v2/tajweed-editor/index.html`
- Modify `admin-v2/tajweed-editor/editor.js`

- [x] **Step 1: Add the entry point and dialog**

Add a button labelled `Повторить разметку` near the existing selection tools. Add a dialog showing the selected marked source text, exact matches, a separate similar-candidates section, contextual snippets, and a checkbox per target. Add select-all/clear controls for each section and a summary of the number of ranges to be changed. Disable applying when there is no marked source or no selected target.

Load `reapply-markup.js` before `editor.js` with a new cache version. Add a short help-list entry explaining exact matches, manual review for similar phrases, and one-step undo.

- [x] **Step 2: Build the candidate list from the active document**

On open, capture the current source selection and its visible mark snapshot. Ask the helper for exact matches and similar candidates from `doc.transliteration`; exclude the source range from target defaults. Show similar candidates unchecked and visually distinguish words that can be copied from words that differ.

- [x] **Step 3: Apply all checked targets as one edit**

On submit, pass only checked ranges to `applyToTargets`. If the helper reports no applicable ranges, show the skipped reason and do not create history. Otherwise call `pushHistory()` once, assign the returned marks once, clear transient selection state, close the dialog, call `renderAll()`, and announce the applied/skipped counts. The one history snapshot makes the existing Undo button revert the entire operation.

## Task 3: Style the dialog and local verification

**Files:**
- Modify `admin-v2/tajweed-editor/editor.css`

- [x] **Step 1: Style readable target previews**

Make the dialog fit desktop and mobile widths, keep phrase snippets readable, show exact and similar groups separately, provide visible checkbox/focus states, and allow the result list to scroll without hiding the apply/cancel actions.

- [x] **Step 2: Run local checks**

Run:

```powershell
node --test admin-v2/tajweed-editor/reapply-markup.test.mjs admin-v2/tajweed-editor/normalization.test.mjs admin-v2/tajweed-editor/document-switch.test.mjs admin-v2/tajweed-editor/preview-selection.test.mjs admin-v2/tajweed-editor/storage-isolation.test.mjs admin-v2/tajweed-editor/storage-recovery.test.mjs
node --check admin-v2/tajweed-editor/reapply-markup.js
node --check admin-v2/tajweed-editor/editor.js
git diff --check
```

Expected: local checks (24 tests, JavaScript syntax, diff whitespace) passed. Manual selection/apply/undo in the browser remains unverified because the local preview did not deliver text selection to the editor.

## Task 4: Publish to production

- [ ] Commit the reviewed feature files on the branch based on the fetched `origin/main`.
- [ ] Confirm the branch still fast-forwards from `origin/main`, then push the feature commit directly to `main` as requested.
- [ ] Wait for the GitHub Pages deployment workflow to finish, then verify `https://waydean.ru/admin-v2/tajweed-editor/` serves the new cache version and the helper script returns HTTP 200.
- [ ] Report the production result separately from local tests; do not claim publication until the live cache version changes.

## Spec coverage

- Current document only, source preview, exact matches, and one-or-selected results: Tasks 1–2.
- Similar phrase suggestions with manual approval and unchanged differing words: Tasks 1–2.
- Replace marks within targets while preserving outside marks: Task 1.
- One-step undo/redo and unchanged transliteration/Arabic/other documents: Task 2.
- Responsive review UI, local validation, and production deployment evidence: Tasks 3–4.
