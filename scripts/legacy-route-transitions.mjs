import { lstat, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { parseLegacyTransitionManifest } from '../supabase/functions/publish-drewo/legacy-transition-manifest.mjs';

// Active family pages, the shared preview, Nek and the cabinet use these URLs.
// New files in the primary family directory are removed unless approved here.
const sharedDrewoFiles = new Set([
  'apple-touch-icon.png', 'bg-day-2.jpg', 'icon-192.png', 'icon-512.png', 'sw.js',
  'waydean-admin-identity.mjs', 'waydean-color-scheme.css',
  'waydean-preview.html', 'waydean-preview.js', 'waydean-preview.css', 'waydean-preview.webmanifest',
  'waydean-preview-access.mjs', 'waydean-preview-account-history.mjs',
  'waydean-preview-admin-api.mjs', 'waydean-preview-admin-controls.mjs',
  'waydean-preview-appearance.css', 'waydean-preview-appearance.mjs', 'waydean-preview-auth.css',
  'waydean-preview-bundle.css', 'waydean-preview-camera.css', 'waydean-preview-camera.mjs',
  'waydean-preview-dates.mjs', 'waydean-preview-demo.css', 'waydean-preview-desktop-controls.css',
  'waydean-preview-edit.css', 'waydean-preview-edit.mjs', 'waydean-preview-editorial.css',
  'waydean-preview-family-api.mjs', 'waydean-preview-family-auth.mjs', 'waydean-preview-fixture.mjs',
  'waydean-preview-glass-cards.css', 'waydean-preview-history.css', 'waydean-preview-layout.css',
  'waydean-preview-lines.mjs', 'waydean-preview-loading.css', 'waydean-preview-lod.css',
  'waydean-preview-lod.mjs', 'waydean-preview-main-polish.css', 'waydean-preview-master.css',
  'waydean-preview-minimap.css', 'waydean-preview-mobile-controls.css', 'waydean-preview-model.mjs',
  'waydean-preview-person-sheet.css', 'waydean-preview-publish.mjs', 'waydean-preview-pwa.css',
  'waydean-preview-pwa.mjs', 'waydean-preview-readiness.css', 'waydean-preview-route.mjs',
  'waydean-preview-selection.mjs', 'waydean-preview-self.css', 'waydean-preview-storage.mjs',
  'waydean-preview-sw.js', 'waydean-preview-video-handoff.mjs', 'waydean-preview-video.css',
  'waydean-preview-whoami.mjs'
]);

function transitionHtml(route, origin) {
  if (route.state === 'transferring') {
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow"><title>Древо</title></head><body><main><p>Древо переносится. Попробуйте зайти позже.</p></main></body></html>`;
  }
  if (route.state === 'migrated') {
    const url = `${origin}/t/${route.treeId}/`;
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow"><meta http-equiv="refresh" content="0;url=${url}"><title>Древо</title></head><body><main><p><a href="${url}">Открыть древо</a></p></main></body></html>`;
  }
  throw new TypeError('Для перехода нужен state transferring или migrated с UUID нового древа.');
}

/** Replace only explicitly approved, known family directories in a Pages artifact. */
export async function applyLegacyRouteTransitions(artifactRoot, manifest) {
  const root = resolve(artifactRoot);
  const marker = join(root, '.waydean-pages-artifact');
  const markerInfo = await lstat(marker).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (!markerInfo?.isFile() || markerInfo.isSymbolicLink() || await readFile(marker, 'utf8') !== 'waydean-pages-artifact-v1') {
    throw new Error('Маршруты можно менять только в проверенном dist/pages-артефакте.');
  }
  const { origin, routes, replaceNekLanding } = parseLegacyTransitionManifest(manifest);
  const applied = [];
  for (const route of routes) {
    if (route.state === 'frozen') continue;
    const directory = resolve(root, route.directory);
    if (directory !== join(root, route.directory) || !directory.startsWith(`${root}${sep}`)) throw new TypeError('Маршрут выходит из артефакта.');
    const existing = await lstat(directory).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
    if (!existing?.isDirectory() || existing.isSymbolicLink()) throw new Error(`В артефакте отсутствует безопасный каталог ${route.directory}.`);
    const html = transitionHtml(route, origin);
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (route.directory === 'drewo' && entry.isFile() && sharedDrewoFiles.has(entry.name)) continue;
      const target = resolve(directory, entry.name);
      if (!target.startsWith(`${directory}${sep}`)) throw new Error('Файл находится вне каталога перехода.');
      await rm(target, { recursive: entry.isDirectory(), force: false });
    }
    await writeFile(join(directory, 'index.html'), html, { flag: 'wx' });
    if (entries.some(entry => entry.name === 'legacy.html' && entry.isFile())) {
      await writeFile(join(directory, 'legacy.html'), html, { flag: 'wx' });
    }
    applied.push(route.directory);
  }
  if (applied.length) {
    const sharedDirectory = join(root, 'drewo');
    const directoryInfo = await lstat(sharedDirectory).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
    if (directoryInfo && !directoryInfo.isDirectory()) throw new Error('Некорректный каталог общего просмотра.');
    const preview = join(sharedDirectory, 'waydean-preview.html');
    const info = await lstat(preview).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
    if (info) {
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('Некорректный файл общего просмотра.');
      const html = await readFile(preview, 'utf8');
      const marker = '<!-- waydean-retired-families -->';
      if (html.split(marker).length !== 2) throw new Error('В общем просмотре требуется метка переноса.');
      await writeFile(preview, html.replace(marker, `<meta name="waydean-retired-families" content="${applied.join(',')}">`));
    }
  }
  if (replaceNekLanding) {
    const entry = join(root, 'nek', 'index.html');
    const info = await lstat(entry);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('В артефакте отсутствует страница Некъ.');
    const html = await readFile(entry, 'utf8');
    const marker = '<!-- drewo-atlas-transition -->';
    if (html.split(marker).length !== 2) throw new Error('В странице Некъ требуется одна точка перехода на Атлас.');
    await writeFile(entry, html.replace(marker, `<meta name="drewo-atlas-transition" content="${origin}/atlas/">`));
  }
  return applied;
}
