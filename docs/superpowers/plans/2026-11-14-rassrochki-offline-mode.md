# «Рассрочки» Offline Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the installable PWA usable on desktop and phone without a network after an online sign-in, with a local data snapshot and a safely synchronized offline operation queue.

**Architecture:** A scoped IndexedDB database stores organization snapshots, queued commands, and receipt Blobs. A static offline shell served by the service worker reads that database; authenticated snapshot and sync routes use Supabase RLS/RPCs as the server boundary. The server remains authoritative, and every queued write has a stable operation ID, conflict result, and idempotent retry path.

**Tech Stack:** Next.js 16, React 19, Supabase/PostgreSQL, native Service Worker and IndexedDB APIs, Vitest, `fake-indexeddb` for Node tests.

---

## Files and responsibilities

- `rassrochki/src/lib/offline/types.ts` — snapshot, queue, receipt, and sync-result contracts.
- `rassrochki/src/lib/offline/db.ts` — versioned IndexedDB schema and account-scoped persistence functions.
- `rassrochki/src/lib/offline/model.ts` — deterministic local projections and queue transition rules.
- `rassrochki/src/app/api/offline/snapshot/route.ts` — authenticated, uncached organization snapshot endpoint.
- `rassrochki/src/app/api/offline/sync/route.ts` — authenticated sequential sync endpoint; validates account/org scope and calls transactional database RPCs.
- `rassrochki/public/offline.html` and `rassrochki/public/offline.js` — static offline workspace and UI. Keep the fallback self-contained and cacheable without depending on Next server rendering.
- `rassrochki/public/sw.js` — versioned app-shell caching and navigation fallback; never cache authenticated API responses or receipt URLs.
- `rassrochki/src/components/OfflineBootstrap.tsx` — online snapshot refresh, sync triggers, network status, last sync, pending/conflict counts, storage persistence result.
- `rassrochki/supabase/migrations/019_offline_operations.sql` — operation ledger, row revisions, and organization-scoped idempotent RPCs for client/loan writes, payments, and loan deletion.
- Existing `LoanForm.tsx`, `LoanDetail.tsx`, `LoansList.tsx`, client forms, and `dashboard/page.tsx` — send/reflect queued operations while online behavior remains intact.
- `rassrochki/README.md` — install, first sync, offline limitations, and device-data privacy instructions.

## Task 1: Build and test the local database contract

**Files:**
- Create: `rassrochki/src/lib/offline/types.ts`
- Create: `rassrochki/src/lib/offline/db.ts`
- Create: `rassrochki/src/lib/offline/model.ts`
- Create: `rassrochki/src/lib/offline/db.test.ts`
- Create: `rassrochki/src/lib/offline/model.test.ts`
- Modify: `rassrochki/package.json`, `rassrochki/package-lock.json`

- [x] Add `fake-indexeddb` as a dev dependency and initialize it in the IDB test file before opening the database.
- [x] Write failing tests for saving and retrieving snapshots by the compound `(userId, organizationId)` key; prove one account cannot read or clear another account’s snapshot.
- [x] Write failing tests for enqueue, stable operation IDs, ordered pending reads, retry state changes, completion removal, and receipt `Blob` persistence.
- [x] Write failing model tests showing pending payment/deletion commands change the local dashboard once, and repeated projection does not apply the same command twice.
- [x] Implement a versioned database with `snapshots`, `operations`, and `receiptFiles` stores; every operation and file references its user and organization.
- [x] Implement pure helpers `applyPendingOperations(snapshot, operations)` and `pendingCounts(operations)` with no browser globals, plus `OfflineStore.clearAccount(userId, organizationId)`.
- [x] Run `npm test -- --run src/lib/offline` from `rassrochki`; expected: all new tests pass.

## Task 2: Add snapshot loading and a reliable offline shell

**Files:**
- Create: `rassrochki/src/app/api/offline/snapshot/route.ts`
- Create: `rassrochki/src/components/OfflineBootstrap.tsx`
- Create: `rassrochki/public/offline.html`
- Create: `rassrochki/public/offline.js`
- Modify: `rassrochki/public/sw.js`
- Modify: `rassrochki/src/app/layout.tsx`
- Modify: `rassrochki/src/components/AppShell.tsx`
- Create: `rassrochki/src/lib/offline/snapshot.test.ts`

- [x] Add failing tests for validating complete snapshot envelopes and for rejecting partial/error page responses.
- [x] Implement `GET /api/offline/snapshot` using the server Supabase client; resolve the signed-in user and organization from the profile, query clients, loans, schedules, payments, guarantors, investors, and organization settings under RLS, paginate each list, and set `Cache-Control: private, no-store`.
- [x] Keep the response limited to the fields required by the primary screens; never include auth tokens, platform admin inventory, or receipt file bytes.
- [x] Implement online bootstrap: fetch the complete snapshot, save it only after every page succeeds, record `syncedAt`, and request `navigator.storage.persist()` on explicit “Подготовить офлайн-доступ” activation when available.
- [x] Implement a static offline workspace with tabs for dashboard, clients, loans, and loan details; read only the matching account’s IndexedDB snapshot and clearly show snapshot time and stale state.
- [x] Update the service worker to cache the static offline shell and its assets, serve the shell when an internal navigation fails, and continue bypassing `/api`, Supabase origins, uploads, and signed receipt URLs.
- [x] Add the offline status and manual snapshot refresh action to `AppShell`; do not clear a snapshot when an incomplete network refresh fails.
- [x] Run focused offline tests, `npx tsc --noEmit`, `npx eslint` for the changed TypeScript files, `node --check` for both public JavaScript files, and `npm run build` from `rassrochki`; expected: exit code 0.

