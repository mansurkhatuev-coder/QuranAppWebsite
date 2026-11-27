import { assertEquals, assertNotEquals, assertMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { passwordBudgetKeys, passwordClientAddress } from './password-budget.ts';

Deno.test('password limits share a family bucket across clients and retain a separate per-client bucket', async () => {
  const first = await passwordBudgetKeys('synthetic-key', 'tree:sample', '192.0.2.1');
  const anotherClient = await passwordBudgetKeys('synthetic-key', 'tree:sample', '192.0.2.2');
  const anotherFamily = await passwordBudgetKeys('synthetic-key', 'tree:other', '192.0.2.1');
  assertEquals(first.p_family, anotherClient.p_family);
  assertEquals(first.p_client, anotherFamily.p_client);
  assertNotEquals(first.p_pair, anotherClient.p_pair);
  assertNotEquals(first.p_pair, anotherFamily.p_pair);
  for (const key of Object.values(first)) assertMatch(key, /^[0-9a-f]{64}$/);
});

Deno.test('the password budget ignores an unusable client address', () => {
  assertEquals(passwordClientAddress(new Headers({ 'x-forwarded-for': 'invalid, 192.0.2.1' })), '192.0.2.1');
  assertEquals(passwordClientAddress(new Headers({ 'x-forwarded-for': 'invalid' })), 'unknown');
});
