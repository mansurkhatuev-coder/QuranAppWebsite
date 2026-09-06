// create-tree_test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { parseRegistry } from './create-tree.ts';

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
