(() => {
  "use strict";

  const COLLECTIONS = new Set(["dua", "dua-support", "dua-general", "azkar", "tajweed", "materials"]);
  const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

  function clone(value) {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(clone);
    const result = Object.create(null);
    for (const [key, entry] of Object.entries(value)) {
      if (!UNSAFE_KEYS.has(key)) result[key] = clone(entry);
    }
    return result;
  }

  function deepMerge(base, overlay) {
    if (!base || typeof base !== "object" || Array.isArray(base) ||
        !overlay || typeof overlay !== "object" || Array.isArray(overlay)) {
      return clone(overlay);
    }
    const result = clone(base);
    for (const [key, value] of Object.entries(overlay)) {
      if (UNSAFE_KEYS.has(key)) continue;
      result[key] = value && typeof value === "object" && !Array.isArray(value) &&
          result[key] && typeof result[key] === "object" && !Array.isArray(result[key])
        ? deepMerge(result[key], value)
        : clone(value);
    }
    return result;
  }

  function normalizeCollection(collection) {
    const byId = new Map();
    if (!Array.isArray(collection)) return [];
    for (const entry of collection) {
      const record = entry?.record && typeof entry.record === "object" ? entry.record : entry;
      const id = String(entry?.id ?? record?.id ?? "").trim();
      if (!id || !record || typeof record !== "object" || Array.isArray(record)) continue;
      byId.set(id, { id, record: clone({ ...record, id }) });
    }
    return [...byId.values()];
  }

  function normalizeSnapshot(raw) {
    const snapshot = {
      schemaVersion: 1,
      records: Object.create(null),
      deleted: Object.create(null),
      updatedAt: String(raw?.updatedAt || ""),
    };
    for (const name of COLLECTIONS) {
      snapshot.records[name] = normalizeCollection(raw?.records?.[name]);
      snapshot.deleted[name] = Array.isArray(raw?.deleted?.[name])
        ? [...new Set(raw.deleted[name].map((id) => String(id).trim()).filter(Boolean))]
        : [];
    }
    return snapshot;
  }

  function validateImport(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.schemaVersion !== 1 ||
        !raw.records || typeof raw.records !== "object" || Array.isArray(raw.records)) {
      throw new Error("Неподдерживаемый формат резервной копии (ожидается версия 1).");
    }
    for (const collection of COLLECTIONS) {
      if (raw.records[collection] !== undefined && !Array.isArray(raw.records[collection])) {
        throw new Error(`Некорректный список записей: ${collection}.`);
      }
      if (raw.deleted?.[collection] !== undefined && !Array.isArray(raw.deleted[collection])) {
        throw new Error(`Некорректный список удалений: ${collection}.`);
      }
      for (const entry of raw.records[collection] || []) {
        const record = entry?.record && typeof entry.record === "object" ? entry.record : entry;
        if (!record || typeof record !== "object" || Array.isArray(record) || !String(record.id || entry?.id || "").trim()) {
          throw new Error(`Запись в списке ${collection} должна содержать стабильный ID.`);
        }
      }
    }
    return normalizeSnapshot(raw);
  }

  function updateField(name, record, path, rawValue, inputType = "text") {
    if (!COLLECTIONS.has(name)) throw new Error(`Неизвестный раздел материалов: ${name}`);
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("Материал не найден.");
    const parts = String(path || "").split(".").filter(Boolean);
    if (!parts.length) throw new Error("Не указано поле материала.");
    if (parts.some((part) => UNSAFE_KEYS.has(part))) throw new Error("Это поле нельзя изменить.");
    let value = String(rawValue ?? "");
    if (inputType === "number") value = value.trim() === "" ? null : Number(value);
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Введите корректное число.");
    if (parts.length === 1 && parts[0] === "tags") {
      const parsed = value.split(",").map((entry) => entry.trim()).filter(Boolean);
      record.tags = Array.isArray(record.tags) || name !== "materials" ? parsed : value;
      return record;
    }
    let parent = record;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = parts[index];
      const key = Array.isArray(parent) ? Number(part) : part;
      if (Array.isArray(parent) && !Number.isInteger(key)) throw new Error("Некорректный индекс поля.");
      if (!parent[key] || typeof parent[key] !== "object") {
        parent[key] = /^\d+$/.test(parts[index + 1]) ? [] : {};
      }
      parent = parent[key];
    }
    const last = parts.at(-1);
    const key = Array.isArray(parent) ? Number(last) : last;
    if (Array.isArray(parent) && !Number.isInteger(key)) throw new Error("Некорректный индекс поля.");
    parent[key] = value;
    return record;
  }

  function createStore(storage = window.localStorage, key = "quranapp-admin-v2-material-records-v1") {
    let snapshot = normalizeSnapshot(null);
    try {
      const stored = storage.getItem(key);
      if (stored) snapshot = normalizeSnapshot(JSON.parse(stored));
    } catch {
      throw new Error("Не удалось прочитать локальные черновики материалов. Сделайте резервную копию или очистите повреждённые данные.");
    }

    function persist() {
      snapshot.updatedAt = new Date().toISOString();
      try {
        storage.setItem(key, JSON.stringify(snapshot));
      } catch {
        throw new Error("Браузер не сохранил черновик. Проверьте свободное место и настройки хранилища.");
      }
    }

    function ensureCollection(name) {
      if (!COLLECTIONS.has(name)) throw new Error(`Неизвестный раздел материалов: ${name}`);
      return snapshot.records[name];
    }

    return Object.freeze({
      materialize(name, source = []) {
        const local = ensureCollection(name);
        const overlays = new Map(local.map(({ id, record }) => [id, record]));
        const deleted = new Set(snapshot.deleted[name]);
        const result = [];
        const seen = new Set();
        for (const entry of Array.isArray(source) ? source : []) {
          const id = String(entry?.id ?? "").trim();
          if (!id || deleted.has(id)) continue;
          const overlay = overlays.get(id);
          result.push(overlay ? deepMerge(entry, overlay) : clone(entry));
          seen.add(id);
        }
        for (const { id, record } of local) {
          if (!seen.has(id) && !deleted.has(id)) result.push(clone(record));
        }
        return result;
      },
      get(name, id) {
        const record = ensureCollection(name).find((entry) => entry.id === String(id))?.record;
        return record ? clone(record) : null;
      },
      updateField(name, record, path, value, inputType) {
        return updateField(name, record, path, value, inputType);
      },
      save(name, value) {
        const collection = ensureCollection(name);
        if (!value || typeof value !== "object" || Array.isArray(value) || !String(value.id || "").trim()) {
          throw new Error("Не удалось сохранить черновик: у материала должен быть стабильный ID.");
        }
        const id = String(value.id).trim();
        const index = collection.findIndex((entry) => entry.id === id);
        const record = clone({ ...value, id });
        if (index === -1) collection.push({ id, record });
        else collection[index] = { id, record };
        snapshot.deleted[name] = snapshot.deleted[name].filter((deletedId) => deletedId !== id);
        persist();
        return clone(record);
      },
      delete(name, id) {
        const collection = ensureCollection(name);
        const stableId = String(id || "").trim();
        if (!stableId) throw new Error("Нельзя удалить материал без стабильного ID.");
        snapshot.records[name] = collection.filter((entry) => entry.id !== stableId);
        if (!snapshot.deleted[name].includes(stableId)) snapshot.deleted[name].push(stableId);
        persist();
      },
      exportBackup() {
        return JSON.stringify({ ...clone(snapshot), app: "quranapp-admin-v2" }, null, 2);
      },
      importBackup(raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        const validated = validateImport(parsed);
        const previous = clone(snapshot);
        try {
          storage.setItem(`${key}:backup`, JSON.stringify(previous));
        } catch {
          throw new Error("Не удалось создать резервную копию текущих черновиков; импорт отменён.");
        }
        snapshot = validated;
        try { persist(); }
        catch (error) { snapshot = previous; throw error; }
        return snapshot.updatedAt;
      },
      clear() {
        snapshot = normalizeSnapshot(null);
        persist();
      },
    });
  }

  window.AdminV2MaterialDrafts = Object.freeze({ createStore });
})();
