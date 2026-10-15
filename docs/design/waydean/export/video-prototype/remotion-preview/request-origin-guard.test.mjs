import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedLocalRequest } from "./request-origin-guard.mjs";

const port = 8781;

test("allows loopback hosts with matching HTTP origins", () => {
  assert.equal(isAllowedLocalRequest({ host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}`, port }), true);
  assert.equal(isAllowedLocalRequest({ host: `localhost:${port}`, origin: `http://localhost:${port}`, port }), true);
  assert.equal(isAllowedLocalRequest({ host: `[::1]:${port}`, origin: `http://[::1]:${port}`, port }), true);
});

test("allows local non-browser requests with no Origin header", () => {
  assert.equal(isAllowedLocalRequest({ host: `127.0.0.1:${port}`, port }), true);
});

test("rejects remote and DNS-rebinding Host values", () => {
  assert.equal(isAllowedLocalRequest({ host: `attacker.test:${port}`, origin: `http://attacker.test:${port}`, port }), false);
  assert.equal(isAllowedLocalRequest({ host: `127.0.0.1.attacker.test:${port}`, origin: `http://127.0.0.1.attacker.test:${port}`, port }), false);
});

test("rejects mismatched, malformed, and non-HTTP Origins", () => {
  assert.equal(isAllowedLocalRequest({ host: `127.0.0.1:${port}`, origin: `http://localhost:${port}`, port }), false);
  assert.equal(isAllowedLocalRequest({ host: `127.0.0.1:${port}`, origin: "not an origin", port }), false);
  assert.equal(isAllowedLocalRequest({ host: `127.0.0.1:${port}`, origin: `https://127.0.0.1:${port}`, port }), false);
  assert.equal(isAllowedLocalRequest({ host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}.attacker.test`, port }), false);
});

test("rejects unexpected ports and missing Host", () => {
  assert.equal(isAllowedLocalRequest({ host: "127.0.0.1:9999", origin: "http://127.0.0.1:9999", port }), false);
  assert.equal(isAllowedLocalRequest({ origin: `http://127.0.0.1:${port}`, port }), false);
});
