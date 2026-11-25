// Keep first-paint HTML in family pages, with navigation maintained in the shared preview.
import {readFile,writeFile} from 'node:fs/promises';
const root = new URL('../../',import.meta.url);
const shared = await readFile(new URL('drewo/waydean-preview.html',root),'utf8');
const registry = JSON.parse(await readFile(new URL('trees/registry.json',root),'utf8'));
const sections = [
 /<nav class="main-nav"[^>]*>[\s\S]*?<\/nav>/,
 /<aside class="rail" id="treeActions"[^>]*>[\s\S]*?<\/aside>/,
 /<div class="tree-controls"[^>]*>[^\n]*?<\/div>/,
 /<nav class="mobile-nav"[^>]*>[\s\S]*?<\/nav>/
];
for (const {treeDir} of registry.trees) {
 if (!/^drewo(?:-[a-z0-9-]+)?$/.test(treeDir)) throw new Error('Некорректный путь древа');
 const page = new URL(treeDir+'/index.html',root);
 const original = await readFile(page,'utf8');
 let next = original;
 for (const section of sections) {
  const source = shared.match(section)?.[0];
  if (!source || !section.test(next)) throw new Error('Не найден раздел навигации в '+treeDir);
  next = next.replace(section,() => source);
 }
 if (next === original) continue;
 if (!process.argv.includes('--write')) throw new Error('Обновите навигацию в '+treeDir+' с помощью --write');
 await writeFile(page,next);
}
