import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./waydean-preview.html", import.meta.url), "utf8");

test("main menu groups actions in a predictable order", () => {
  const sectionIds = [
    "moreSectionTree",
    "moreSectionAppearance",
    "moreSectionSaving",
    "moreSectionExport",
    "moreSectionDevice",
    "moreSectionAccount"
  ];
  const offsets = sectionIds.map(id => html.indexOf(`id="${id}"`));

  assert.ok(offsets.every(offset => offset >= 0), "each settings group should exist");
  assert.deepEqual(offsets, [...offsets].sort((left, right) => left - right));
});

test("family password form stays in a closed dialog until explicitly requested", () => {
  const dialogStart = html.indexOf('<dialog class="account-admin-password-dialog" id="accountAdminPasswordDialog"');
  const dialogEnd = html.indexOf("</dialog>", dialogStart);
  const moreStart = html.indexOf('<section class="popover more-popover" id="morePopover"');
  const moreMenu = html.slice(moreStart, dialogStart);

  assert.ok(dialogStart >= 0 && dialogEnd > dialogStart, "password form should live in its own dialog");
  assert.doesNotMatch(html.slice(dialogStart, dialogEnd), /<dialog[^>]*\bopen(?:\s|>)/i,
    "the dialog must be closed on initial load");
  assert.match(html.slice(dialogStart, dialogEnd), /id="accountAdminPasswordForm"/);
  assert.match(html, /id="accountAdminPasswordOpen"[^>]*>Сменить семейный пароль</);
  assert.doesNotMatch(moreMenu, /accountAdminPasswordForm|accountAdminNewPassword|accountAdminPasswordConfirm/,
    "password fields must not be exposed inline in the main menu");
});
