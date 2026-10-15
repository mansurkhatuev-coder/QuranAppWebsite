import assert from "node:assert/strict";
import test from "node:test";
import * as personCardLayout from "./person-card-layout.mjs";
const { getPersonCardLayout } = personCardLayout;

test("poster card places a portrait to the left of its readable text block", () => {
  const card = getPersonCardLayout({ x: 20, y: 30, width: 48, height: 34, nameLines: 1, hasDates: true, hasTeip: true });

  assert.ok(card.portraitX + card.portraitRadius < card.nameX);
  assert.ok(card.portraitRadius >= 5);
  assert.equal(card.nameAnchor, "start");
  assert.ok(card.generationX > card.portraitX + card.portraitRadius);
  assert.ok(card.nameX + card.textLimit <= 20 + 48 - 7.5, "long name column keeps a calm 7.5 mm inset before the card edge");
});

test("hyphenated HOTI names wrap at the hyphen instead of touching the frame", () => {
  assert.equal(typeof personCardLayout.wrapPersonName, "function");
  assert.deepEqual(personCardLayout.wrapPersonName("Солт-Ахьмад", 9), ["Солт-", "Ахьмад"]);
});

test("name lines only shrink when their measured glyph width exceeds the safe column", () => {
  assert.equal(typeof personCardLayout.getNameTextLength, "function");
  assert.equal(personCardLayout.getNameTextLength(28, 22.5), 22.5);
  assert.equal(personCardLayout.getNameTextLength(18, 22.5), null);
});

test("family connectors use continuous straight segments rather than bezier curves", () => {
  assert.equal(typeof personCardLayout.getConnectorPath, "function");
  assert.equal(personCardLayout.getConnectorPath(10, 20, 30, 50), "M 10 20 V 35 H 30 V 50");
});

test("two-line names leave room for dates and teip inside the card frame", () => {
  const card = getPersonCardLayout({ x: 0, y: 0, width: 48, height: 34, nameLines: 2, hasDates: true, hasTeip: true });

  assert.ok(card.nameSecondY < card.dateY);
  assert.ok(card.dateY < card.teipY);
  assert.ok(card.teipY < 32);
  assert.ok(card.nameX + card.textLimit <= 46);
});

test("compact cards keep the portrait and left-aligned name inside printable bounds", () => {
  const card = getPersonCardLayout({ x: 5, y: 7, width: 36, height: 26, nameLines: 1, hasDates: false, hasTeip: false });

  assert.ok(card.portraitRadius < 5);
  assert.ok(card.portraitX > 5 && card.portraitX < 41);
  assert.ok(card.nameX > card.portraitX + card.portraitRadius);
  assert.equal(card.nameAnchor, "start");
  assert.ok(card.nameY < 33);
});
