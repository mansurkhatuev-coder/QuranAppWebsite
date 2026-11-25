import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('./waydean-preview.html',import.meta.url),'utf8');
const css=await readFile(new URL('./waydean-preview-bundle.css',import.meta.url),'utf8');
const sw=await readFile(new URL('./waydean-preview-sw.js',import.meta.url),'utf8');

test('the production demo tree links back to the public atlas without obscuring its demo notice',()=>{
 const notice=html.match(/<aside class="demo-mode-notice"[\s\S]*?<\/aside>/)?.[0]??'';
 assert.match(notice,/<a[^>]+class="demo-mode-atlas-link"[^>]+href="\/atlas\/"/);
 assert.match(notice,/[Аа]тлас происхождения/);
 assert.match(css,/\.demo-mode-atlas-link\s*\{[^}]*pointer-events:\s*auto/);
});

test('demo atlas backlink uses a fresh stylesheet and worker cache version',()=>{
 const bundle = html.match(/href="(waydean-preview-bundle\.css\?[^"]+)"/)?.[1];
 assert.ok(bundle);
 assert.ok(sw.includes("'./"+bundle+"'"));
 assert.match(css,/\.demo-mode-atlas-link/);
});
