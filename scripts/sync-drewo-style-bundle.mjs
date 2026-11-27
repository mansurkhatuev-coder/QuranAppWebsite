import { randomBytes } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'drewo');
const outputPath = path.join(directory, 'waydean-preview-bundle.css');

export const sourceFiles = [
  'waydean-preview.css',
  'waydean-preview-loading.css',
  'waydean-preview-camera.css',
  'waydean-preview-master.css',
  'waydean-preview-lod.css',
  'waydean-preview-edit.css',
  'waydean-preview-readiness.css',
  'waydean-preview-main-polish.css',
  'waydean-preview-desktop-controls.css',
  'waydean-preview-mobile-controls.css',
  'waydean-preview-layout.css',
  'waydean-preview-minimap.css',
  'waydean-preview-editorial.css',
  'waydean-preview-history.css',
  'waydean-preview-pwa.css',
  'waydean-preview-video.css',
  'waydean-preview-self.css',
  'waydean-preview-glass-cards.css',
  'waydean-preview-auth.css',
  'waydean-preview-person-sheet.css',
  'waydean-preview-appearance.css',
  'waydean-preview-demo.css',
  'waydean-color-scheme.css',
];

export async function buildBundle() {
  const sections = await Promise.all(sourceFiles.map(async name => {
    const source = await readFile(path.join(directory, name), 'utf8');
    return `/* ${name} */\n${source}`;
  }));
  return sections.join('\n');
}

export async function isBundleCurrent() {
  const [expected, actual] = await Promise.all([buildBundle(), readFile(outputPath, 'utf8')]);
  return expected === actual;
}

async function writeBundle(contents) {
  const temporaryPath = `${outputPath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await writeFile(temporaryPath, contents, { flag: 'wx', mode: 0o644 });
    await rename(temporaryPath, outputPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function main() {
  const mode = process.argv[2] || '--check';
  if (process.argv.length > 3 || !['--check', '--write'].includes(mode)) {
    throw new Error('Usage: node scripts/sync-drewo-style-bundle.mjs [--check|--write]');
  }
  const expected = await buildBundle();
  const actual = await readFile(outputPath, 'utf8');
  if (mode === '--check') {
    if (expected !== actual) throw new Error('Waydean CSS bundle is stale; run with --write.');
    process.stdout.write(`Waydean CSS bundle matches ${sourceFiles.length} source files.\n`);
    return;
  }
  if (expected !== actual) await writeBundle(expected);
  process.stdout.write(`Waydean CSS bundle ${expected === actual ? 'already current' : 'rebuilt'} from ${sourceFiles.length} source files.\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
