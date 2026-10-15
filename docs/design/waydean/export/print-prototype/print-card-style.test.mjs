import assert from "node:assert/strict";
import test from "node:test";
import { PRINT_CARD_STYLES, getPrintCardStyle, renderPersonCardFrame } from "./print-card-style.mjs";

const theme = {
  card: "#101916",
  selectedCard: "#1a211b",
  cardBorder: "#e9ecdf",
  cardInner: "#e9ecdf",
  selectedBorder: "#f2ce78"
};

test("print studio exposes three distinct portrait-friendly glass card styles", () => {
  assert.deepEqual(Object.keys(PRINT_CARD_STYLES), ["glass", "frost", "halo"]);
  const markup = Object.keys(PRINT_CARD_STYLES).map(styleKey => renderPersonCardFrame({
    styleKey,
    x: 10,
    y: 20,
    width: 70,
    height: 38,
    theme
  }));

  assert.equal(new Set(markup).size, 3);
  assert.ok(markup.every(svg => svg.includes('class="person-card-frame"')));
  assert.ok(markup.every(svg => svg.includes('fill="#101916"')));
});

test("unknown card style safely falls back to the glass outline", () => {
  assert.equal(getPrintCardStyle("missing"), PRINT_CARD_STYLES.glass);
});
