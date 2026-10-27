const DATABASE_NAME = 'waydean-preview-local-v1';
const STORE_NAME = 'tree-drafts';
const BACKUP_STORE = 'tree-backups';
const HISTORY_STORE = 'tree-history';
const DATABASE_VERSION = 3;
const MAX_LOCAL_BACKUPS = 12;
const MAX_PINNED_BACKUPS = 8;
const MAX_LOCAL_HISTORY = 60;

let databasePromise;

function openDatabase() {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error('Локальное хранилище недоступно в этом браузере.'));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
      if (!database.objectStoreNames.contains('person-photos')) {
        const photos = database.createObjectStore('person-photos', { keyPath: 'key' });
        photos.createIndex('treeKey', 'treeKey', { unique: false });
      } else {
        const photos = request.transaction.objectStore('person-photos');
        if (!photos.indexNames.contains('treeKey')) photos.createIndex('treeKey', 'treeKey', { unique: false });
      }
      if (!database.objectStoreNames.contains(BACKUP_STORE)) {
        const backups = database.createObjectStore(BACKUP_STORE, { keyPath: 'id' });
        backups.createIndex('treeKey', 'treeKey', { unique: false });
      }
      if (!database.objectStoreNames.contains(HISTORY_STORE)) {
        const history = database.createObjectStore(HISTORY_STORE, { keyPath: 'id' });
        history.createIndex('treeKey', 'treeKey', { unique: false });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error || new Error('Не удалось открыть локальное хранилище.'));
    request.onblocked = () => reject(new Error('Локальное хранилище занято другой вкладкой. Закройте лишние вкладки и повторите.'));
  }).catch(error => {
    databasePromise = null;
    throw error;
  });

  return databasePromise;
}

export async function loadLocalTreeDraft(key) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(String(key));
    request.onsuccess = () => {
      const row = request.result;
      resolve(row ? { tree: row.tree, revision: row.revision, updatedAt: row.updatedAt, metadata: row.metadata ?? null } : null);
    };
    request.onerror = () => reject(request.error || new Error('Не удалось прочитать локальный черновик.'));
    transaction.onabort = () => reject(transaction.error || new Error('Чтение локального черновика прервано.'));
  });
}

export async function saveLocalTreeDraft(key, tree, expectedRevision = 0, photoChanges = {}, metadata = null) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME, 'person-photos', BACKUP_STORE, HISTORY_STORE], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const photos = transaction.objectStore('person-photos');
    const backups = transaction.objectStore(BACKUP_STORE);
    const history = transaction.objectStore(HISTORY_STORE);
    const request = store.get(String(key));
    const photoRequest = photos.index('treeKey').getAll(String(key));
    let result;
    let conflict = false;
    let current;
    let previousPhotos;
    let readyCount = 0;

    const prepareSave = () => {
      if (++readyCount < 2) return;
      const currentRevision = current?.revision || 0;
      if (currentRevision !== expectedRevision) {
        conflict = true;
        transaction.abort();
        return;
      }
      const now = new Date().toISOString();
      if (current?.tree) {
        const backup = makeBackup(key, current.tree, 'Перед локальным сохранением', false, now);
        backups.put({ ...backup, photoKeys: (previousPhotos || []).map(photo => photo.personId) });
        pruneBackups(backups, key);
      }
      result = {
        key: String(key),
        tree: structuredClone(tree),
        revision: currentRevision + 1,
        updatedAt: now,
        metadata: metadata ?? current?.metadata ?? null
      };
      store.put(result);
      history.put(makeHistory(key, 'save', 'Локальный черновик сохранён', tree, result.revision, now));
      pruneHistory(history, key);
      for (const photo of photoChanges.puts ?? []) {
        photos.put({
          key: `${String(key)}::${String(photo.personId)}`,
          treeKey: String(key),
          personId: String(photo.personId),
          full: photo.full,
          thumb: photo.thumb,
          updatedAt: result.updatedAt
        });
      }
      for (const personId of photoChanges.deletes ?? []) {
        photos.delete(`${String(key)}::${String(personId)}`);
      }
    };
    request.onsuccess = () => { current = request.result; prepareSave(); };
    photoRequest.onsuccess = () => { previousPhotos = photoRequest.result || []; prepareSave(); };
    request.onerror = () => reject(request.error || new Error('Не удалось проверить версию локального черновика.'));
    photoRequest.onerror = () => reject(photoRequest.error || new Error('Не удалось прочитать фото для локальной копии.'));
    transaction.oncomplete = () => resolve({ revision: result.revision, updatedAt: result.updatedAt });
    transaction.onabort = () => reject(conflict
      ? Object.assign(new Error('Локальное древо уже изменено в другой вкладке. Обновите сохранённую версию.'), { code: 'LOCAL_DRAFT_CONFLICT' })
      : transaction.error || new Error('Не удалось сохранить локальный черновик.'));
    transaction.onerror = () => reject(transaction.error || new Error('Не удалось сохранить локальный черновик.'));
  });
}

