import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
const source = readFileSync(new URL("./terra-admin.js", import.meta.url), "utf8");
const code = source.slice(source.indexOf("  function translationsToItemFields("), source.indexOf("  const CYRILLIC_TO_LATIN"));
const context = {};
runInNewContext(code + ";globalThis.convert = translationsToItemFields;", context);
const plain = (value) => JSON.parse(JSON.stringify(value));

test("an English-only translation does not become a Russian translation", () => {
  const result = context.convert([{ label: "Русский перевод", text: "", _role: "ru" }, { label: "English", text: "Meaning", _role: "new" }]);
  assert.equal(result.translation, undefined);
  assert.deepEqual(plain(result.extraTranslations), [{ label: "English", text: "Meaning" }]);
});

test("existing extra translation metadata survives edits and remains an extra translation", () => {
  const original = { label: "Чеченский перевод", text: "old", language: "ce", reference: { id: 8 } };
  const result = context.convert([{ label: "Русский перевод", text: "Русский", _role: "ru" }, { label: "Чеченский перевод", text: "new", _role: "extra", _original: original }]);
  assert.equal(result.translation, "Русский");
  assert.equal(result.translationChechen, undefined);
  assert.deepEqual(plain(result.extraTranslations), [{ label: "Чеченский перевод", text: "new", language: "ce", reference: { id: 8 } }]);
  assert.equal(original.text, "old");
});

test("a newly added Chechen translation uses the Chechen field", () => {
  const result = context.convert([{ label: "Русский перевод", text: "", _role: "ru" }, { label: "Чеченский перевод", text: "Текст", _role: "new" }]);
  assert.equal(result.translation, undefined);
  assert.equal(result.translationChechen, "Текст");
});
