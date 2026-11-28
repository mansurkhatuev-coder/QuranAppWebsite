import { lstat, mkdir, readFile, readdir, realpath, rm, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { secureLegacyReader } from './secure-legacy-reader.mjs';

const excludedDirectories = new Set(['.git', '.github', '_private', 'backups', 'node_modules', 'dist', 'private-drewo']);
const excludedFiles = new Set(['access.json', 'credentials.vault.json', 'push-subscriptions.json', 'activity-log.json', 'family-tree.json', 'tree-data.json']);
const privateScriptIds = new Set(['tree-data', 'activity-log']);
const retiredTreeReason = 'Древо удалено из каталога';
const familyDirPattern = /^drewo(?:-[a-z0-9-]+)?$/i;

function retiredTreePage() {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#102a23">
  <title>Семейная страница отключена — Древо</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, sans-serif; background: #102a23; color: #f4f0e5; }
    * { box-sizing: border-box; }
    body { min-height: 100vh; min-height: 100dvh; margin: 0; padding: max(24px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left)); display: grid; place-items: center; }
    main { width: min(100%, 34rem); padding: clamp(24px, 6vw, 40px); border: 1px solid #ffffff22; border-radius: 20px; background: #071913; }
    h1 { margin: 0 0 12px; font-size: clamp(24px, 6vw, 34px); line-height: 1.15; }
    p { margin: 0 0 24px; color: #d2d7ce; line-height: 1.6; }
    a { display: inline-flex; min-height: 44px; align-items: center; padding: 10px 16px; border-radius: 10px; background: #c6a868; color: #102a23; font-weight: 650; text-decoration: none; }
    a:focus-visible { outline: 3px solid #f5dfa6; outline-offset: 3px; }
  </style>
</head>
<body>
  <main>
    <h1>Семейная страница отключена</h1>
    <p>Эта ссылка больше не открывает семейные записи. Вернитесь в атлас, чтобы продолжить работу с другими древами.</p>
    <a href="/atlas/">Вернуться в атлас</a>
  </main>
</body>
</html>
`;
}

async function findRetiredLegacyTreeDirs(source, allowed) {
  const retired = new Set();
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^drewo(?:-[a-z0-9-]+)?$/i.test(entry.name) || allowed.has(entry.name)) continue;
    try {
      const markerPath = join(source, entry.name, 'access.json');
      const markerInfo = await lstat(markerPath);
      if (!markerInfo.isFile() || markerInfo.isSymbolicLink()) continue;
      const access = JSON.parse(await readFile(markerPath, 'utf8'));
      if (access?.locked === true && access?.lockedReason === retiredTreeReason
          && typeof access?.deletedAt === 'string' && Number.isFinite(Date.parse(access.deletedAt))
          && access?.billing?.status === 'disabled') {
        retired.add(entry.name);
      }
    } catch {
      // An unverified or missing retirement marker never allows an API-less route.
    }
  }
  return retired;
}

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
  if (excludedFiles.has(name) || ['trees/registry.json', 'docs/drewo-modernization-status.md'].includes(parts.join('/'))) return true;
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

async function copyPublicTree(source, destination, legacyAccess, base = '', skipFamilyDirs = false) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (!base && skipFamilyDirs && entry.isDirectory() && familyDirPattern.test(entry.name)) continue;
    const path = base ? join(base, entry.name) : entry.name;
    if (isPrivateArtifact(path)) continue;
    const from = join(source, entry.name), to = join(destination, entry.name);
    const info = await lstat(from);
    if (info.isSymbolicLink()) throw new Error(`Refusing symlink in Pages source: ${path}`);
    if (info.isDirectory()) {
      if (!base && legacyAccess?.retired.has(entry.name)) {
        await mkdir(to, { recursive: true });
        await writeFile(join(to, 'index.html'), retiredTreePage(), 'utf8');
        continue;
      }
      await mkdir(to, { recursive: true });
      await copyPublicTree(from, to, legacyAccess, path, skipFamilyDirs);
    } else if (info.isFile()) {
      if (/\.html?$/i.test(entry.name)) {
        let clean = stripEmbeddedFamilyData(await readFile(from, 'utf8'));
        const treeDir = path.split(sep)[0];
        if (/^drewo(?:-|$)/i.test(treeDir)) {
          const protectedHtml = secureLegacyReader(clean);
          if (legacyAccess && protectedHtml !== clean && !legacyAccess.allowed.has(treeDir)) {
            legacyAccess.missing.add(treeDir);
          }
          clean = protectedHtml;
        }
        verifyHtml(clean, path);
        await writeFile(to, clean, 'utf8');
      } else await copyFile(from, to);
    } else throw new Error(`Unexpected filesystem entry in Pages source: ${path}`);
  }
}

async function copyPrivateFamilyPages(privateSource, destination, legacyAccess) {
  for (const entry of await readdir(privateSource, { withFileTypes: true })) {
    if (!entry.isDirectory() || !familyDirPattern.test(entry.name)) continue;
    const from = join(privateSource, entry.name);
    const sourceInfo = await lstat(from);
    if (sourceInfo.isSymbolicLink()) throw new Error(`Refusing symlink in private Pages source: ${entry.name}`);
    if (legacyAccess.retired.has(entry.name)) {
      const to = join(destination, entry.name);
      await mkdir(to, { recursive: true });
      await writeFile(join(to, 'index.html'), retiredTreePage(), 'utf8');
      continue;
    }
    if (!legacyAccess.allowed.has(entry.name)) continue;
    const to = join(destination, entry.name);
    await mkdir(to, { recursive: true });
    await copyPublicTree(from, to, legacyAccess, entry.name);
  }

  for (const treeDir of legacyAccess.allowed) {
    const source = join(privateSource, treeDir);
    const info = await lstat(source).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
    if (!info?.isDirectory() || info.isSymbolicLink()) {
      throw new Error(`Private Pages source is missing an allowed family route: ${treeDir}`);
    }
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

export async function preparePagesArtifact(sourceRoot, destinationRoot = join(sourceRoot, 'dist/pages'), { release = false, privateSourceRoot } = {}) {
  const source = resolve(sourceRoot), destination = resolve(destinationRoot);
  const privateSource = privateSourceRoot ? resolve(source, privateSourceRoot) : null;
  if (privateSource && !release) throw new Error('A private Pages source is only supported in release mode');
  const buildRoot = join(source, 'dist');
  if (destination !== join(buildRoot, 'pages')) throw new Error('Pages output must be <checkout>/dist/pages');
  const sourceReal = await realpath(source);
  if (privateSource) {
    const privateInfo = await lstat(privateSource);
    if (!privateInfo.isDirectory() || privateInfo.isSymbolicLink()) throw new Error('Private Pages source must be a regular directory');
    const privateReal = await realpath(privateSource);
    const realBuildRoot = join(sourceReal, 'dist');
    if (privateReal === sourceReal || !privateReal.startsWith(sourceReal + sep)
        || privateReal === realBuildRoot || privateReal.startsWith(realBuildRoot + sep)) {
      throw new Error('Private Pages source must be a checkout directory outside the build output');
    }
  }
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
    let legacyAccess;
    if (release) {
      const { knownTreeDirs, parseRegistry, REGISTRY_PATH } = await import('../supabase/functions/publish-drewo/create-tree.ts');
      const registrySource = privateSource || source;
      const registryPath = join(registrySource, REGISTRY_PATH);
      const registryInfo = await lstat(registryPath);
      if (!registryInfo.isFile() || registryInfo.isSymbolicLink()) throw new Error('Pages registry must be a regular file');
      const registryRaw = await readFile(registryPath, 'utf8');
      if (privateSource) {
        let registryData;
        try { registryData = JSON.parse(registryRaw); }
        catch { throw new Error('Private Pages registry is not valid JSON'); }
        if (!registryData || !Array.isArray(registryData.trees)) {
          throw new Error('Private Pages registry must contain a trees array');
        }
      }
      const registry = parseRegistry(registryRaw);
      const allowed = new Set(knownTreeDirs(registry));
      legacyAccess = { allowed, missing: new Set(), retired: await findRetiredLegacyTreeDirs(registrySource, allowed) };
    }
    await copyPublicTree(source, destination, legacyAccess, '', Boolean(privateSource));
    if (privateSource) await copyPrivateFamilyPages(privateSource, destination, legacyAccess);
    if (legacyAccess?.missing.size) {
      const routes = [...legacyAccess.missing].sort().map(dir => `/${dir}/`).join(', ');
      throw new Error(`Pages release blocked: legacy family routes unsupported by the API: ${routes}`);
    }
    await verifyPublicTree(destination);
    return destination;
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const release = process.argv.includes('--release');
  const privateSourceIndex = process.argv.indexOf('--private-source');
  const privateSourceRoot = privateSourceIndex >= 0 ? process.argv[privateSourceIndex + 1] : undefined;
  if (privateSourceIndex >= 0 && (!privateSourceRoot || privateSourceRoot.startsWith('--'))) {
    console.error('--private-source requires a checked-out private repository path');
    process.exitCode = 1;
  } else preparePagesArtifact(root, undefined, { release, privateSourceRoot }).then(() => console.log('Filtered Pages artifact ready in dist/pages'))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
