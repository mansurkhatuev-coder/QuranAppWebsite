# Academy Teacher Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the Medrese assessment on the teacher home screen and make lesson launch controls unambiguous.

**Architecture:** `academy-courses.js` identifies assessment lessons. `academy.js` renders a pinned assessment section and applies the selected lesson's launch policy. `academy/index.html` supplies semantic wrappers for settings that only apply to ordinary lessons.

**Tech Stack:** Static HTML, CSS, browser JavaScript, Node assertion script.

---

### Task 1: Add coverage for the teacher flow

**Files:**
- Create: `scripts/verify-academy-teacher-flow.cjs`
- Test: `scripts/verify-academy-teacher-flow.cjs`

- [ ] **Step 1: Write a failing static test**

```js
assert.match(courses, /function isAssessmentLesson/);
assert.match(app, /academy-assessments/);
assert.match(app, /start-settings-lesson-only/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/verify-academy-teacher-flow.cjs`

Expected: failure because the new classification and UI wrappers do not exist.

- [ ] **Step 3: Implement the smallest UI changes**

Add assessment classification, a pinned section, and launch-policy visibility handling.

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/verify-academy-teacher-flow.cjs`

Expected: `academy teacher flow checks passed`.

### Task 2: Validate the updated client

**Files:**
- Modify: `academy/index.html`
- Modify: `academy/academy.js`
- Modify: `academy/academy-courses.js`
- Modify: `academy/academy.css`

- [ ] **Step 1: Check JavaScript syntax**

Run: `node --check academy/academy.js && node --check academy/academy-courses.js`

Expected: no output and exit code zero.

- [ ] **Step 2: Run the targeted flow test**

Run: `node scripts/verify-academy-teacher-flow.cjs`

Expected: `academy teacher flow checks passed`.
