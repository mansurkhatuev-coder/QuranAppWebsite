#!/usr/bin/env python3
"""Queue photos locally and commit them to git on Save."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / "drewo" / "index.html",
    ROOT / "drewo-dada-yurt" / "index.html",
    ROOT / "drewo-reklama" / "index.html",
]

PENDING_HELPERS = r"""
      var pendingPhotoUrls = {};
      var pendingPhotoDeletes = [];

      function pendingPhotoDbName() {
        return TREE_DIR + '-pending-photos';
      }

      function pendingPhotoDeleteKey() {
        return TREE_DIR + '-photo-deletes';
      }

      function loadPendingPhotoDeletes() {
        try {
          var raw = localStorage.getItem(pendingPhotoDeleteKey());
          var list = raw ? JSON.parse(raw) : [];
          pendingPhotoDeletes = Array.isArray(list) ? list.map(String) : [];
        } catch (err) {
          pendingPhotoDeletes = [];
        }
      }

      function savePendingPhotoDeletes() {
        try {
          localStorage.setItem(pendingPhotoDeleteKey(), JSON.stringify(pendingPhotoDeletes));
        } catch (err) {}
      }

      function openPhotoDb() {
        return new Promise(function (resolve, reject) {
          if (!window.indexedDB) {
            reject(new Error('IndexedDB недоступен'));
            return;
          }
          var req = indexedDB.open(pendingPhotoDbName(), 1);
          req.onupgradeneeded = function () {
            var db = req.result;
            if (!db.objectStoreNames.contains('photos')) {
              db.createObjectStore('photos', { keyPath: 'id' });
            }
          };
          req.onsuccess = function () { resolve(req.result); };
          req.onerror = function () { reject(req.error); };
        });
      }

      function setPendingPhotoUrls(id, fullDataUrl, thumbDataUrl) {
        var key = String(id);
        var prev = pendingPhotoUrls[key];
        if (prev) {
          try { if (prev.thumb && String(prev.thumb).indexOf('blob:') === 0) URL.revokeObjectURL(prev.thumb); } catch (err) {}
          try { if (prev.full && String(prev.full).indexOf('blob:') === 0) URL.revokeObjectURL(prev.full); } catch (err2) {}
        }
        pendingPhotoUrls[key] = { full: fullDataUrl, thumb: thumbDataUrl };
      }

      function putPendingPhoto(id, fullDataUrl, thumbDataUrl) {
        setPendingPhotoUrls(id, fullDataUrl, thumbDataUrl);
        pendingPhotoDeletes = pendingPhotoDeletes.filter(function (x) { return String(x) !== String(id); });
        savePendingPhotoDeletes();
        return openPhotoDb()
          .then(function (db) {
            return new Promise(function (resolve, reject) {
              var tx = db.transaction('photos', 'readwrite');
              tx.objectStore('photos').put({
                id: String(id),
                full: fullDataUrl,
                thumb: thumbDataUrl,
                at: Date.now(),
              });
              tx.oncomplete = function () { resolve(); };
              tx.onerror = function () { reject(tx.error); };
            });
          })
          .catch(function () {
            return undefined;
          });
      }

      function listPendingPhotos() {
        return openPhotoDb()
          .then(function (db) {
            return new Promise(function (resolve, reject) {
              var tx = db.transaction('photos', 'readonly');
              var req = tx.objectStore('photos').getAll();
              req.onsuccess = function () {
                var rows = Array.isArray(req.result) ? req.result : [];
                resolve(rows.map(function (row) {
                  return { personId: String(row.id), full: row.full, thumb: row.thumb };
                }).filter(function (row) { return row.personId && row.full && row.thumb; }));
              };
              req.onerror = function () { reject(req.error); };
            });
          })
          .catch(function () { return []; });
      }

      function clearPendingPhoto(id) {
        var key = String(id);
        var prev = pendingPhotoUrls[key];
        if (prev) {
          try { if (prev.thumb && String(prev.thumb).indexOf('blob:') === 0) URL.revokeObjectURL(prev.thumb); } catch (err) {}
          try { if (prev.full && String(prev.full).indexOf('blob:') === 0) URL.revokeObjectURL(prev.full); } catch (err2) {}
          delete pendingPhotoUrls[key];
        }
        return openPhotoDb()
          .then(function (db) {
            return new Promise(function (resolve) {
              var tx = db.transaction('photos', 'readwrite');
              tx.objectStore('photos').delete(key);
              tx.oncomplete = function () { resolve(); };
              tx.onerror = function () { resolve(); };
            });
          })
          .catch(function () { return undefined; });
      }

      function clearPendingPhotos(ids) {
        var list = Array.isArray(ids) ? ids : [];
        return Promise.all(list.map(clearPendingPhoto));
      }

      function hydratePendingPhotos() {
        loadPendingPhotoDeletes();
        return listPendingPhotos().then(function (rows) {
          rows.forEach(function (row) {
            setPendingPhotoUrls(row.personId, row.full, row.thumb);
            var node = TreeModel.findById(tree, row.personId);
            if (node && !node.photo) {
              node.photo = String(Date.now());
            }
          });
          if (rows.length) persistTree();
        });
      }

