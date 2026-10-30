import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const file = new URL("./store-refresh-policy.js", import.meta.url);

function loadPolicy() {
  assert.ok(existsSync(file), "daily store refresh policy should be present");
  const window = {};
  vm.runInNewContext(readFileSync(file, "utf8"), { window, Intl, Date, Array, String });
  return window.AdminV2StoreRefreshPolicy;
}

test("the daily plan asks only for stores that have not been checked today", () => {
  const policy = loadPolicy();
  const plan = policy.resolvePlan({
    apple: { fetchedAt: "2026-10-30T10:00:00.000Z" },
    googleplay: { fetchedAt: "2026-10-29T10:00:00.000Z" },
    rustore: { fetchedAt: "2026-10-28T10:00:00.000Z" },
  }, new Date("2026-10-30T18:00:00.000Z"), "Europe/Moscow");

  assert.equal(plan.dayKey, "2026-10-30");
  assert.deepEqual(JSON.parse(JSON.stringify(plan.automatic)), ["googleplay"]);
  assert.deepEqual(JSON.parse(JSON.stringify(plan.manual)), ["rustore"]);
  assert.equal(plan.hasStale, true);
});

test("no prompt is needed when all three store reports were checked today", () => {
  const policy = loadPolicy();
  const timestamp = "2026-10-30T10:00:00.000Z";
  const plan = policy.resolvePlan({
    apple: { fetchedAt: timestamp },
    googleplay: { fetchedAt: timestamp },
    rustore: { fetchedAt: timestamp },
  }, new Date("2026-10-30T18:00:00.000Z"), "Europe/Moscow");

  assert.deepEqual(JSON.parse(JSON.stringify(plan.automatic)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(plan.manual)), []);
  assert.equal(plan.hasStale, false);
});

test("the calendar day rolls over at Moscow midnight, not UTC midnight", () => {
  const policy = loadPolicy();
  const snapshot = {
    apple: { fetchedAt: "2026-10-30T20:59:00.000Z" },
    googleplay: { fetchedAt: "2026-10-30T20:59:00.000Z" },
    rustore: { fetchedAt: "2026-10-30T20:59:00.000Z" },
  };
  const beforeMidnight = policy.resolvePlan(snapshot, new Date("2026-10-30T20:59:30.000Z"), "Europe/Moscow");
  const afterMidnight = policy.resolvePlan(snapshot, new Date("2026-10-30T21:01:00.000Z"), "Europe/Moscow");

  assert.equal(beforeMidnight.hasStale, false);
  assert.equal(afterMidnight.dayKey, "2026-10-31");
  assert.equal(afterMidnight.hasStale, true);
});

test("a dismissed prompt is suppressed for that calendar day only", () => {
  const policy = loadPolicy();
  const plan = policy.resolvePlan({}, new Date("2026-10-30T18:00:00.000Z"), "Europe/Moscow");
  assert.equal(policy.shouldPrompt(plan, "2026-10-30"), false);
  assert.equal(policy.shouldPrompt(plan, "2026-10-29"), true);
});
