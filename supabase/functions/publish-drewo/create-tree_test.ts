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

Deno.test('generated shell preserves punctuation in names and keeps one snapshot on repeated updates', async () => {
  const {injectScriptJson, customizeTemplateHtml} = await import('./create-tree.ts');
  const name = 'Тест < 1900 · $&';
  const json = JSON.stringify({id:'first',name,sons:[]});
  const html = customizeTemplateHtml({
    html:'<html><title>Древо</title><body></body></html>', treeDir:'drewo-test',
    title:name, rootName:name, treeJson:json
  });
  const saved = injectScriptJson(html,'tree-data',json);
  assertEquals(html,saved);
  const match = saved.match(/id="tree-data">([^<]*)<\/script>/);
  assertEquals(JSON.parse(match?.[1] || '{}').name,name);
});
