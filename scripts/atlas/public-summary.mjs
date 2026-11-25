// Run offline against an approved manifest. Only the aggregate JSON goes to the atlas.
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {groups} from '../../atlas/catalog.mjs';
import {settlements} from '../../atlas/settlements.mjs';

const minimum = 5;
const band = (n, step) => {
 const lower = Math.floor(n / step) * step;
 return `${lower}–${lower + step - 1}`;
};

function treeSize(root) {
 const stack = [[root, 1]];
 const ids = new Set();
 let depth = 0;
 while (stack.length) {
  const [person, level] = stack.pop();
  if (!person?.id || ids.has(person.id)) throw new Error('Некорректные записи в родословной');
  ids.add(person.id);
  depth = Math.max(depth, level);
  for (const child of person.sons ?? []) stack.push([child, level + 1]);
 }
 return {people:ids.size, depth};
}

function by(rows, key) {
 const buckets = new Map();
 for (const row of rows) {
  const value = row[key] ?? '';
  if (!buckets.has(value)) buckets.set(value, []);
  buckets.get(value).push(row);
 }
 return buckets;
}

function metrics(rows, scope) {
 const value = {trees:band(rows.length, minimum)};
 const people = rows.reduce((n, row) => n + row.people, 0);
 // Omit the total if one family contributes the majority of records.
 if (rows.every(row => row.people * 2 <= people)) value.people = band(people, 10);
 const depths = by(rows, 'depthBand');
 if ([...depths.values()].every(bucket => bucket.length >= minimum)) {
  value.depth = Object.fromEntries([...depths].map(([key,bucket]) => [key,band(bucket.length,minimum)]));
 }
 if (scope) {
  const dimensions = scope === 'project' ? [['teip','teips'],['city','settlements']]
   : scope === 'city' ? [['teip','teips']] : [['city','settlements']];
  for (const [key,label] of dimensions) {
   const counts = by(rows,key);
   counts.delete('');
   if (counts.size && [...counts.values()].every(bucket => bucket.length >= minimum)) value[label] = counts.size;
  }
 }
 return value;
}

export async function buildSummary(manifest, loadTree) {
 const rows = [];
 const seen = new Set();
 for (const entry of manifest) {
  if (!entry.treeDir || seen.has(entry.treeDir)) throw new Error('Повторяющийся или пустой идентификатор древа');
  seen.add(entry.treeDir);
  if (entry.aggregateConsent !== true || entry.active !== true || entry.treeDir === 'drewo-reklama') continue;
  const {people, depth} = treeSize(await loadTree(entry));
  const group = groups.find(item => item.id === entry.groupId);
  const teip = group?.teips.find(item => item.id === entry.teipId);
  const city = settlements.find(item => item.id === entry.settlementId);
  rows.push({people, depthBand:depth <= 3 ? '1–3' : depth <= 6 ? '4–6' : '7+', group:group?.id,
   teip:teip && `${group.id}/${teip.id}`, city:city?.id});
 }
 const scopes = {};
 if (rows.length >= minimum) {
  scopes.project = metrics(rows,'project');
  // Suppress a whole partition if subtraction could identify a small remainder.
  const intersections = by(rows.map(row => ({pair:JSON.stringify([row.group,row.teip,row.city])})), 'pair');
  const allowCityBreakdown = [...intersections.values()].every(bucket => bucket.length >= minimum);
  for (const key of ['group','teip','city']) {
   if (key === 'city' && !allowCityBreakdown) continue;
   const buckets = by(rows,key);
   if ([...buckets.values()].some(bucket => bucket.length < minimum)) continue;
   for (const [id,bucket] of buckets) if (id) scopes[`${key}/${id}`] = metrics(bucket,key);
  }
 }
 return {version:1,date:new Date().toISOString().slice(0,10),scopes};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
 const manifestPath = resolve(process.argv[2]);
 const manifest = JSON.parse(await readFile(manifestPath,'utf8'));
 const result = await buildSummary(manifest, async entry => JSON.parse(await readFile(resolve(dirname(manifestPath),entry.file),'utf8')));
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
