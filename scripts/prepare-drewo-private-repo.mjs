import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { knownTreeDirs, parseRegistry, REGISTRY_PATH, TEMPLATE_DIR, templateAssetNames } from '../supabase/functions/publish-drewo/create-tree.ts';
import { LEGACY_VAULT_PATH, VAULT_PATH } from '../supabase/functions/publish-drewo/vault.ts';

const exec = promisify(execFile);
const treeDirPattern = /^drewo(?:-[a-z0-9-]+)?$/;
const familyFiles = new Set(['index.html', 'legacy.html', 'family-tree.json', 'activity-log.json', 'access.json', 'push-subscriptions.json']);
const templateFiles = new Set(templateAssetNames());

async function git(repo, ...args) {
  const { stdout } = await exec('git', ['-C', repo, ...args], { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

function fileKind(path) {
  if (path === REGISTRY_PATH || path === VAULT_PATH || path === LEGACY_VAULT_PATH) return 'registryAndVault';
  const [dir, file, ...tail] = path.split('/');
  if (!treeDirPattern.test(dir)) return null;
  if (tail.length && ['backups', 'photos'].includes(file)) return file;
  if (tail.length) return null;
  if (familyFiles.has(file)) return 'familyFiles';
  return dir === TEMPLATE_DIR && templateFiles.has(file) ? 'templateAssets' : null;
}

async function prepareDestination(repo, destination) {
  const absolute = resolve(destination);
  const parent = await realpath(dirname(absolute));
  const target = join(parent, basename(absolute));
  if (target === repo || target.startsWith(repo + sep)) throw new Error('Staging must be outside the source checkout');
  const insideWorktree = await git(parent, 'rev-parse', '--is-inside-work-tree').catch(() => null);
  if (insideWorktree?.toString().trim() === 'true') throw new Error('Staging must be outside all Git worktrees');
  await mkdir(target, { mode: 0o700 });
  return target;
}

export async function prepareDrewoPrivateRepo({ source, ref = 'HEAD', destination }) {
  const repo = await realpath(source);
  if ((await git(repo, 'rev-parse', '--show-toplevel')).toString().trim() !== repo) {
    throw new Error('Source must be the root of a Git checkout');
  }
  const commit = (await git(repo, 'rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`)).toString().trim();
  const records = (await git(repo, 'ls-tree', '-r', '-z', commit)).toString().split('\0').filter(Boolean);
  const files = new Map();
  const counts = { registryAndVault: 0, familyFiles: 0, backups: 0, photos: 0, templateAssets: 0 };
  for (const record of records) {
    const separator = record.indexOf('\t');
    const path = record.slice(separator + 1);
    const kind = fileKind(path);
    if (!kind) continue;
    const [mode, type, oid] = record.slice(0, separator).split(' ');
    if (type !== 'blob' || !['100644', '100755'].includes(mode)) throw new Error('Family storage contains a non-regular Git object');
    if (path.split('/').some(part => !part || part === '.' || part === '..' || part.includes('\\'))) {
      throw new Error('Family storage contains an unsupported path');
    }
    files.set(path, oid);
    counts[kind]++;
  }

  const registryOid = files.get(REGISTRY_PATH);
  if (!registryOid) throw new Error('The selected commit has no family registry');
  const registryText = (await git(repo, 'cat-file', 'blob', registryOid)).toString();
  let entries;
  try { entries = JSON.parse(registryText).trees; } catch { throw new Error('The family registry is not valid JSON'); }
  if (!Array.isArray(entries)) throw new Error('The family registry has no list of trees');
  const known = new Set(knownTreeDirs(parseRegistry(registryText)));
  const treeDirs = new Set([...files.keys()].filter(path => treeDirPattern.test(path.split('/')[0])).map(path => path.split('/')[0]));
  if (entries.some(entry => !treeDirPattern.test(entry?.treeDir) || !known.has(entry.treeDir) || !treeDirs.has(entry.treeDir))) {
    throw new Error('The family registry contains trees without valid source files');
  }
  if ([...treeDirs].some(dir => !files.has(`${dir}/index.html`) || !files.has(`${dir}/family-tree.json`))) {
    throw new Error('At least one tree needs an index and an explicit snapshot before migration');
  }
  if (!treeDirs.has(TEMPLATE_DIR) || counts.templateAssets < 3) throw new Error('The family creation template is incomplete');

  if (destination) {
    const objectFormat = (await git(repo, 'rev-parse', '--show-object-format')).toString().trim();
    const target = await prepareDestination(repo, destination);
    try {
      for (const [path, oid] of files) {
        const file = join(target, ...path.split('/'));
        await mkdir(dirname(file), { recursive: true, mode: 0o700 });
        await writeFile(file, await git(repo, 'cat-file', 'blob', oid), { flag: 'wx', mode: 0o600 });
        const bytes = await readFile(file);
        const actual = createHash(objectFormat).update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
        if (actual !== oid) throw new Error('Copied family file failed Git object verification');
      }
    } catch (error) {
      await rm(target, { recursive: true, force: true });
      throw error;
    }
  }
  return { commit, trees: treeDirs.size, outsideRegistry: [...treeDirs].filter(dir => !known.has(dir)).length, ...counts, verifiedCopy: Boolean(destination) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { source: { type: 'string' }, ref: { type: 'string' }, destination: { type: 'string' } } });
    if (!values.source) throw new Error('Usage: node scripts/prepare-drewo-private-repo.mjs --source <checkout> [--ref <commit>] [--destination <new-local-directory>]');
    const result = await prepareDrewoPrivateRepo(values);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
