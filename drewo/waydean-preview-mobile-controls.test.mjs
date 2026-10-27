import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const here = new URL('.', import.meta.url);
const mobileCss = readFileSync(new URL('waydean-preview-mobile-controls.css', here), 'utf8');
const layoutCss = readFileSync(new URL('waydean-preview-layout.css', here), 'utf8');
const mobileLayoutCss = layoutCss.slice(
  layoutCss.indexOf('@media (max-width: 700px)'),
  layoutCss.indexOf('@media (max-width: 380px)')
);
const compactMobileLayoutCss = layoutCss.slice(
  layoutCss.indexOf('@media (max-width: 380px)'),
  layoutCss.indexOf('/* Desktop panels collapse')
);
const minimapCss = readFileSync(new URL('waydean-preview-minimap.css', here), 'utf8');

function rule(css, selector) {
  const startAt = Math.max(
    css.lastIndexOf(`\n  ${selector} {`),
    css.lastIndexOf(`\n  ${selector},`),
    css.lastIndexOf(`${selector} {`),
    css.lastIndexOf(`${selector},`)
  );
  const openAt = css.indexOf('{', startAt);
  const closeAt = css.indexOf('}', openAt);
  return css.slice(openAt + 1, closeAt);
}

test('mobile tree stays in full-card mode at every zoom level', () => {
  const appJs = readFileSync(new URL('waydean-preview.js', here), 'utf8');
  assert.match(appJs, /const nextLevel = isMobile\s*\?\s*'detail'\s*:\s*nextLodLevel\(lodLevel,/);
});

test('mobile minimap removes captions and gives the diagram their space', () => {
  assert.match(rule(minimapCss, '.mini-map-title'), /display:\s*none/);
  assert.match(rule(minimapCss, '.mini-map-content > span'), /display:\s*none/);
  assert.match(rule(minimapCss, '.mini-map:not(.collapsed) .mini-map-content svg'), /height:\s*92px/);
  const appJs = readFileSync(new URL('waydean-preview.js', here), 'utf8');
  assert.match(appJs, /setMiniMapCollapsed\(false\)/);
});

test('selected-person strip does not consume mobile canvas space', () => {
  assert.match(rule(mobileCss, '.mobile-selected'), /display:\s*none/);
  assert.match(rule(mobileCss, '.tree-stage'), /inset:\s*0/);
});

test('mobile PWA viewport stays full-height and keeps the glass navigation in the bottom grid row', () => {
  assert.match(mobileLayoutCss, /height:\s*-webkit-fill-available/);
  assert.match(rule(mobileLayoutCss, '.app-shell'), /position:\s*fixed/);
  assert.match(rule(mobileLayoutCss, '.app-shell'), /inset:\s*0/);
  assert.match(rule(mobileLayoutCss, '.app-shell'), /height:\s*100%/);
  assert.match(rule(mobileLayoutCss, '.app-shell'), /min-height:\s*0/);
  assert.match(mobileLayoutCss, /--mobile-nav-height:\s*58px/);
  assert.match(rule(mobileLayoutCss, '.app-shell'), /grid-template-rows:\s*58px 46px minmax\(0,\s*1fr\) calc\(var\(--mobile-nav-height\) \+ 16px\)/);
  assert.match(rule(mobileLayoutCss, '.mobile-nav'), /position:\s*relative/);
  assert.match(rule(mobileLayoutCss, '.mobile-nav'), /grid-row:\s*4/);
  assert.match(rule(mobileLayoutCss, '.mobile-nav'), /margin:\s*0 16px 10px/);
  assert.match(rule(mobileLayoutCss, '.mobile-nav'), /border-radius:\s*26px/);
  assert.match(rule(mobileLayoutCss, '.mobile-nav'), /backdrop-filter:\s*blur\(18px\)/);
  assert.match(rule(mobileLayoutCss, '.mobile-nav button.active'), /background:/);
});

test('small mobile PWA keeps a dedicated navigation row without safe-area overhang', () => {
  assert.match(compactMobileLayoutCss, /--mobile-nav-height:\s*56px/);
  assert.match(compactMobileLayoutCss, /\.app-shell\s*\{\s*grid-template-rows:\s*50px 42px minmax\(0,\s*1fr\) calc\(var\(--mobile-nav-height\) \+ 16px\)/s);
});

test('installed PWA receives the updated mobile layout stylesheet', () => {
  const html = readFileSync(new URL('waydean-preview.html', here), 'utf8');
  const worker = readFileSync(new URL('waydean-preview-sw.js', here), 'utf8');
  assert.match(html, /waydean-preview-layout\.css\?v=pwa-fixed-app-shell-3/);
  assert.match(worker, /waydean-preview-shell-v15/);
  assert.match(worker, /waydean-preview-layout\.css\?v=pwa-fixed-app-shell-3/);
});
