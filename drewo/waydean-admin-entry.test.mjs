import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const treePage = await readFile(new URL('./legacy.html', import.meta.url), 'utf8');
const previewPage = await readFile(new URL('./waydean-preview.html', import.meta.url), 'utf8');
const previewScript = await readFile(new URL('./waydean-preview.js', import.meta.url), 'utf8');

test('legacy tree offers an optional new interface using its existing family session', () => {
  assert.ok(/<button[^>]*id="waydean-premium-open"[^>]*>Открыть новый интерфейс<\/button>/.test(treePage), 'the visible entry link must be present');
  assert.ok(/waydeanPremiumOpenBtn\.addEventListener\('click',[\s\S]*?window\.location\.assign\('waydean-preview\.html\?source=family&state=all-tree'\)/.test(treePage), 'the entry must open the family-session route');
  assert.ok(/var NEK_SESSION_KEY = 'nek-session:' \+ TREE_DIR/.test(treePage), 'the legacy tree must keep its signed session in the shared same-tab storage key');
  assert.ok(/readFamilySession\(familySessionStorage\(\), activeTreeDir\)/.test(previewScript), 'the new interface must read the signed session for the selected tree');
  assert.ok(!/if \(sessionRole !== 'super'\) return;\s*setNavMenuOpen\(false\);\s*window\.location\.assign/.test(treePage), 'the entry must not require the family super-role');
});

test('remembered identity cannot open family snapshots without server authorization', () => {
  assert.doesNotMatch(previewScript, /readLegacyTreeViewSession|familyLegacyReadOnly|familyLegacyViewPersonId/);
  const gate = previewScript.indexOf('if (familyPreview && !(await requireFamilyPreviewSession');
  const load = previewScript.indexOf("initialFamilySnapshot = await callFamilyTreeAction('family-load'");
  assert.ok(gate >= 0 && load > gate, 'family session must precede server snapshot');
  assert.match(previewScript, /else if \(familyPreview\) \{\s*const serverSnapshot = initialFamilySnapshot/);
  assert.match(previewScript, /if \(!syntheticFixture && !isLoopbackHost\(location\.hostname\)\) \{[\s\S]*?throw error;\s*\}\s*const response = await fetch\(dataUrl, \{ cache: 'no-store' \}\)/);
});

test('account preview reuses the admin Supabase client and contains an email/password form', () => {
  assert.ok(/\.\.\/admin\/supabase-config\.js/.test(previewPage), 'the preview must load the existing public Supabase config');
  assert.ok(/\.\.\/admin\/admin-supabase\.js/.test(previewPage), 'the preview must reuse the admin auth client');
  assert.ok(/id="waydeanAdminLoginForm"/.test(previewPage), 'the account route must show an admin login form');
  assert.ok(/id="waydeanAdminEmail"[^>]*type="email"/.test(previewPage), 'the form must accept an email');
  assert.ok(/id="waydeanAdminPassword"[^>]*type="password"/.test(previewPage), 'the form must accept a password');
  assert.ok(
    previewScript.indexOf("accountAdminAccess = await requireWaydeanAdminAccess('drewo')") >= 0 &&
    previewScript.indexOf("accountAdminAccess = await requireWaydeanAdminAccess('drewo')")
      < previewScript.indexOf("const serverSnapshot = await callWaydeanAdminAction('waydean-admin-load'"),
    'the account gate must resolve before the family tree request'
  );
});
