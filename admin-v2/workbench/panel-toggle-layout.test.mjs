import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Tajweed library and preview toggles stay outside the heading hidden in focus mode', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('./prototype.js', import.meta.url), 'utf8');
  const heading = html.match(/<div class="document-heading">([\s\S]*?)<\/div>\s*<nav class="editor-tabs"/);
  const tabs = html.match(/<nav class="content-tabs"[^>]*>([\s\S]*?)<\/nav>/);
  const handlerStart = script.indexOf('$(".content-tabs").addEventListener("click"');
  const handlerEnd = script.indexOf('$("#library-search")', handlerStart);
  const handler = script.slice(handlerStart, handlerEnd);

  assert.ok(heading && tabs && handlerStart >= 0 && handlerEnd > handlerStart, 'editor heading, sticky tabs, and click handler exist');
  assert.doesNotMatch(heading[1], /id="focus-panel-tools"/);
  assert.match(tabs[1], /id="focus-panel-tools"/);
  assert.match(handler, /event\.target\.closest\("\[data-focus-panel\]"\)/);
  assert.match(handler, /classList\.toggle\(key, active\)/);
});

test('embedded workbench stays below the persistent admin header while scrolling', async () => {
  const shellCss = await readFile(new URL('../admin-v2.css', import.meta.url), 'utf8');

  assert.match(shellCss, /\.workbench-wrap\s*\{[^}]*position:\s*sticky;[^}]*top:\s*60px;[^}]*height:\s*calc\(100dvh\s*-\s*60px\);/s);
  assert.match(shellCss, /html\[data-design="compact"\]\s+\.workbench-wrap\s*\{[^}]*top:\s*54px;[^}]*height:\s*calc\(100dvh\s*-\s*54px\);/s);
  assert.match(shellCss, /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*?\.workbench-wrap\s*\{[^}]*top:\s*54px;[^}]*height:\s*calc\(100dvh\s*-\s*54px\s*-\s*63px\);/s);
  assert.match(shellCss, /body\.mobile-arabic-keyboard-open\s+\.content-view\s+\.workbench-wrap\s*\{\s*position:\s*absolute;/s);
});
