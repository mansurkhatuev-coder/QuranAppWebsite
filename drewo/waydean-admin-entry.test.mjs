import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const treePage = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const previewPage = await readFile(new URL('./waydean-preview.html', import.meta.url), 'utf8');
const previewScript = await readFile(new URL('./waydean-preview.js', import.meta.url), 'utf8');

test('legacy tree offers an optional new interface using its existing family session', () => {
  assert.ok(/<button[^>]*id="waydean-premium-open"[^>]*>Открыть новый интерфейс<\/button>/.test(treePage), 'the visible entry link must be present');
  assert.ok(/waydeanPremiumOpenBtn\.addEventListener\('click',[\s\S]*?window\.location\.assign\('waydean-preview\.html\?source=family&state=all-tree'\)/.test(treePage), 'the entry must open the family-session route');
  assert.ok(/var NEK_SESSION_KEY = 'nek-session:' \+ TREE_DIR/.test(treePage), 'the legacy tree must keep its signed session in the shared same-tab storage key');
  assert.ok(/readFamilySession\(familySessionStorage\(\), activeTreeDir\)/.test(previewScript), 'the new interface must read the signed session for the selected tree');
  assert.ok(!/if \(sessionRole !== 'super'\) return;\s*setNavMenuOpen\(false\);\s*window\.location\.assign/.test(treePage), 'the entry must not require the family super-role');
});

test('a remembered legacy viewer can open the published tree snapshot without enabling server actions', () => {
  assert.ok(/readLegacyTreeViewSession\(window\.localStorage\)/.test(previewScript), 'the preview must detect the remembered person from the old tree');
  assert.ok(/resolveFamilyPreviewAccess\([\s\S]*?legacyViewSession/.test(previewScript), 'the preview must allow the remembered identity fallback when its signed token is unavailable');
  assert.ok(/else if \(familyPreview && !familyLegacyReadOnly\)/.test(previewScript), 'only an authenticated family session may load the server snapshot');
  assert.ok(/allowServerPush: accountPreview \|\| \(familyPreview && !familyLegacyReadOnly\)/.test(previewScript), 'the fallback must not enable server push actions');
});

test('account preview reuses the admin Supabase client and contains an email/password form', () => {
  assert.ok(/\.\.\/admin\/supabase-config\.js/.test(previewPage), 'the preview must load the existing public Supabase config');
  assert.ok(/\.\.\/admin\/admin-supabase\.js/.test(previewPage), 'the preview must reuse the admin auth client');
  assert.ok(/id="waydeanAdminLoginForm"/.test(previewPage), 'the account route must show an admin login form');
  assert.ok(/id="waydeanAdminEmail"[^>]*type="email"/.test(previewPage), 'the form must accept an email');
  assert.ok(/id="waydeanAdminPassword"[^>]*type="password"/.test(previewPage), 'the form must accept a password');
  assert.ok(
    previewScript.indexOf("if (accountPreview) await requireWaydeanAdminAccess('drewo')")
      < previewScript.indexOf('const response = await fetch(dataUrl'),
    'the account gate must resolve before the family tree request'
  );
});