"""

REPLACEMENTS: list[tuple[str, str]] = [
    (
        "      var accessLockedReason = '';\n",
        "      var accessLockedReason = '';\n" + PENDING_HELPERS,
    ),
    (
        """      function photoThumbUrl(personId, version) {
        var v = encodeURIComponent(String(version || '1'));
        var id = encodeURIComponent(String(personId));
        return PHOTO_PUBLIC_BASE + '/' + id + '-thumb.jpg?v=' + v;
      }

      function photoFullUrl(personId, version) {
        var v = encodeURIComponent(String(version || '1'));
        var id = encodeURIComponent(String(personId));
        return PHOTO_PUBLIC_BASE + '/' + id + '.jpg?v=' + v;
      }
""",
        """      function photoThumbUrl(personId, version) {
        var pending = pendingPhotoUrls[String(personId)];
        if (pending && pending.thumb) return pending.thumb;
        var v = encodeURIComponent(String(version || '1'));
        var id = encodeURIComponent(String(personId));
        return PHOTO_PUBLIC_BASE + '/' + id + '-thumb.jpg?v=' + v;
      }

      function photoFullUrl(personId, version) {
        var pending = pendingPhotoUrls[String(personId)];
        if (pending && pending.full) return pending.full;
        var v = encodeURIComponent(String(version || '1'));
        var id = encodeURIComponent(String(personId));
        return PHOTO_PUBLIC_BASE + '/' + id + '.jpg?v=' + v;
      }
""",
    ),
    (
        """        var treeJson = treeJsonForEmbed(tree);
        var payload = {
          action: 'publish',
          password: password,
          treeDir: TREE_DIR,
          treeJson: treeJson,
          activityJson: JSON.stringify(loadActivity(), null, 2),
          baseFingerprint: baseFingerprint || '',
          force: !!opts.force,
          message: 'Update family tree from web editor',
        };
        var data = await callPublishApi(payload);
        if (data && data.fingerprint) baseFingerprint = data.fingerprint;
        else baseFingerprint = await fingerprintTreeText(treeJson);
        setTreeDirty(false);
        return data;
""",
        """        var treeJson = treeJsonForEmbed(tree);
        var pendingPhotos = await listPendingPhotos();
        var payload = {
          action: 'publish',
          password: password,
          treeDir: TREE_DIR,
          treeJson: treeJson,
          activityJson: JSON.stringify(loadActivity(), null, 2),
          baseFingerprint: baseFingerprint || '',
          force: !!opts.force,
          message: 'Update family tree from web editor',
          photos: pendingPhotos,
          photoDeletes: pendingPhotoDeletes.slice(),
        };
        var data = await callPublishApi(payload);
        await clearPendingPhotos(pendingPhotos.map(function (row) { return row.personId; }));
        pendingPhotoDeletes = [];
        savePendingPhotoDeletes();
        if (data && data.fingerprint) baseFingerprint = data.fingerprint;
        else baseFingerprint = await fingerprintTreeText(treeJson);
        setTreeDirty(false);
        return data;
""",
    ),
    (
        """      function uploadPersonPhotoData(id, fullDataUrl, thumbDataUrl) {
        var node = TreeModel.findById(tree, id);
        if (!node || !fullDataUrl || !thumbDataUrl) return Promise.resolve();
        if (treeLocked && !isSuperSession()) {
          showToast('Правки заблокированы', 'error');
          return Promise.resolve();
        }
        var password = sessionPassword;
        if (!password) {
          showToast('Сначала введите пароль', 'error');
          return Promise.resolve();
        }
        showToast('Загружаем…', 'success');
        return callPublishApi({
          action: 'upload-photo',
          password: password,
          treeDir: TREE_DIR,
          personId: String(id),
          full: fullDataUrl,
          thumb: thumbDataUrl,
          version: String(Date.now()),
        })
          .then(function (data) {
            node.photo = data.photo || data.version || String(Date.now());
            persistTree();
            pushActivity({
              type: 'photo',
              at: new Date().toISOString(),
              son: node.name || '',
              sonId: id,
            });
            showToast('Фото добавлено. Нажмите «Сохранить»', 'success');
            render(false);
            if (personSheetTargetId && String(personSheetTargetId) === String(id)) {
              openPersonSheet(id);
            } else {
              personSheetTargetId = id;
              openPersonSheet(id);
            }
          })
          .catch(function (err) {
            showToast((err && err.message) || 'Не удалось загрузить фото', 'error');
          });
      }
