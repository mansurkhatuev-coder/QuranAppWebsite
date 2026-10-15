import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const here = new URL('.', import.meta.url);
const mobileCss = readFileSync(new URL('waydean-preview-mobile-controls.css', here), 'utf8');
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