export async function createLocalTreeBackup(key, tree, expectedRevision = 0, label = 'Ручной локальный снимок') {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME, BACKUP_STORE, HISTORY_STORE], 'readwrite');
    const drafts = transaction.objectStore(STORE_NAME);
    const backups = transaction.objectStore(BACKUP_STORE);
    const history = transaction.objectStore(HISTORY_STORE);
    const request = drafts.get(String(key));
    let result;
    let conflict = false;
    request.onsuccess = () => {
      const current = request.result;
      if ((current?.revision || 0) !== expectedRevision) {
        conflict = true;
        transaction.abort();
        return;
      }
      const savedTree = current?.tree || tree;
      const now = new Date().toISOString();
      result = makeBackup(key, savedTree, label, false, now);
      backups.put(result);
      history.put(makeHistory(key, 'snapshot', label, savedTree, current?.revision || 0, now));
      pruneBackups(backups, key);
      pruneHistory(history, key);
    };
    request.onerror = () => reject(request.error || new Error('Не удалось прочитать локальное дерево.'));
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(conflict
      ? Object.assign(new Error('Локальное древо изменено в другой вкладке. Сначала загрузите сохранённую версию.'), { code: 'LOCAL_DRAFT_CONFLICT' })
      : transaction.error || new Error('Не удалось создать локальный снимок.'));
    transaction.onerror = () => reject(transaction.error || new Error('Не удалось создать локальный снимок.'));
  });
}

export async function listLocalTreeBackups(key) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(BACKUP_STORE, 'readonly');
    const request = transaction.objectStore(BACKUP_STORE).index('treeKey').getAll(String(key));
    request.onsuccess = () => resolve((request.result || []).sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.createdAt.localeCompare(a.createdAt);
    }));
    request.onerror = () => reject(request.error || new Error('Не удалось прочитать локальные снимки.'));
    transaction.onabort = () => reject(transaction.error || new Error('Чтение локальных снимков прервано.'));
  });
}

export async function setLocalTreeBackupPinned(key, backupId, pinned) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([BACKUP_STORE, HISTORY_STORE], 'readwrite');
    const backups = transaction.objectStore(BACKUP_STORE);
    const history = transaction.objectStore(HISTORY_STORE);
    const request = backups.get(String(backupId));
    let result;
    let error;
    request.onsuccess = () => {
      const backup = request.result;
      if (!backup || backup.treeKey !== String(key)) {
        error = new Error('Локальный снимок не найден.');
        transaction.abort();
        return;
      }
      if (pinned) {
        const listRequest = backups.index('treeKey').getAll(String(key));
        listRequest.onsuccess = () => {
          const pinCount = listRequest.result.filter(item => item.pinned && item.id !== backup.id).length;
          if (pinCount >= MAX_PINNED_BACKUPS) {
            error = new Error(`Можно закрепить не больше ${MAX_PINNED_BACKUPS} локальных снимков.`);
            transaction.abort();
            return;
          }
          result = { ...backup, pinned: true };
          backups.put(result);
          history.put(makeHistory(key, 'pin', 'Локальный снимок закреплён', backup.tree, undefined, new Date().toISOString()));
          pruneHistory(history, key);
        };
        listRequest.onerror = () => { error = listRequest.error || new Error('Не удалось проверить закреплённые снимки.'); transaction.abort(); };
      } else {
        result = { ...backup, pinned: false };
        backups.put(result);
        history.put(makeHistory(key, 'unpin', 'Локальный снимок откреплён', backup.tree, undefined, new Date().toISOString()));
        pruneHistory(history, key);
      }
    };
    request.onerror = () => reject(request.error || new Error('Не удалось прочитать локальный снимок.'));
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(error || transaction.error || new Error('Не удалось изменить локальный снимок.'));
    transaction.onerror = () => reject(error || transaction.error || new Error('Не удалось изменить локальный снимок.'));
  });
}

