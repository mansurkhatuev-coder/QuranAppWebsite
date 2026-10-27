# Waydean Admin Access Controls Implementation Plan

> **For agentic workers:** Implement inline using the existing account allowlist and `publish-drewo` edge function. Keep every write behind the server authorization check.

**Goal:** Bring the production tree's edit lock and family-password controls into the Waydean account view without requiring the old superpassword.

**Architecture:** Add two explicit account-only actions to the existing server and browser allowlists. The authenticated `waydean-admin-load` response will include only the effective lock state and its public reason. The More panel will show lock status and guarded controls only after an allowlisted account session is established; passwords remain transient form values and are never persisted by Waydean.

**Tech Stack:** Deno Edge Function, browser ES modules, HTML/CSS, `node:test` and Deno tests.

---

### Task 1: Authorize the two mutations through the existing allowlist

**Files:**
- Modify: `supabase/functions/publish-drewo/waydean-admin-actions.ts`
- Test: `supabase/functions/publish-drewo/waydean-admin-actions.test.ts`
- Test: `drewo/waydean-preview-admin-api.test.mjs`

- [x] Add explicit mappings `waydean-admin-lock -> set-lock` and `waydean-admin-password -> set-password` to the server action table and test both mappings.
- [x] Add both action names to the browser allowlist and test that each uses the fixed `drewo` route with the verified bearer token.
- [x] Keep direct legacy action names rejected by the browser module.
- [x] Run the targeted Deno and Node tests before implementation to observe the expected allowlist failures, then again after implementation.

### Task 2: Return safe lock state with the account tree

**Files:**
- Modify: `supabase/functions/publish-drewo/index.ts`
- Test: `supabase/functions/publish-drewo/waydean-admin-load.test.ts`

- [x] Fetch the existing `access.json` alongside the tree and index only in the already account-authorized `waydean-admin-load` branch.
- [x] Return `locked`, `lockedReason`, and a safe `canToggleLock` flag; never return `passwordHash`, vault content, or other access secrets.
- [x] Add a small pure response-shaping helper and tests that locked, unlocked, billing-locked, and deleted trees expose only effective public lock fields.
- [x] Run the targeted Deno tests and existing admin action tests.

### Task 3: Add account-only controls to Waydean

**Files:**
- Modify: `drewo/waydean-preview.html`
- Modify: `drewo/waydean-preview.js`
- Modify: `drewo/waydean-preview-auth.css`

- [x] Add a hidden admin tools section to the More panel with current lock status, a lock/unlock button, and a two-field password form.
- [x] Reveal the section only after `requireWaydeanAdminAccess('drewo')` and successful account tree load; leave it hidden for fixture and device-local previews.
- [x] Send lock and password writes through `callWaydeanAdminAction` only. Confirm lock-state changes, check normalized passwords for equality and the server's 2–64 character limit, disable controls during requests, clear the password fields after success, and announce errors without logging password values.
- [x] Bump the page's CSS/JS cache versions and the Waydean offline shell cache version.
- [x] Run focused browser tests, all `publish-drewo` Deno tests, Edge typecheck, browser syntax checks, and `git diff --check`; inspect the final diff.
- [ ] Publish through the repository's production Pages workflow and the Edge code-only workflow, then verify both deployments.

### Self-review

- The browser action list and server action list must match exactly for both new operations.
- No control may become visible from URL parameters alone; the authenticated server allowlist must succeed first.
- A lock/password change must not be executed during implementation or QA; only the UI and server route are published.
- The old `drewo/index.html` remains available and unchanged as fallback.
