import { lstat, mkdir, readFile, readdir, realpath, rm, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { secureLegacyReader } from './secure-legacy-reader.mjs';

const excludedDirectories = new Set(['.git', '.github', '_private', 'backups', 'node_modules', 'dist']);
const excludedFiles = new Set(['access.json', 'credentials.vault.json', 'push-subscriptions.json', 'activity-log.json', 'family-tree.json', 'tree-data.json']);
const privateScriptIds = new Set(['tree-data', 'activity-log']);

function segments(path) {
  return path.split(/[\\/]/).filter(Boolean).map(part => part.toLowerCase());
}

export function isPrivateArtifact(path) {
  const parts = segments(path);
  const name = parts.at(-1) || '';
  if (parts.some(part => excludedDirectories.has(part))) return true;
  if (['supabase', 'scripts'].includes(parts[0])) return true;
  if (name === '.gitignore' || name === 'start-waydean-local.cmd' || /\.test\.[cm]?[jt]s$/i.test(name)) return true;
  if (parts.includes('photos') && parts.some(part => /^drewo(?:-|$)/.test(part))) return true;
  if (excludedFiles.has(name) || parts.join('/') === 'trees/registry.json') return true;
  return /^\.env(?:\.|$)/i.test(name) || /\.(?:sqlite|sqlite3|db|pem|key)$/i.test(name);
}

function isPrivateScript(attributes) {
  return [...attributes.matchAll(/(?:^|\s)id\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)]
    .some(match => privateScriptIds.has((match[1] ?? match[2] ?? match[3]).toLowerCase()));
}

export function stripEmbeddedFamilyData(html) {
  return html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (whole, attributes) =>
    isPrivateScript(attributes) ? `<script${attributes}></script>` : whole);
}

function verifyHtml(html, path) {
  for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
    if (!isPrivateScript(match[1])) continue;
    const tail = html.slice(match.index + match[0].length);
    if (!/^\s*<\/script\s*>/i.test(tail)) throw new Error(`Embedded family data or malformed private script: ${path}`);
  }
}

async function copyPublicTree(source, destination, base = '') {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const path = base ? join(base, entry.name) : entry.name;
    if (isPrivateArtifact(path)) continue;
    const from = join(source, entry.name), to = join(destination, entry.name);
    const info = await lstat(from);
    if (info.isSymbolicLink()) throw new Error(`Refusing symlink in Pages source: ${path}`);
    if (info.isDirectory()) {
      await mkdir(to, { recursive: true });
      await copyPublicTree(from, to, path);
    } else if (info.isFile()) {
      if (/\.html?$/i.test(entry.name)) {
        let clean = stripEmbeddedFamilyData(await readFile(from, 'utf8'));
        if (/^drewo(?:-|$)/.test(segments(path)[0] || '')) clean = secureLegacyReader(clean);
        verifyHtml(clean, path);
        await writeFile(to, clean, 'utf8');
      } else await copyFile(from, to);
    } else throw new Error(`Unexpected filesystem entry in Pages source: ${path}`);
  }
}

export async function verifyPublicTree(destination, base = '') {
  for (const entry of await readdir(destination, { withFileTypes: true })) {
    const path = base ? join(base, entry.name) : entry.name;
    if (isPrivateArtifact(path)) throw new Error(`Private file or directory in Pages artifact: ${path}`);
    const full = join(destination, entry.name);
    const info = await lstat(full);
    if (info.isSymbolicLink()) throw new Error(`Symlink in Pages artifact: ${path}`);
    if (info.isDirectory()) await verifyPublicTree(full, path);
    else if (!info.isFile()) throw new Error(`Unexpected filesystem entry in Pages artifact: ${path}`);
    else if (/\.html?$/i.test(entry.name)) verifyHtml(await readFile(full, 'utf8'), path);
  }
}

export async function preparePagesArtifact(sourceRoot, destinationRoot = join(sourceRoot, 'dist/pages')) {
  const source = resolve(sourceRoot), destination = resolve(destinationRoot);
  const buildRoot = join(source, 'dist');
  if (destination !== join(buildRoot, 'pages')) throw new Error('Pages output must be <checkout>/dist/pages');
  const sourceReal = await realpath(source);
  const statOrMissing = path => lstat(path).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  for (const path of [buildRoot, destination]) {
    const info = await statOrMissing(path);
    if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error(`Pages output must be a regular directory: ${relative(source, path)}`);
    if (info && !(await realpath(path)).startsWith(sourceReal + sep)) throw new Error('Pages output escapes checkout');
  }
  await mkdir(buildRoot, { recursive: true });
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination);
  try {
    await copyPublicTree(source, destination);
    await verifyPublicTree(destination);
    return destination;
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  preparePagesArtifact(root).then(() => console.log('Filtered Pages artifact ready in dist/pages'))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
