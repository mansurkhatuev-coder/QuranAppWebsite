// create-tree_test.ts
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildInviteStubHtml, parseRegistry } from './create-tree.ts';

Deno.test('parseRegistry accepts login or legacy code', () => {
  const a = parseRegistry(JSON.stringify({
    version: 1,
    trees: [{ treeDir: 'drewo', login: 'hoti', title: 'Хьоти некъ', ownership: 'mine' }],
  }));
  assertEquals(a.trees.find((t) => t.treeDir === 'drewo')?.login, 'hoti');

  const b = parseRegistry(JSON.stringify({
    version: 1,
    trees: [{ treeDir: 'drewo-dada-yurt', code: 'dada', title: 'Дади-Юрт', ownership: 'mine' }],
  }));
  assertEquals(b.trees.find((t) => t.treeDir === 'drewo-dada-yurt')?.login, 'dada');
});

Deno.test('invite stub sends visitors to the Nek login, not straight to the tree', () => {
  const html = buildInviteStubHtml({ title: 'Хьоти некъ', code: 'hoti' });
  assertStringIncludes(html, 'location.replace("/nek/?login=1&u=hoti")');
  assertStringIncludes(html, 'content="0;url=/nek/?login=1&amp;u=hoti"');
  assertEquals(html.includes('/drewo'), false);
});

Deno.test('invite stub without a usable code still lands on the login form', () => {
  const html = buildInviteStubHtml({ title: 'Древо', code: '../evil' });
  assertStringIncludes(html, 'location.replace("/nek/?login=1")');
  assertEquals(html.includes('evil'), false);
});
