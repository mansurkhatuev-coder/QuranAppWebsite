import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

const familyKeys = new Set([
  'drewo', 'drewo-adam', 'drewo-covza', 'drewo-dada-yurt', 'drewo-eldarovy', 'drewo-guzat', 'drewo-shahiid-nek'
]);
const uuidPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

function originOf(value) {
  if (typeof value !== 'string') throw new TypeError('Нужен утверждённый HTTPS origin нового приложения.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || value !== url.origin) throw new TypeError('Нужен канонический HTTPS origin без пути.');
  return url.origin;
}

function transitionHtml(route, origin) {
  if (route.state === 'transferring' && !Object.hasOwn(route, 'treeId')) {
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow"><title>Древо</title></head><body><main><p>Древо переносится. Попробуйте зайти позже.</p></main></body></html>`;
  }
  if (route.state === 'migrated' && typeof route.treeId === 'string' && uuidPattern.test(route.treeId)) {
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
  const origin = originOf(manifest?.origin);
  if (manifest.replaceNekLanding !== undefined && typeof manifest.replaceNekLanding !== 'boolean') {
    throw new TypeError('Для замены главной страницы Некъ требуется логическое значение.');
  }
  if (!Array.isArray(manifest.routes) || manifest.routes.length > familyKeys.size) {
    throw new TypeError('Список маршрутов имеет неверный формат.');
  }
  const seen = new Set();
  const applied = [];
  for (const route of manifest.routes) {
    if (!route || typeof route !== 'object' || !familyKeys.has(route.directory) || seen.has(route.directory) ||
        !['transferring', 'migrated'].includes(route.state)) {
      throw new TypeError('Разрешены только уникальные известные семейные маршруты.');
    }
    if (route.state === 'transferring' && Object.hasOwn(route, 'treeId')) throw new TypeError('У transferring-маршрута не должно быть treeId.');
    if (route.state === 'migrated' && (typeof route.treeId !== 'string' || !uuidPattern.test(route.treeId))) {
      throw new TypeError('У migrated-маршрута должен быть канонический UUID.');
    }
    seen.add(route.directory);
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
  if (manifest.replaceNekLanding) {
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