export async function restoreLocalTreeBackup(key, backupId, expectedRevision = 0) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME, BACKUP_STORE, HISTORY_STORE], 'readwrite');
    const drafts = transaction.objectStore(STORE_NAME);
    const backups = transaction.objectStore(BACKUP_STORE);
    const history = transaction.objectStore(HISTORY_STORE);
    const backupRequest = backups.get(String(backupId));
    const draftRequest = drafts.get(String(key));
    let backup;
    let current;
    let result;
    let conflict = false;
    let invalid = false;
    let readyCount = 0;
    const restore = () => {
      if (++readyCount < 2) return;
      if (!backup || backup.treeKey !== String(key)) {
        invalid = true;
        transaction.abort();
        return;
      }
      const currentRevision = current?.revision || 0;
      if (currentRevision !== expectedRevision) {
        conflict = true;
        transaction.abort();
        return;
      }
      const now = new Date().toISOString();
      if (current?.tree) {
        const safetyBackup = makeBackup(key, current.tree, 'Перед восстановлением', true, now);
        backups.put(safetyBackup);
      }
      result = {
        key: String(key),
        tree: structuredClone(backup.tree),
        revision: currentRevision + 1,
        updatedAt: now
      };
      drafts.put(result);
      history.put(makeHistory(key, 'restore', `Восстановлен снимок от ${new Date(backup.createdAt).toLocaleString('ru-RU')}`, backup.tree, result.revision, now));
      pruneBackups(backups, key);
      pruneHistory(history, key);
    };
    backupRequest.onsuccess = () => { backup = backupRequest.result; restore(); };
    draftRequest.onsuccess = () => { current = draftRequest.result; restore(); };
    backupRequest.onerror = () => reject(backupRequest.error || new Error('Не удалось прочитать локальный снимок.'));
    draftRequest.onerror = () => reject(draftRequest.error || new Error('Не удалось прочитать текущий черновик.'));
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(conflict
      ? Object.assign(new Error('Локальное древо изменено в другой вкладке. Сначала загрузите сохранённую версию.'), { code: 'LOCAL_DRAFT_CONFLICT' })
      : invalid ? new Error('Локальный снимок не найден.')
        : transaction.error || new Error('Не удалось восстановить локальный снимок.'));
    transaction.onerror = () => reject(transaction.error || new Error('Не удалось восстановить локальный снимок.'));
  });
}

export async function listLocalTreeHistory(key) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(HISTORY_STORE, 'readonly');
    const request = transaction.objectStore(HISTORY_STORE).index('treeKey').getAll(String(key));
    request.onsuccess = () => resolve((request.result || []).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    request.onerror = () => reject(request.error || new Error('Не удалось прочитать локальную историю.'));
    transaction.onabort = () => reject(transaction.error || new Error('Чтение локальной истории прервано.'));
  });
}

function makeBackup(treeKey, tree, label, safety, createdAt) {
  const key = String(treeKey);
  return {
    id: `${key}::${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
    treeKey: key,
    tree: structuredClone(tree),
    label: String(label || 'Локальный снимок'),
    createdAt,
    pinned: false,
    safety: Boolean(safety),
    personCount: countPeople(tree),
    photoCount: countPhotos(tree)
  };
}

function makeHistory(treeKey, action, label, tree, revision, createdAt) {
  const key = String(treeKey);
  return {
    id: `${key}::${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
    treeKey: key,
    action,
    label: String(label || action),
    createdAt,
    revision: Number.isFinite(revision) ? revision : null,
    personCount: tree ? countPeople(tree) : null
  };
}

function countPeople(tree) {
  return (tree ? 1 : 0) + (tree?.sons || []).reduce((total, child) => total + countPeople(child), 0);
}

function countPhotos(tree) {
  return (tree?.photo ? 1 : 0) + (tree?.sons || []).reduce((total, child) => total + countPhotos(child), 0);
}

function pruneBackups(store, treeKey) {
  const request = store.index('treeKey').getAll(String(treeKey));
  request.onsuccess = () => {
    const rows = request.result || [];
    const recent = rows.filter(row => !row.pinned).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const row of recent.slice(MAX_LOCAL_BACKUPS)) store.delete(row.id);
  };
}

function pruneHistory(store, treeKey) {
  const request = store.index('treeKey').getAll(String(treeKey));
  request.onsuccess = () => {
    const rows = request.result || [];
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const row of rows.slice(MAX_LOCAL_HISTORY)) store.delete(row.id);
  };
}

export async function clearLocalTreeDraft(key, expectedRevision) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME, 'person-photos'], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const photos = transaction.objectStore('person-photos');
    const request = store.get(String(key));
    let conflict = false;

    request.onsuccess = () => {
      const current = request.result;
      if ((current?.revision || 0) !== expectedRevision) {
        conflict = true;
        transaction.abort();
        return;
      }
      store.delete(String(key));
      const photoRows = photos.index('treeKey').openCursor(IDBKeyRange.only(String(key)));
      photoRows.onsuccess = () => {
        const cursor = photoRows.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
    };
    request.onerror = () => reject(request.error || new Error('Не удалось проверить локальный черновик.'));
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(conflict
      ? Object.assign(new Error('Локальное древо изменено в другой вкладке. Сначала обновите сохранённую версию.'), { code: 'LOCAL_DRAFT_CONFLICT' })
      : transaction.error || new Error('Не удалось очистить локальный черновик.'));
    transaction.onerror = () => reject(transaction.error || new Error('Не удалось очистить локальный черновик.'));
  });
}

export async function listLocalTreePhotos(key) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('person-photos', 'readonly');
    const request = transaction.objectStore('person-photos').index('treeKey').getAll(String(key));
    request.onsuccess = () => resolve((request.result ?? []).map(row => ({
      personId: row.personId,
      full: row.full,
      thumb: row.thumb
    })));
    request.onerror = () => reject(request.error || new Error('Не удалось прочитать локальные фотографии.'));
    transaction.onabort = () => reject(transaction.error || new Error('Чтение локальных фотографий прервано.'));
  });
}
