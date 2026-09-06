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
| `DREWO_SESSION_SECRET` | Signs Trees hub session cookies (family login). Fallback: `GITHUB_TOKEN` — prefer a dedicated secret. |
| `DREWO_VAULT_KEY` | Encrypts `trees/credentials.vault.json` so the hub can show family passwords. Without it, vault writes are skipped and the UI shows a “secret not configured” note. |

Existing secrets (`GITHUB_TOKEN`, repo config) remain required for GitHub publish paths.

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

1. Set `DREWO_SESSION_SECRET` and `DREWO_VAULT_KEY` on Supabase.
2. Deploy `publish-drewo` Edge Function.
3. Push static site files (nek, trees, t, tree index.html shells).
4. Hard-refresh or wait for CDN if counts look wrong after deploy.

Create GitHub backup under `drewo/backups/` (and siblings) before replacing any live `index.html`.

---

## Post-deploy smoke tests

- [ ] **Nek login** — https://waydean.ru/nek/ → “Войти” → family credentials → lands on correct tree.
- [ ] **Trees hub credentials** — https://waydean.ru/trees/ → logged-in user sees registry entries; credential note works when vault is configured.
- [ ] **`/t/` redirect** — https://waydean.ru/t/ → `/nek/?login=1`.
- [ ] **Spot-check known parent** — e.g. open drewo, find Рамзан (or another known node), confirm expected sons still present.
- [ ] **Node counts** — live JSON counts still ≥ pre-deploy counts (157 / 134 / 81 at verification time).
- [ ] **Protected trees** — unauthenticated visit to `/drewo/` shows login gate; authenticated session opens tree.

---

## Out of scope for this checklist

- No push to `origin` or live deploy was performed as part of Task 9.
- Deploy requires credentials and explicit user authorization.
