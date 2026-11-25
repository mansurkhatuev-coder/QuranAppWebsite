import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { hubTreeMetrics } from './hub-tree-metrics.ts';

Deno.test('cabinet receives only aggregate metrics', () => {
  const tree = { id:'a', name:'synthetic', photo:true, born:1900, sons:[
    {id:'b', bio:'synthetic', sons:[{id:'c', died:2000}]}, {id:'d'}
  ]};
  assertEquals(hubTreeMetrics(JSON.stringify(tree)), {
    people:4, photos:1, withYears:2, withBio:1, maxDepth:3
  });
});
Deno.test('missing or malformed snapshots produce unavailable metrics, never fabricated zeros', () => {
  for (const raw of [undefined, '', 'bad json', 'null', '[]', '{}', '{"id":"a","sons":[null]}', '{"id":"a","sons":42}']) {
    assertEquals(hubTreeMetrics(raw), null);
  }
});