""",
        """      function uploadPersonPhotoData(id, fullDataUrl, thumbDataUrl) {
        var node = TreeModel.findById(tree, id);
        if (!node || !fullDataUrl || !thumbDataUrl) return Promise.resolve();
        if (treeLocked && !isSuperSession()) {
          showToast('Правки заблокированы', 'error');
          return Promise.resolve();
        }
        var version = String(Date.now());
        return putPendingPhoto(id, fullDataUrl, thumbDataUrl).then(function () {
          node.photo = version;
          persistTree();
          pushActivity({
            type: 'photo',
            at: new Date().toISOString(),
            son: node.name || '',
            sonId: id,
          });
          showToast('Фото добавлено. Нажмите «Сохранить»', 'success');
          render(false);
          if (personSheetTargetId && String(personSheetTargetId) === String(id)) {
            openPersonSheet(id);
          } else {
            personSheetTargetId = id;
            openPersonSheet(id);
          }
        });
      }
""",
    ),
    (
        """        return Promise.all([
          compressSquarePhoto(file, 800, 0.82),
          compressSquarePhoto(file, 96, 0.8),
        ])
          .then(function (parts) {
            showToast('Загружаем…', 'success');
            return callPublishApi({
              action: 'upload-photo',
              password: password,
              treeDir: TREE_DIR,
              personId: String(id),
              full: parts[0],
              thumb: parts[1],
              version: String(Date.now()),
            });
          })
          .then(function (data) {
            node.photo = data.photo || data.version || String(Date.now());
            persistTree();
            pushActivity({
              type: 'photo',
              at: new Date().toISOString(),
              son: node.name || '',
              sonId: id,
            });
            showToast('Фото добавлено. Нажмите «Сохранить»', 'success');
            render(false);
            if (personSheetTargetId && String(personSheetTargetId) === String(id)) {
              openPersonSheet(id);
            }
          })
          .catch(function (err) {
            showToast((err && err.message) || 'Не удалось загрузить фото', 'error');
""",
        """        return Promise.all([
          compressSquarePhoto(file, 800, 0.82),
          compressSquarePhoto(file, 96, 0.8),
        ])
          .then(function (parts) {
            return uploadPersonPhotoData(id, parts[0], parts[1]);
          })
          .catch(function (err) {
            showToast((err && err.message) || 'Не удалось загрузить фото', 'error');
""",
    ),
    (
        """        askConfirm('Убрать фото у «' + (node.name || '') + '»?').then(function (ok) {
          if (!ok) return;
          callPublishApi({
            action: 'delete-photo',
            password: password,
            treeDir: TREE_DIR,
            personId: String(id),
          })
            .catch(function () {
              return { ok: true };
            })
            .then(function () {
              delete node.photo;
              persistTree();
              pushActivity({
                type: 'photo-remove',
                at: new Date().toISOString(),
                son: node.name || '',
                sonId: id,
""",
        """        askConfirm('Убрать фото у «' + (node.name || '') + '»?').then(function (ok) {
          if (!ok) return;
          var wasPending = !!pendingPhotoUrls[String(id)];
          clearPendingPhoto(id).then(function () {
              if (!wasPending) {
                pendingPhotoDeletes.push(String(id));
                savePendingPhotoDeletes();
              }
              delete node.photo;
              persistTree();
              pushActivity({
                type: 'photo-remove',
                at: new Date().toISOString(),
                son: node.name || '',
                sonId: id,
""",
    ),
    (
        """        setGateBusy('Открываем…');
        return rememberFingerprintFromTree();
      }).then(function () {
        finishBoot();
      }).catch(function () {
        setGateBusy('Открываем…');
        rememberFingerprintFromTree().finally(finishBoot);
      });
""",
        """        setGateBusy('Открываем…');
        return rememberFingerprintFromTree();
      }).then(function () {
        return hydratePendingPhotos();
      }).then(function () {
        finishBoot();
      }).catch(function () {
        setGateBusy('Открываем…');
        rememberFingerprintFromTree().then(hydratePendingPhotos).finally(finishBoot);
      });
""",
    ),
]


def main() -> None:
    for path in TARGETS:
        text = path.read_text(encoding="utf-8")
        for old, new in REPLACEMENTS:
            if old not in text:
                raise SystemExit(f"Missing snippet in {path}:\n{old[:220]!r}")
            text = text.replace(old, new, 1)
        path.write_text(text, encoding="utf-8")
        print(f"patched {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
