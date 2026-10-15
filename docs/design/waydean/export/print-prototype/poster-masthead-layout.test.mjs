import test from "node:test";
import assert from "node:assert/strict";
import { getPosterMastheadLayout } from "./poster-masthead-layout.mjs";

const subtitle = "ПОЛНАЯ ЛИНИЯ · 157 ЧЕЛОВЕК · 14 ПОКОЛЕНИЙ";

test("keeps the full poster masthead on one sheet when the board has an even number of sheets", () => {
  const pageWidthMm = 1189;
  const masthead = getPosterMastheadLayout(
    { pageWidthMm, pageCountX: 6 },
    { title: "История рода", subtitle }
  );

  const sheetStart = Math.floor(masthead.centerX / pageWidthMm) * pageWidthMm;
  assert.ok(masthead.centerX - masthead.halfWidthMm >= sheetStart + masthead.marginMm);
  assert.ok(masthead.centerX + masthead.halfWidthMm <= sheetStart + pageWidthMm - masthead.marginMm);
  assert.equal(masthead.centerX, 3 * pageWidthMm - masthead.halfWidthMm - masthead.marginMm);
  assert.equal(masthead.titleSize, 20, "title scale is based on the combined poster width");
});

test("keeps a one-sheet masthead centered", () => {
  const masthead = getPosterMastheadLayout(
    { pageWidthMm: 297, pageCountX: 1 },
    { title: "История рода", subtitle }
  );

  assert.equal(masthead.centerX, 148.5);
});

test("shrinks a long title enough to fit inside one sheet", () => {
  const pageWidthMm = 297;
  const masthead = getPosterMastheadLayout(
    { pageWidthMm, pageCountX: 2 },
    { title: "Большая история чеченского семейного рода и его потомков", subtitle }
  );

  assert.ok(masthead.centerX - masthead.halfWidthMm >= masthead.marginMm);
  assert.ok(masthead.centerX + masthead.halfWidthMm <= pageWidthMm - masthead.marginMm);
  assert.ok(masthead.titleSize < 20);
});
