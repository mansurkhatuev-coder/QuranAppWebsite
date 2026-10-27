# Waydean Account History and Backups Implementation Plan

> **For agentic workers:** Execute this plan in the current isolated feature branch. Keep local browser snapshots separate from server snapshots.

**Goal:** Make the allowlisted Waydean account preview expose the production tree's server activity log and backup operations without weakening the existing account boundary.

**Architecture:** Add a small explicit mapping from authenticated Waydean actions to the existing `publish-drewo` operations (`list-backups`, `snapshot`, `pin-backup`, and `restore`). The edge handler continues to verify Supabase identity and the `WAYDEAN_ADMIN_USER_ID` allowlist before every action; restore additionally requires the exact tree and activity version shown to the editor. The account UI labels server history/backups separately from IndexedDB history/backups on this device.

**Tech Stack:** Deno TypeScript edge function, native browser ES modules, Node's built-in test runner, existing GitHub-backed tree and backup files.

---

### Task 1: Define and test the account action boundary

**Files:**
- Create: `supabase/functions/publish-drewo/waydean-admin-actions.ts`
- Create: `supabase/functions/publish-drewo/waydean-admin-actions.test.ts`
- Modify: `supabase/functions/publish-drewo/index.ts`
- Modify: `drewo/waydean-preview-admin-api.mjs`
- Modify: `drewo/waydean-preview-admin-api.test.mjs`

- [x] Add a pure resolver for only `waydean-admin-auth`, `waydean-admin-load`, `waydean-admin-publish`, `waydean-admin-backups`, `waydean-admin-snapshot`, `waydean-admin-pin-backup`, and `waydean-admin-restore`.
- [x] Test every accepted mapping and reject an unknown `waydean-admin-*` action before it reaches the ordinary tree API.
- [x] Add only the four backup operations to the browser API allowlist and test that they still send the verified bearer token and fixed `treeDir: "drewo"`.
- [x] Run the focused Deno and Node tests; both passed.

### Task 2: Guard account restore against stale tree or activity

**Files:**
- Modify: `supabase/functions/publish-drewo/waydean-admin-publish.ts`
- Modify: `supabase/functions/publish-drewo/waydean-admin-publish.test.ts`
- Modify: `supabase/functions/publish-drewo/index.ts`

- [x] Add a pure restore-conflict predicate using the current tree fingerprint plus normalized activity JSON; missing expected values fail closed.
- [x] Test unchanged snapshots, changed tree, changed activity, and missing expected base.
- [x] Require account restore requests to include an expected fingerprint and a valid bounded JSON activity array.
- [x] In the existing `restore` branch, compare those expected values with the current GitHub files immediately before building the restore commit; return HTTP 409 with the current server snapshot on mismatch.
- [x] Make the automatic pre-restore safety snapshot store the current live tree and journal, not the backup being restored.
- [x] Run `deno test supabase/functions/publish-drewo/waydean-admin-publish.test.ts`.

### Task 3: Show and operate server history/backups in account preview

**Files:**
- Modify: `drewo/waydean-preview.html`
- Modify: `drewo/waydean-preview.js`
- Modify: `drewo/waydean-preview-admin-api.mjs`
- Modify: `docs/design/waydean/qa/production-function-inventory-2026-10-27.md`

- [x] Render the account's server activity log separately from local draft activity; render labels and names with `textContent` and tolerate malformed entries.
- [x] Add server backup list, create snapshot, pin/unpin, and restore controls; keep local IndexedDB backup controls visible and labeled as device-only.
- [x] Disable restore and snapshot while the local account draft is dirty, unpublished, saving, or conflicted.
- [x] Before restore, confirm with the user and send the account's loaded fingerprint/activity version; on conflict preserve the local draft and expose the existing reload-current-version recovery path.
- [x] After snapshot, pin, or restore, refresh the relevant server lists and report the exact persistence boundary in the UI.
- [x] Update HTML/CSS/module/service-worker cache versions and the parity inventory; run the focused Deno and Node tests plus syntax checks.

### Task 4: Final review

**Files:**
- Review all files listed above.

- [x] Confirm no raw legacy action became callable from the browser allowlist.
- [x] Confirm local previews still use only IndexedDB and account actions still pass the fixed tree directory.
- [x] Confirm the source preview renders the 157-person tree and the revised account-only controls remain behind the server allowlist.
- [x] Record that this branch has not been deployed and an authenticated account session was not tested.
