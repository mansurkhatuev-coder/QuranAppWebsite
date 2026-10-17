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

test('mobile navigation is an inset glass dock above the device safe area', () => {
  assert.match(mobileLayoutCss, /--mobile-safe-bottom:\s*max\(env\(safe-area-inset-bottom,\s*0px\),\s*env\(safe-area-max-inset-bottom,\s*0px\)\)/);
  assert.match(rule(mobileLayoutCss, '.app-shell'), /position:\s*fixed/);
  assert.match(rule(mobileLayoutCss, '.app-shell'), /inset:\s*0/);
  assert.match(mobileLayoutCss, /--mobile-nav-height:\s*58px/);
  assert.match(rule(mobileLayoutCss, '.app-shell'), /calc\(var\(--mobile-nav-height\) \+ var\(--mobile-safe-bottom\) \+ 16px\)/);
  assert.match(rule(mobileLayoutCss, '.mobile-nav'), /position:\s*fixed/);
  assert.match(rule(mobileLayoutCss, '.mobile-nav'), /left:\s*max\(12px,\s*env\(safe-area-inset-left,\s*0px\)\)/);
  assert.match(rule(mobileLayoutCss, '.mobile-nav'), /right:\s*max\(12px,\s*env\(safe-area-inset-right,\s*0px\)\)/);
  assert.match(rule(mobileLayoutCss, '.mobile-nav'), /bottom:\s*calc\(var\(--mobile-safe-bottom\) \+ 8px\)/);
  assert.match(rule(mobileLayoutCss, '.mobile-nav'), /border-radius:\s*26px/);
  assert.match(rule(mobileLayoutCss, '.mobile-nav'), /backdrop-filter:\s*blur\(18px\)/);
  assert.match(rule(mobileLayoutCss, '.mobile-nav button.active'), /background:/);
});

test('mobile dock fills the home-indicator strip with background, without moving controls into it', () => {
  const underDock = rule(mobileLayoutCss, '.mobile-nav::after');
  assert.match(underDock, /top:\s*100%/);
  assert.match(underDock, /height:\s*calc\(var\(--mobile-safe-bottom\) \+ 8px\)/);
  assert.match(underDock, /left:\s*calc\(-1 \* max\(12px,\s*env\(safe-area-inset-left,\s*0px\)\)\)/);
  assert.match(underDock, /right:\s*calc\(-1 \* max\(12px,\s*env\(safe-area-inset-right,\s*0px\)\)\)/);
  assert.match(underDock, /background:\s*#081215/);
  assert.doesNotMatch(layoutCss, /@media\s*\(display-mode:\s*standalone\)[\s\S]*?\.mobile-nav\s*\{/);
  assert.match(layoutCss, /@media\s*\(max-width:\s*380px\)\s*\{[^}]*--mobile-nav-height:\s*56px/s);
});
