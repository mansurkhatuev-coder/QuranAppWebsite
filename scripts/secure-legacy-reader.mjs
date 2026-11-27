// Transform legacy readers only in the generated public artifact.
import { photoPersonIdPattern } from '../supabase/functions/publish-drewo/private-photo.mjs';

function once(source, anchor, replacement, label) {
  const first = source.indexOf(anchor);
  if (first < 0 || source.indexOf(anchor, first + anchor.length) >= 0) throw new Error('Legacy reader anchor: ' + label);
  return source.slice(0, first) + replacement + source.slice(first + anchor.length);
}
function range(source, start, end, replacement, label) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  if (a < 0 || b < 0 || source.indexOf(start, a + start.length) >= 0) throw new Error('Legacy reader range: ' + label);
  return source.slice(0, a) + replacement + source.slice(b);
}
export function secureLegacyReader(html) {
  if (!html.includes('function fetchRemoteTree()')) return html;
  let s = once(html, '<head>', '<head>\n  <meta name="referrer" content="no-referrer">', 'referrer policy');
  s = once(s, 'var tree = TreeModel.markAllowAdd(JSON.parse(dataEl.textContent), NUTSU_ID);',
    "var tree = TreeModel.markAllowAdd({ id: '__locked_placeholder__', name: '', sons: [] }, NUTSU_ID);", 'placeholder');
  s = range(s, '      function fetchAccessFile() {', '      function verifyLocalEditor(', `      function fetchAccessFile() {
        return callPublishApi({ action: 'status', treeDir: TREE_DIR })
          .then(function (data) { applyAccessFile(data); return data; })
          .catch(function () { return null; });
      }

`, 'status');
  s = range(s, '      function fetchRemoteTree() {', '      function applyRemoteTreeData(', `      function fetchRemoteTree() {
        var token = readNekToken();
        if (!token) return Promise.reject(new Error('Требуется вход в древо.'));
        return callPublishApi({ action: 'family-load', treeDir: TREE_DIR, sessionToken: token })
          .then(function (data) {
            if (!data || data.ok !== true || data.treeDir !== TREE_DIR || typeof data.treeJson !== 'string' || !data.fingerprint) {
              throw new Error('Не удалось подтвердить данные древа.');
            }
            var remote = JSON.parse(data.treeJson);
            if (!remote || typeof remote !== 'object' || !remote.id || remote.id === '__locked_placeholder__') throw new Error('Некорректные данные древа.');
            return { tree: remote, activityJson: typeof data.activityJson === 'string' ? data.activityJson : '[]' };
          });
      }

`, 'tree request');
  s = range(s, '      function applyNekSession() {', '      /**\n       * Вход семьи:', `      function applyNekSession() {
        var token = readNekToken();
        if (!token) return Promise.resolve(false);
        setViewLocked(true);
        setGateBusy('Проверяем семейный вход…');
        return callPublishApi({ action: 'auth', treeDir: TREE_DIR, sessionToken: token })
          .then(function (data) {
            if (!data || data.ok !== true || data.treeDir !== TREE_DIR || !data.sessionToken ||
                (data.role !== 'editor' && data.role !== 'super' && data.role !== 'viewer')) {
              throw new Error('Семейная сессия не подтверждена.');
            }
            storeNekToken(data.sessionToken);
            return fetchRemoteTree().then(function (remote) {
              data.fromServer = true;
              rememberSession('', data);
              nekSessionActive = true;
              applyRemoteTreeData(remote.tree, remote.activityJson);
              return rememberFingerprintFromTree();
            });
          }).then(function () { setViewLocked(false); return true; })
          .catch(function () {
            clearNekToken();
            nekSessionActive = false;
            rememberSession('', null);
            setViewLocked(true);
            return false;
          });
      }

`, 'verified session');
  s = once(s, "          var token = String(url.searchParams.get('nek') || '').trim();\n          if (!token) return '';\n          url.searchParams.delete('nek');\n          history.replaceState(null, '', url.pathname + url.search + url.hash);",
    `          var hasFragmentToken = url.hash.startsWith('#nek=');
          var fragmentToken = hasFragmentToken ? new URLSearchParams(url.hash.slice(1)).get('nek') : '';
          var token = String(fragmentToken || url.searchParams.get('nek') || '').trim();
          if (!hasFragmentToken && !url.searchParams.has('nek')) return '';
          if (hasFragmentToken) url.hash = '';
          url.searchParams.delete('nek');
          history.replaceState(history.state, '', url.pathname + url.search + url.hash);`, 'session URL');
  s = range(s, "          var token = String((data && data.sessionToken) || '');", '          storeNekToken(token);',
    `          var token = String((data && data.sessionToken) || '').trim();
          var treeDir = String((data && data.treeDir) || '');
          if (!data || data.ok !== true || !token || !treeDir) throw new Error('Сервер не подтвердил семейный вход.');
          if (treeDir !== TREE_DIR) {
            return import('/drewo/waydean-preview-family-auth.mjs?v=family-handoff-1').then(function (module) {
              var storage;
              try { storage = window.sessionStorage; } catch (err) {}
              var target = module.familySessionRedirect({ treeDir: treeDir, path: data.path, token: token, storage: storage });
              window.location.assign(target);
              return 'redirect';
            });
          }
`, 'family login route');
  s = once(s, 'if (!session && !nekSessionActive) {', 'if (!nekSessionActive) {', 'local identity');
  s = range(s, "      setGateBusy('Загружаем древо…');\n      Promise.all([fetchRemoteTree(), fetchAccessFile()])", '    })();', `      setGateBusy('Проверяем доступ…');
      fetchAccessFile()
        .then(applyNekSession)
        .then(function (verified) { return verified ? hydratePendingPhotos() : null; })
        .catch(function () {
          clearNekToken();
          nekSessionActive = false;
          rememberSession('', null);
          setViewLocked(true);
        })
        .finally(finishBoot);
`, 'boot');
  s = once(s, "          method: 'POST',\n          headers: { 'Content-Type': 'application/json' },\n          body: JSON.stringify(body),",
    "          method: 'POST',\n          cache: 'no-store',\n          headers: { 'Content-Type': 'application/json' },\n          body: JSON.stringify(body),", 'API cache');
  s = range(s, '      function photoThumbUrl(', '      function readViewSession()', `      var legacyPhotoCache = null;
      var legacyPhotoGeneration = 0;
      var legacyLightboxGeneration = 0;
      function clearLegacyPhotos() {
        legacyPhotoGeneration++;
        legacyLightboxGeneration++;
        if (legacyPhotoCache) legacyPhotoCache.clear();
        legacyPhotoCache = null;
      }
      function loadLegacyPhoto(personId, version, variant) {
        var id = String(personId), token = readNekToken();
        if (!nekSessionActive || !token || !/${photoPersonIdPattern.source}/.test(id)) return Promise.resolve(null);
        var pending = pendingPhotoUrls[id];
        if (pending) {
          var local = variant === 'thumbnail' ? pending.thumb : pending.full;
          if (local) return Promise.resolve(local);
        }
        var generation = legacyPhotoGeneration;
        return import('/drewo/waydean-preview-private-photo.mjs?v=1').then(function (module) {
          if (generation !== legacyPhotoGeneration || !nekSessionActive || token !== readNekToken()) return null;
          if (!legacyPhotoCache) legacyPhotoCache = module.createPrivatePhotoCache({
            request: function (payload) {
              return callPublishApi({ action: 'photo-load', treeDir: TREE_DIR, sessionToken: payload.token,
                personId: payload.personId, variant: payload.variant }).then(function (data) {
                return data.treeDir === TREE_DIR ? module.photoResponseBlob(data, payload) : null;
              });
            },
            makeUrl: function (blob) { return URL.createObjectURL(blob); },
            revokeUrl: function (url) { URL.revokeObjectURL(url); }
          });
          return legacyPhotoCache.load(JSON.stringify([id, version || '1', variant]), { personId: id, variant: variant, token: token });
        }).catch(function () { return null; });
      }

`, 'private photo loader');
  s = range(s, '          avatar.src = photoThumbUrl(meta.id, meta.photo);', '          btn.appendChild(avatar);', `          avatar.addEventListener('error', function () {
            avatar.remove(); btn.classList.remove('has-photo');
          });
          var loadAvatar = function () {
            loadLegacyPhoto(meta.id, meta.photo, 'thumbnail').then(function (url) {
              if (!avatar.isConnected) return;
              if (url) avatar.src = url;
              else { avatar.remove(); btn.classList.remove('has-photo'); }
            });
          };
          if (typeof IntersectionObserver === 'function') {
            var observer = new IntersectionObserver(function (entries) {
              if (!avatar.isConnected || entries.some(function (entry) { return entry.isIntersecting; })) {
                observer.disconnect();
                if (avatar.isConnected) loadAvatar();
              }
            }, { rootMargin: '180px' });
            observer.observe(avatar);
          } else Promise.resolve().then(loadAvatar);
`, 'avatar');
  s = once(s, `          personSheetPhoto.style.backgroundImage = 'url("' + photoFullUrl(node.id, ver) + '")';`,
    `          personSheetPhoto.style.backgroundImage = '';
          var requestedPhoto = JSON.stringify([node.id, ver]);
          personSheetPhoto.dataset.privatePhoto = requestedPhoto;
          loadLegacyPhoto(node.id, ver, 'full').then(function (url) {
            if (url && personSheetPhoto.dataset.privatePhoto === requestedPhoto && nekSessionActive) {
              personSheetPhoto.style.backgroundImage = 'url("' + url + '")';
            }
          });`, 'person sheet');
  s = once(s, "      function refreshPersonSheetPhoto(node) {\n        if (!personSheetPhoto || !node) return;", "      function refreshPersonSheetPhoto(node) {\n        if (!personSheetPhoto || !node) return;\n        delete personSheetPhoto.dataset.privatePhoto;", 'person sheet reset');
  s = range(s, "        photoLightboxImg.dataset.photoFallback = '';", '        try {\n          if (personSheetDialog', `        var photoRequest = ++legacyLightboxGeneration;
        photoLightboxImg.removeAttribute('src');
        photoLightboxImg.onerror = null;
        loadLegacyPhoto(node.id, ver, 'full').then(function (url) {
          if (photoRequest !== legacyLightboxGeneration || !nekSessionActive) return;
          if (url) photoLightboxImg.src = url;
          else showToast('Не удалось загрузить фото', 'error');
        });
`, 'lightbox');
  s = once(s, '      function closePhotoLightbox() {', '      function closePhotoLightbox() {\n        legacyLightboxGeneration++;', 'lightbox cancellation');
  s = once(s, "      function clearNekToken() {\n        storeNekToken('');", "      function clearNekToken() {\n        clearLegacyPhotos();\n        storeNekToken('');", 'logout cache');
  s = once(s, '      function logoutView() {', `      function logoutView() {
        if (!nekSessionActive) return;
        var logoutToken = readNekToken();`, 'logout token');
  s = once(s, "        showToast('Вы вышли', 'success');", `        setGateBusy('Выходим…');
        import('/drewo/waydean-preview-family-auth.mjs?v=family-handoff-1').then(function (module) {
          return module.revokeFamilySession({ endpoint: PUBLISH_URL, treeDir: TREE_DIR, token: logoutToken })
            .then(function (revoked) {
              if (!revoked) window.alert(module.FAMILY_LOGOUT_UNCONFIRMED);
            });
        }).catch(function () {
          window.alert('Вы вышли в этом браузере. Сервер не подтвердил завершение сессии.');
        }).finally(function () { window.location.reload(); });`, 'logout memory');
  s = s.replace(/^\s*var PHOTO_(?:PUBLIC|FALLBACK)_BASE = [^\n]*\n/gm, '\n');
  if (/fetch\('(?:family-tree|access)\.json|PHOTO_(?:PUBLIC|FALLBACK)_BASE|photo(?:Thumb|Full)(?:Fallback)?Url\(/.test(s)) throw new Error('Legacy reader: remaining public data reference');
  return s;
}
