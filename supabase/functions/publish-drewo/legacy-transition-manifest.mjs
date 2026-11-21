export const legacyTransitionManifestPath = 'scripts/legacy-transitions.json';

const directories = new Set([
  'drewo', 'drewo-adam', 'drewo-covza', 'drewo-dada-yurt', 'drewo-eldarovy', 'drewo-guzat', 'drewo-shahiid-nek'
]);
const states = new Set(['frozen', 'transferring', 'migrated']);
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

export function parseLegacyTransitionManifest(value) {
  const origin = typeof value?.origin === 'string' ? new URL(value.origin) : null;
  if (origin?.protocol !== 'https:' || value.origin !== origin.origin) {
    throw new TypeError('Нужен канонический HTTPS origin без пути.');
  }
  if (value.replaceNekLanding !== undefined && typeof value.replaceNekLanding !== 'boolean') {
    throw new TypeError('Для замены главной страницы Некъ требуется логическое значение.');
  }
  if (!Array.isArray(value.routes) || value.routes.length > directories.size) {
    throw new TypeError('Список маршрутов имеет неверный формат.');
  }
  const seen = new Set();
  for (const route of value.routes) {
    if (!route || typeof route !== 'object' || !directories.has(route.directory) || seen.has(route.directory) ||
        !states.has(route.state) || Object.keys(route).some(key => !['directory', 'state', 'treeId'].includes(key))) {
      throw new TypeError('Разрешены только уникальные известные семейные маршруты.');
    }
    if (route.state === 'migrated' ? typeof route.treeId !== 'string' || !uuid.test(route.treeId) : Object.hasOwn(route, 'treeId')) {
      throw new TypeError('Канонический UUID нужен только для состояния migrated.');
    }
    seen.add(route.directory);
  }
  return { origin: origin.origin, replaceNekLanding: value.replaceNekLanding === true, routes: value.routes };
}

export function frozenWriteDirectories(manifest, paths, additionalTrees = []) {
  const affected = new Set([...paths.map(path => path.split('/')[0]), ...additionalTrees]);
  return manifest.routes.filter(route => affected.has(route.directory)).map(route => route.directory);
}
