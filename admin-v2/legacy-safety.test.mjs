import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

test('test preview blocks the store-downloads GET because the endpoint can run schema DDL', async () => {
  const source = await readFile(new URL('./legacy-safety.js', import.meta.url), 'utf8');
  const messages = [];
  const sent = [];
  const window = {
    location: { href: 'https://preview.example/admin-v2/legacy.html?embed=1', origin: 'https://preview.example' },
    parent: { postMessage: (message) => messages.push(message) },
    fetch: async (request, init = {}) => {
      sent.push({ request, method: init.method || 'GET' });
      return new Response('ok', { status: 200 });
    },
  };
  function FakeXhr() { this.aborted = false; }
  FakeXhr.prototype.open = function open(method, url) { this.method = method; this.url = url; };
  FakeXhr.prototype.send = function send() { sent.push({ request: this.url, method: this.method }); };
  FakeXhr.prototype.abort = function abort() { this.aborted = true; };
  window.XMLHttpRequest = FakeXhr;
  const document = { addEventListener() {} };
  vm.runInNewContext(source, {
    window,
    XMLHttpRequest: FakeXhr,
    navigator: { sendBeacon: () => true },
    document,
    URL,
    Response,
    Promise,
  }, { filename: 'legacy-safety.js' });

  const safeRead = await window.fetch('https://preview.example/rest/v1/dua_items', { method: 'GET' });
  const blockedStoreRead = await window.fetch('https://preview.example/functions/v1/store-downloads', { method: 'GET' });
  const blockedPublish = await window.fetch('https://preview.example/functions/v1/publish-content', { method: 'POST' });
  const allowedReadOnlyRpc = await window.fetch('https://preview.example/rest/v1/rpc/analytics_all_time_install_count', { method: 'POST' });
  const blockedDashboardRpc = await window.fetch('https://preview.example/rest/v1/rpc/analytics_dashboard', { method: 'POST' });
  const storeReadXhr = new FakeXhr();
  storeReadXhr.open('GET', 'https://preview.example/functions/v1/store-downloads');
  storeReadXhr.send();

  assert.equal(safeRead.status, 200);
  assert.equal(blockedStoreRead.status, 423);
  assert.equal(blockedPublish.status, 423);
  assert.equal(allowedReadOnlyRpc.status, 200);
  assert.equal(blockedDashboardRpc.status, 423);
  assert.equal(storeReadXhr.aborted, true);
  assert.equal(sent.some((entry) => String(entry.request).includes('/functions/v1/store-downloads')), false);
  assert.equal(messages.some((message) => message.type === 'admin-v2:write-blocked'), true);
});
