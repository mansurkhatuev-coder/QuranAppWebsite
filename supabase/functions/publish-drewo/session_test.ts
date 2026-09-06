import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { signNekSession, verifyNekSession } from './session.ts';

Deno.test('sign/verify nek session', async () => {
  const secret = 'test-secret';
  const token = await signNekSession(
    { treeDir: 'drewo', role: 'editor', exp: Date.now() + 60_000 },
    secret
  );
  const payload = await verifyNekSession(token, secret);
  assertEquals(payload?.treeDir, 'drewo');
});

Deno.test('expired session rejected', async () => {
  const secret = 'test-secret';
  const token = await signNekSession(
    { treeDir: 'drewo', role: 'editor', exp: Date.now() - 1000 },
    secret
  );
  assertEquals(await verifyNekSession(token, secret), null);
});

Deno.test('bad signature returns null', async () => {
  const secret = 'test-secret';
  const token = await signNekSession(
    { treeDir: 'drewo', role: 'editor', exp: Date.now() + 60_000 },
    secret
  );
  const [body, sig] = token.split('.');
  const last = sig[sig.length - 1] === 'A' ? 'B' : 'A';
  const tampered = `${body}.${sig.slice(0, -1)}${last}`;
  assertEquals(await verifyNekSession(tampered, secret), null);
});
