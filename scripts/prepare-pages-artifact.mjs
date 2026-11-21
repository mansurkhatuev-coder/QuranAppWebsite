import { lstat, mkdir, readFile, readdir, realpath, rm, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyLegacyRouteTransitions } from './legacy-route-transitions.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const excludedDirectories = new Set(['.git', '.github', '_private', 'backups', 'node_modules', 'dist']);
const excludedFiles = new Set([
  'access.json',
  'credentials.vault.json',
  'push-subscriptions.json',
  'activity-log.json',
]);

function scriptId(attributes) {
  const value = attributes.match(/(?:^|\s)id\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  return (value?.[1] ?? value?.[2] ?? value?.[3] ?? '').toLowerCase();
}

function isPrivateArtifact(path) {
  const name = path.split(sep).at(-1).toLowerCase();
  if (excludedFiles.has(name)) return true;
  if (path.split(sep).join('/') === 'scripts/legacy-transitions.json') return true;
  if (name === 'family-tree.json') return true;
  return /^\.env(?:\.|$)/i.test(name) || /\.(?:sqlite|sqlite3|db|pem|key)$/i.test(name);
}

function stripEmbeddedFamilyData(html) {
  return html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (whole, attributes, body) => {
    const id = scriptId(attributes);
    return id === 'tree-data' || id === 'activity-log'
      ? `<script${attributes}></script>`
      : whole;
  });
}

async function copyPublicTree(source, destination, relativePath = '') {
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const childRelative = relativePath ? join(relativePath, entry.name) : entry.name;
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    const info = await lstat(from);
    if (info.isSymbolicLink()) throw new Error(`Refusing symlink in Pages source: ${childRelative}`);
    if (info.isDirectory()) {
      if (excludedDirectories.has(entry.name) || childRelative.split(sep).includes('backups')) continue;
      if (entry.name === 'photos' && /^drewo(?:-|$)/i.test(relativePath.split(sep).at(-1) || '')) continue;
      await mkdir(to, { recursive: true });
      await copyPublicTree(from, to, childRelative);
      continue;
    }
    if (!info.isFile() || isPrivateArtifact(childRelative)) continue;
    await mkdir(dirname(to), { recursive: true });
    if (/\.html?$/i.test(entry.name) && childRelative.split(sep).some(part => /^drewo(?:-|$)/i.test(part))) {
      const html = await readFile(from, 'utf8');
      await writeFile(to, stripEmbeddedFamilyData(html), 'utf8');
    } else {
      await copyFile(from, to);
    }
  }
}

async function verifyPublicTree(destination, relativePath = '') {
  for (const entry of await readdir(destination, { withFileTypes: true })) {
    const childRelative = relativePath ? join(relativePath, entry.name) : entry.name;
    if (entry.isDirectory()) {
      if (childRelative.split(sep).includes('backups')) throw new Error(`Backup directory in Pages artifact: ${childRelative}`);
      await verifyPublicTree(join(destination, entry.name), childRelative);
      continue;
    }
    if (isPrivateArtifact(childRelative)) throw new Error(`Private file in Pages artifact: ${childRelative}`);
    if (/\.html?$/i.test(entry.name) && childRelative.split(sep).some(part => /^drewo(?:-|$)/i.test(part))) {
      const html = await readFile(join(destination, entry.name), 'utf8');
      const hasEmbeddedPrivateData = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].some(([, attributes, body]) => {
        const id = scriptId(attributes);
        return (id === 'tree-data' || id === 'activity-log') && body.trim().length > 0;
      });
      if (hasEmbeddedPrivateData) throw new Error(`Embedded family data in Pages artifact: ${childRelative}`);
    }
  }
}

export async function preparePagesArtifact(sourceRoot, destinationRoot, { transitionManifest = null } = {}) {
  const source = resolve(sourceRoot);
  const destination = resolve(destinationRoot);
  if (destination !== join(source, 'dist', 'pages')) {
    throw new Error('Pages artifact must be built only at <checkout>/dist/pages.');
  }
  const sourceReal = await realpath(source);
  const buildRoot = join(source, 'dist');
  const buildInfo = await lstat(buildRoot).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (buildInfo && (!buildInfo.isDirectory() || buildInfo.isSymbolicLink())) {
    throw new Error('The checkout dist directory must be a regular directory, not a link.');
  }
  if (buildInfo && !(await realpath(buildRoot)).startsWith(`${sourceReal}${sep}`)) {
    throw new Error('The checkout dist directory must remain inside the checkout.');
  }
  const outputInfo = await lstat(destination).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (outputInfo && (!outputInfo.isDirectory() || outputInfo.isSymbolicLink())) {
    throw new Error('The Pages output path must be a regular directory, not a link.');
  }
  if (!buildInfo) await mkdir(buildRoot);
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await copyPublicTree(source, destination);
  if (transitionManifest) {
    await writeFile(join(destination, '.waydean-pages-artifact'), 'waydean-pages-artifact-v1', { flag: 'wx' });
    try {
      await applyLegacyRouteTransitions(destination, transitionManifest);
    } finally {
      await rm(join(destination, '.waydean-pages-artifact'), { force: true });
    }
  }
  await verifyPublicTree(destination);
  return destination;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  readFile(resolve(root, 'scripts/legacy-transitions.json'), 'utf8')
    .then(source => JSON.parse(source))
    .then(transitionManifest => preparePagesArtifact(root, resolve(root, 'dist/pages'), { transitionManifest }))
    .then(path => {
    console.log(`Sanitized Pages artifact prepared at ${path}`);
  }).catch(error => {
    console.error(`Pages artifact preparation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
