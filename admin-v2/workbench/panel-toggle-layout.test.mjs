import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('retired workbench route offers navigation to the preserved admin', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /window\.location\.replace\("\/admin\/"\)/);
  assert.match(html, /href="\/admin\/"/);
});

test('embedded workbench stays below the persistent admin header while scrolling', async () => {
  const shellCss = await readFile(new URL('../admin-v2.css', import.meta.url), 'utf8');

  assert.match(shellCss, /\.workbench-wrap\s*\{[^}]*position:\s*sticky;[^}]*top:\s*60px;[^}]*height:\s*calc\(100dvh\s*-\s*60px\);/s);
  assert.match(shellCss, /html\[data-design="compact"\]\s+\.workbench-wrap\s*\{[^}]*top:\s*54px;[^}]*height:\s*calc\(100dvh\s*-\s*54px\);/s);
  assert.match(shellCss, /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*?\.workbench-wrap\s*\{[^}]*top:\s*54px;[^}]*height:\s*calc\(100dvh\s*-\s*54px\s*-\s*63px\);/s);
  assert.match(shellCss, /body\.mobile-arabic-keyboard-open\s+\.content-view\s+\.workbench-wrap\s*\{\s*position:\s*absolute;/s);
});
