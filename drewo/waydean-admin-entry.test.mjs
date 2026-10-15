import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const treePage = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const previewPage = await readFile(new URL('./waydean-preview.html', import.meta.url), 'utf8');
const previewScript = await readFile(new URL('./waydean-preview.js', import.meta.url), 'utf8');

test('main tree offers the read-only Waydean preview to every visitor', () => {
  assert.ok(/<button[^>]*id="waydean-premium-open"[^>]*>Waydean · предпросмотр<\/button>/.test(treePage), 'the visible entry link must be present');
  assert.ok(/waydeanPremiumOpenBtn\.addEventListener\('click',[\s\S]*?window\.location\.assign\('waydean-preview\.html\?source=account&state=all-tree'\)/.test(treePage), 'the entry must open account preview');
  assert.ok(!/if \(sessionRole !== 'super'\) return;\s*setNavMenuOpen\(false\);\s*window\.location\.assign/.test(treePage), 'the entry must not require the family super-role');
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
