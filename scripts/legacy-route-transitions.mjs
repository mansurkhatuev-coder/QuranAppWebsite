import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { parseLegacyTransitionManifest } from '../supabase/functions/publish-drewo/legacy-transition-manifest.mjs';

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
    await rm(directory, { recursive: true, force: false });
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'index.html'), html, { flag: 'wx' });
    applied.push(route.directory);
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
