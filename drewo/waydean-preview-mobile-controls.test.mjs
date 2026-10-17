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
  assert.match(appJs, /const nextLevel = isMobile \? 'detail' : nextLodLevel\(lodLevel, renderedCardWidth\)/);
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

test('mobile navigation reaches the full device edge and accounts for the maximum safe area', () => {
  assert.match(mobileLayoutCss, /--mobile-safe-bottom:\s*max\(env\(safe-area-inset-bottom,\s*0px\),\s*env\(safe-area-max-inset-bottom,\s*0px\)\)/);
  assert.match(rule(mobileLayoutCss, '.app-shell'), /position:\s*fixed/);
  assert.match(rule(mobileLayoutCss, '.app-shell'), /inset:\s*0/);
  assert.match(rule(mobileLayoutCss, '.mobile-nav'), /position:\s*absolute/);
  assert.match(rule(mobileLayoutCss, '.mobile-nav'), /bottom:\s*0/);
  assert.match(rule(mobileLayoutCss, '.mobile-nav'), /var\(--mobile-safe-bottom\)/);
  assert.match(rule(mobileLayoutCss, '.mobile-nav'), /padding-bottom:\s*0/);
  assert.match(rule(mobileLayoutCss, '.mobile-nav::after'), /top:\s*100%/);
  assert.match(rule(mobileLayoutCss, '.mobile-nav::after'), /height:\s*max\(var\(--mobile-safe-bottom\),\s*56px\)/);
});

test('installed iPhone app shell extends through the bottom inset', () => {
  assert.match(layoutCss, /@supports\s*\(-webkit-touch-callout:\s*none\)\s*\{\s*@media\s*\(display-mode:\s*standalone\)\s+and\s+\(max-width:\s*700px\)\s*\{\s*\.app-shell\s*\{\s*bottom:\s*calc\(0px\s*-\s*max\(var\(--mobile-safe-bottom\),\s*56px\)\)/);
});