## Task 3: Queue offline client and loan changes

**Files:**
- Create: `rassrochki/supabase/migrations/019_offline_operations.sql`
- Create: `rassrochki/src/app/api/offline/sync/route.ts`
- Create: `rassrochki/src/lib/offline/sync.ts`
- Create: `rassrochki/src/lib/offline/sync.test.ts`
- Modify: `rassrochki/src/lib/offline/types.ts`, `rassrochki/src/lib/offline/db.ts`, `rassrochki/public/offline.js`
- Modify: `rassrochki/src/app/(app)/clients/new/page.tsx`, `rassrochki/src/components/ClientsTable.tsx`, `rassrochki/src/components/LoanForm.tsx`

- [ ] Write failing tests for sequential operation ordering, permanent-vs-retryable failures, and a conflict that remains queued without changing the server snapshot.
- [ ] Add operation command types for client create, blacklist toggle, deletion of an unlinked client, and loan create/edit. Include stable `operationId`, `userId`, `organizationId`, `createdAt`, and the base row revision in every update/delete command.
- [ ] Add an operation ledger keyed by operation ID and scoped to authenticated user and organization. Reusing an ID with a different command payload must return a conflict.
- [ ] Implement SQL RPC paths that atomically record the operation result and apply each client or loan mutation. For loan create/edit, preserve the existing schedule and guarantor transaction behavior; do not implement multi-row loan writes as separate client requests.
- [ ] Implement `POST /api/offline/sync` with auth/org checks and a small bounded batch. Process in dependency order; store server-confirmed results; return `synced`, `conflict`, or retryable `failed` per operation.
- [ ] Integrate existing client/loan forms with the queue when offline; show pending state in the offline workspace and online app. Do not present queued changes as server-confirmed.
- [ ] Run new sync tests and TypeScript checks; expected: all sync tests pass and no type errors.

## Task 4: Queue payments, receipts, and confirmed loan deletion

**Files:**
- Modify: `rassrochki/supabase/migrations/019_offline_operations.sql`
- Modify: `rassrochki/src/app/api/offline/sync/route.ts`
- Modify: `rassrochki/src/lib/offline/sync.ts`, `rassrochki/src/lib/offline/model.ts`
- Modify: `rassrochki/src/lib/offline/sync.test.ts`, `rassrochki/src/lib/offline/model.test.ts`
- Modify: `rassrochki/src/components/LoanDetail.tsx`, `rassrochki/src/components/LoansList.tsx`, `rassrochki/public/offline.js`
- Modify: `rassrochki/src/app/(app)/dashboard/page.tsx` or extract shared projection logic into `rassrochki/src/lib/offline/dashboard.ts`

- [ ] Write failing tests for an offline payment applied once after retry, a competing payment that becomes a conflict, an upload failure that preserves its Blob, and deletion totals that change once locally.
- [ ] Reuse the existing payment idempotency key. During sync, upload a receipt to a deterministic organization/loan/operation path before calling `record_payment`; retrying the same upload must not replace another operation’s receipt.
- [ ] Extend the transactional operation ledger so successful payment and deletion outcomes are recorded atomically with their database mutations; a lost HTTP response followed by retry returns the original result.
- [ ] Queue deletion only after the existing explicit confirmation. Keep the loan locally marked “ожидает удаления” and remove its local history only after server confirmation; retain returned receipt paths for server-side cleanup.
- [ ] Apply pending payments and deletions to the local dashboard projection exactly once and mark all affected totals as not yet synchronized.
- [ ] Run focused payment/deletion tests and inspect the SQL migration’s RLS, lock order, idempotency, and transaction boundaries.

## Task 5: Finish status, logout, and user documentation

**Files:**
- Modify: `rassrochki/src/components/OfflineBootstrap.tsx`, `rassrochki/src/components/AppShell.tsx`
- Modify: `rassrochki/src/lib/offline/db.ts`, `rassrochki/public/offline.js`
- Modify: `rassrochki/README.md`

- [ ] Add online/offline state, pending count, conflict count, last successful sync, manual retry, and a nonblocking storage-persistence status.
- [ ] When logout is requested with queued operations, offer to sync first or explicitly discard them; only then clear the current account and organization snapshot, queue, receipts, and account-specific local cache entries.
- [ ] Add “Очистить данные на этом устройстве” and scope it strictly to the active account/organization.
- [ ] Document first online login, first full sync, installation on desktop/phone, stale data, browser storage loss, and that IndexedDB is not a substitute for device encryption.
- [ ] Run focused tests and lint/type checks for changed files; expected: zero errors.

## Task 6: Verify and publish

**Files:** all changed app files, tests, and Supabase migrations above.

- [ ] Run `npm test`, `npx eslint src/app src/components src/lib --max-warnings=0`, `npx tsc --noEmit`, and `npm run build` in `rassrochki`; record each result.
- [ ] Use a browser on localhost to confirm install shell, snapshot load, airplane-mode navigation, queue persistence after refresh, reconnect retry, logout cleanup, and one payment applied once.
- [ ] Inspect `git diff --check` and `git status`; stage only the planned offline-mode files and leave previously untracked loan-edit design/plan documents untouched.
- [ ] Push the isolated branch, open a GitHub pull request, and wait for the required deploy/database workflows. Merge to `main` only after required checks pass; verify the production deployment and migration result.
- [ ] Report tested desktop/mobile browser coverage separately; do not claim a phone-specific QA pass unless a physical phone was actually tested.
