# Nek family login — deploy checklist

Branch: `feat/nek-family-login`  
Verified at commit: `a2a2cf3a6a691f386deaa51bc9f9b5cb2688f401`  
Merge-base with `origin/main`: `0368d92f4a6477410f45639c537c43119bdd19fa`

## Pre-deploy verification (Task 9)

### family-tree.json not in branch diff

```bash
git diff origin/main...HEAD -- '**/family-tree.json'
# (empty — no changes)
```

### Person counts (walk `sons`, root = 1)

| Tree | Local JSON | Live JSON | Local HTML `#tree-data` | Live HTML `#tree-data` |
|------|-----------|-----------|-------------------------|------------------------|
| drewo | 157 | 157 | 157 | 157 |
| drewo-dada-yurt | 134 | 134 | 134 | 134 |
| drewo-reklama | 81 | 81 | 81 | 81 |

**Result:** Local and live counts match for all three trees. No WARNING — safe to deploy HTML shells from this branch without shrinking tree data.

Re-check live counts immediately before any deploy (CDN / in-browser edits may have moved ahead):

- https://waydean.ru/drewo/family-tree.json
- https://waydean.ru/drewo-dada-yurt/family-tree.json
- https://waydean.ru/drewo-reklama/family-tree.json

---

## Files safe to deploy (this branch)

### Nek landing + PWA

- `nek/index.html`
- `nek/nek.css`
- `nek/nek.js`
- `nek/sw.js`
- `nek/manifest.webmanifest`
- `nek/icon-*.png`, `nek/apple-touch-icon.png` (if changed)

### Trees hub (family login UI)

- `trees/index.html`
- `trees/trees.css`
- `trees/trees.js`
- `trees/registry.json`

### Short invite redirect

- `t/index.html` — redirects to `/nek/?login=1`
- `t/hoti|dada|demo/index.html` — redirect to `/nek/?login=1&u=<login>` (prefilled login form,
  never straight to the tree)
- `t/invite.js` — simplified; hub login is on Nek

### Tree HTML shells (auth gate only — **confirm counts first**)

Deploy only after embedded `#tree-data` count ≥ live count (see table above):

- `drewo/index.html`
- `drewo-dada-yurt/index.html`
- `drewo-reklama/index.html`

**Do not deploy** standalone `family-tree.json` files from this branch unless you have deliberately merged live data and verified local is a superset.

### Supabase Edge Function

- `supabase/functions/publish-drewo/` (index, session, vault, create-tree + tests)

Redeploy function after setting secrets (below).

---

## Secrets to set (Supabase → Edge Functions → publish-drewo)

| Secret | Purpose |
|--------|---------|
| `DREWO_SESSION_SECRET` | Signs Nek family session tokens. Fallback: `GITHUB_TOKEN` — prefer a dedicated secret. |
| `DREWO_VAULT_KEY` | Encrypts `_private/credentials.vault.json` so the hub can show family passwords. Without it, vault writes are skipped and the UI shows a “secret not configured” note. Use a long random string — it is the only thing protecting the vault. |
| `DREWO_HUB_EMAILS` | **Required.** Comma-separated allowlist of operator emails allowed to call `create-tree`, `hub-credentials`, `hub-credentials-upsert`. Unset = every hub action returns 403 (fail closed). Example: `me@example.com,partner@example.com`. |

Existing secrets (`GITHUB_TOKEN`, repo config) remain required for GitHub publish paths.

---

## The credential vault must never be published

The vault holds **recoverable family passwords**. It is AES-GCM encrypted with a key derived
from `DREWO_VAULT_KEY` via PBKDF2-SHA256 (210 000 iterations, random 16-byte salt stored in the
file), but the repo is public, so the ciphertext must not be served either.

Rules:

1. Path is `_private/credentials.vault.json`. Never move it under a published directory.
2. Every workflow that publishes the site deletes `_private/` and the old
   `trees/credentials.vault.json` from the checkout **before** uploading:
   - `.github/workflows/deploy.yml`
   - `.github/workflows/deploy-pages-keepalive.yml`
   - `.github/workflows/deploy-cloudflare-pages.yml` (currently disabled)
   If you add another publish workflow, add the same strip step or the vault leaks.
3. After deploy, confirm https://waydean.ru/_private/credentials.vault.json returns **404**
   (and likewise `/trees/credentials.vault.json`).
4. `publish-drewo` deletes any leftover `trees/credentials.vault.json` from GitHub the next time
   it writes the vault. Older v1 (bare SHA-256) vault files are still readable and are rewritten
   in the v2 PBKDF2 format on the next write.
5. If the vault was ever served publicly, treat every family password in it as compromised:
   rotate `DREWO_VAULT_KEY` **and** change each family password via `set-password`.

---

## Family session tokens

Session tokens carry `pwdFp`, the first 8 hex chars of the tree's `access.passwordHash`.
`set-password` changes the hash, so every previously issued token stops verifying and the family
has to log in again with the new password. Sessions still expire after 14 days.

---

## NEVER push stale family-tree.json

1. **Before any deploy that touches tree data**, fetch live JSON and count nodes.
2. If **remote has more people** than local → **STOP**. Do not overwrite. Pull/merge from live first.
3. UI-only deploys: update HTML/JS/CSS but **leave** live `family-tree.json` unchanged unless publishing deliberate edits.
4. `publish-drewo` injects `treeJson` into existing GitHub HTML — never send a smaller or stale tree.
5. When deploying tree HTML shells, prefer injecting **remote** `#tree-data` into the new shell if local embed might be behind live.

Historical incident: pushing stale local tree deleted people (147 → 140). Do not repeat.

---

## Suggested deploy order

1. Set `DREWO_SESSION_SECRET`, `DREWO_VAULT_KEY` and `DREWO_HUB_EMAILS` on Supabase.
2. Deploy `publish-drewo` Edge Function.
3. Push static site files (nek, trees, t, tree index.html shells).
4. Hard-refresh or wait for CDN if counts look wrong after deploy.

Create GitHub backup under `drewo/backups/` (and siblings) before replacing any live `index.html`.

---

## Post-deploy smoke tests

- [ ] **Nek login** — https://waydean.ru/nek/ → “Войти” → family credentials → lands on correct tree.
- [ ] **Vault is not public** — https://waydean.ru/_private/credentials.vault.json and
      https://waydean.ru/trees/credentials.vault.json both return **404**.
- [ ] **Hub allowlist** — an account outside `DREWO_HUB_EMAILS` gets 403 from the Trees hub.
- [ ] **Password rotation invalidates sessions** — change a family password, then reload a tree
      still holding the old `?nek=` token: it must fall back to the password gate.
- [ ] **Trees hub credentials** — https://waydean.ru/trees/ → logged-in user sees registry entries; credential note works when vault is configured.
- [ ] **`/t/` redirect** — https://waydean.ru/t/ → `/nek/?login=1`; https://waydean.ru/t/hoti →
      `/nek/?login=1&u=hoti` with the login field prefilled.
- [ ] **Spot-check known parent** — e.g. open drewo, find Рамзан (or another known node), confirm expected sons still present.
- [ ] **Node counts** — live JSON counts still ≥ pre-deploy counts (157 / 134 / 81 at verification time).
- [ ] **Protected trees** — unauthenticated visit to `/drewo/` shows login gate; authenticated session opens tree.

---

## Out of scope for this checklist

- No push to `origin` or live deploy was performed as part of Task 9.
- Deploy requires credentials and explicit user authorization.
