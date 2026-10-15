# Waydean Admin Account Access Implementation Plan

> **For agentic workers:** Execute this plan inline in the current approved worktree. Keep unrelated working-tree changes untouched. Do not deploy the Supabase function or publish the production tree.

**Goal:** Let the existing `/admin/` Supabase Auth account open Waydean's read-only production-tree preview, with server-side allowlisting by Auth user ID.

**Architecture:** Reuse the same Supabase JS client configuration and persisted session as `/admin/`. A new `publish-drewo` action verifies the bearer token using Supabase Auth and only accepts the configured `WAYDEAN_ADMIN_USER_ID` for `treeDir: drewo`; the browser invokes this check before requesting the public tree JSON. A production-tree link opens the preview login/entry route. Missing configuration and all failed checks deny access.

**Tech Stack:** Existing Supabase JS v2 UMD client, static HTML/ES modules, Supabase Edge Function (Deno/TypeScript), Node built-in tests, Deno tests.

---

## Files and boundaries

- Create `supabase/functions/publish-drewo/waydean-admin-access.ts`: pure allowlist policy for the exact tree and user ID.
- Create `supabase/functions/publish-drewo/waydean-admin-access.test.ts`: policy tests for allowed, wrong user, missing configuration, missing user, and wrong tree.
- Modify `supabase/functions/publish-drewo/index.ts`: add an early read-only authorization action; preserve all current family-password and tree-role actions.
- Modify `drewo/waydean-preview-access.mjs`: obtain the shared Supabase session and call the new action with its bearer token; return actionable error codes.
- Create `drewo/waydean-preview-access.test.mjs`: test signed-out, allowed, denied, bad endpoint, and failed API cases with injected browser globals.
- Modify `drewo/waydean-preview.html` and `drewo/waydean-preview.js`: load the same public Supabase client/config as `/admin/`, show an email/password login form on the account route, preserve normal local-preview loading, and never sign out the shared session on exit.
- Modify `drewo/waydean-preview.css` or a focused new auth stylesheet: style the account-login form within the existing load/error surface.
- Modify `drewo/index.html`: add an accessible link named “Waydean · предпросмотр” to `/drewo/waydean-preview.html?source=account&state=all-tree` in the existing tree actions/menu.
- Modify `.github/workflows/deploy-supabase-publish-drewo.yml`: map the GitHub Actions secret `WAYDEAN_ADMIN_USER_ID` to the Edge Function secret; explicitly unset it on deployment when the GitHub secret is absent so access remains fail-closed.

## Task 1: Add and prove the allowlist policy

- [x] Write `waydean-admin-access.test.ts` first. Assert that exact `drewo` plus matching non-empty IDs returns `{ ok: true }`; a different ID returns 403; absent configured ID returns 503; absent verified ID returns 401; and any other tree returns 400.
- [x] Run `deno test supabase/functions/publish-drewo/waydean-admin-access.test.ts`; confirm it fails because the module does not yet exist.
- [x] Implement the minimal pure policy in `waydean-admin-access.ts`, returning a typed decision with status and stable error code.
- [x] Re-run the Deno test; all 5 policy cases pass.

## Task 2: Add the Edge Function authorization action

- [x] Add the `waydean-admin-auth` branch before GitHub repository/token setup in `index.ts`, so this check does not fetch the tree registry or tree JSON.
- [x] Reject a non-POST request through the existing method guard; parse `treeDir`, require a verified user with `requireHubUser(request)`, read `WAYDEAN_ADMIN_USER_ID` from Deno env, apply the pure policy, and return only `{ ok: true, treeDir: 'drewo' }` on success.
- [x] Return 401 for absent/invalid Supabase token, 403 for a different Auth ID, 503 when the allowlist secret is missing, and 400 for a different tree; do not log tokens, passwords, or IDs.
- [x] Keep route wiring small and run the Edge Function type check plus policy tests. The check reports existing unrelated type errors at the old merge/photo code paths; it reported no errors in the new auth branch.
- [x] Confirm existing `login-tree`, `auth`, edit, and publish branches were not changed.

## Task 3: Add shared-session login to the Waydean account route

- [x] Write `waydean-preview-access.test.mjs` first for a configured endpoint and injected `window.AdminSupabase`/`fetch`: missing session rejects before fetch; valid session sends `Authorization: Bearer <access_token>` and `treeDir: drewo`; 403 becomes a permission-denied code; invalid endpoint and network/HTTP errors fail closed.
- [x] Run the Node test first; it failed against the old family-session/super-role gate.
- [x] Replace the existing family-session/super-role gate in `waydean-preview-access.mjs` only for the account-preview route. Require `AdminSupabase` session APIs and preserve HTTPS/loopback endpoint validation.
- [x] Add the Supabase v2 script, existing `/admin/supabase-config.js`, and existing `/admin/admin-supabase.js` to `waydean-preview.html` before the module entry point; do not duplicate Supabase credentials.
- [x] Add a hidden email/password form to the account error surface. `showError` reveals it only for sign-in/permission errors; form submit calls `AdminSupabase.signIn`, clears the password field, then reloads to re-run the authorization check before loading the tree. Keep retry for service failures. Leaving the preview navigates back without calling Supabase sign-out.
- [x] Add test assertions that account data fetch is reached only after the authorization promise resolves and the main tree exposes the entry link independent of family super-role.
- [x] Run the browser-access tests and relevant existing Waydean tests; all 13 Node tests pass.

## Task 4: Add entry point and secret handoff configuration

- [x] Add one keyboard-accessible “Waydean · предпросмотр” link to the existing production tree actions/menu in `drewo/index.html`; target the account route and do not expose any secret or bypass token.
- [x] Add `WAYDEAN_ADMIN_USER_ID` as a GitHub Actions environment mapping in the existing deploy workflow. When set, include it in `supabase secrets set`; when absent, unset the Supabase secret and print a concise warning. This edits configuration only; the workflow was not run.
- [x] Check that the new link is only an entry point; the server remains the sole access decision.

## Task 5: Verify and report

- [x] Run `deno test supabase/functions/publish-drewo/waydean-admin-access.test.ts`; 5 pass. The full Edge Function suite also passes 51/51 with `--no-check`.
- [x] Run `deno check supabase/functions/publish-drewo/index.ts`; it reports pre-existing TypeScript errors in the older photo parsing code and `merge-tree.ts`, with none in the added auth branch. The new policy module type-checks independently.
- [x] Run the new browser-access tests and existing Waydean tests; 13 Node tests pass.
- [x] Inspect `git diff --check` and the scoped diff; no unrelated files were staged or committed.
- [x] Report local implementation and test evidence separately from production deployment. Production still requires the exact Supabase Auth user UUID configured in GitHub Actions Secrets and Supabase Edge Function Secrets, followed by a separately approved deployment of the function and static site.

## Review checklist

- The client never sends email/password to `publish-drewo`; only Supabase Auth receives credentials and the Edge Function receives a bearer access token.
- Server validates token with Supabase Auth before comparing its user ID to the allowlist.
- Account route performs authorization before requesting `family-tree.json`.
- Missing secret, invalid token, wrong user, wrong tree, or unavailable endpoint never reveal the tree through this route.
- Existing family-password/super-password, editing, publication, and local HOTI behavior remain intact.
- No production secret or deployment is changed in this work session.
