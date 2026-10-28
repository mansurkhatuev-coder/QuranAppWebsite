(() => {
  "use strict";

  const COLLECTIONS = new Set(["dua-support", "dua-general", "azkar", "tajweed", "materials"]);
  const PREFIX = "admin-v2-record:";

  function create(collection, id) {
    const source = String(collection || "");
    const value = String(id ?? "");
    if (!COLLECTIONS.has(source)) throw new TypeError("Unknown record collection/source.");
    if (!value.trim()) throw new TypeError("Record ID is required.");
    return `${PREFIX}${encodeURIComponent(JSON.stringify([source, value]))}`;
  }

  function parse(reference) {
    if (typeof reference !== "string" || !reference.startsWith(PREFIX)) return null;
    try {
      const value = JSON.parse(decodeURIComponent(reference.slice(PREFIX.length)));
      if (!Array.isArray(value) || value.length !== 2) return null;
      const [collection, id] = value;
      if (!COLLECTIONS.has(collection) || typeof id !== "string" || !id.trim()) return null;
      return { collection, id };
    } catch {
      return null;
    }
  }

  function matches(reference, collection, id) {
    const parsed = parse(reference);
    return Boolean(parsed && parsed.collection === String(collection || "") && parsed.id === String(id ?? ""));
  }

  function find(records, reference, collectionFor) {
    const parsed = parse(reference);
    if (!parsed || !Array.isArray(records) || typeof collectionFor !== "function") return null;
    return records.find((record) => {
      try { return create(collectionFor(record), record?.id) === reference; }
      catch { return false; }
    }) || null;
  }

  function tag(record, collection) {
    if (!record || typeof record !== "object") throw new TypeError("A record object is required.");
    if (!COLLECTIONS.has(String(collection || ""))) throw new TypeError("Unknown record collection/source.");
    Object.defineProperty(record, "__adminV2Collection", { value: collection, writable: true, configurable: true, enumerable: false });
    return record;
  }

  function collectionOf(item, kind) {
    if (kind === "dua") return item?.__adminV2Collection || (item?.category === "support_dua" ? "dua-support" : "dua-general");
    if (kind === "tajweed") return "tajweed";
    if (kind === "materials") return "materials";
    return item?.collection || item?.__adminV2Collection || (item?.duaRecord ? collectionOf(item.duaRecord, "dua") : "azkar");
  }

  function buildAzkarLinks(docs, azkarCatalog = [], duas = []) {
    const catalogById = new Map();
    const duasById = new Map();
    const byReference = new Map();
    (Array.isArray(azkarCatalog) ? azkarCatalog : []).forEach((record) => {
      const id = String(record?.id || "").trim();
      if (!id) return;
      catalogById.set(id, record);
      byReference.set(create("azkar", id), { id, collection: "azkar", docs: [], catalogRecord: record, duaRecord: null });
    });
    (Array.isArray(duas) ? duas : []).forEach((record) => {
      const id = String(record?.id || "").trim();
      if (!id) return;
      const matches = duasById.get(id) || [];
      matches.push(record);
      duasById.set(id, matches);
      if (!catalogById.has(id) && matches.length === 1) {
        const collection = collectionOf(record, "dua");
        byReference.set(create(collection, id), { id, collection, docs: [], catalogRecord: null, duaRecord: record });
      } else if (matches.length > 1) {
        for (const [reference, entry] of byReference) {
          if (entry.id === id && entry.duaRecord) byReference.delete(reference);
        }
      }
    });
    (Array.isArray(docs) ? docs : []).forEach((doc) => {
      (Array.isArray(doc.azkarIds) ? doc.azkarIds : []).map(String).filter(Boolean).forEach((id) => {
        let collection = "azkar";
        let record = catalogById.get(id) || null;
        if (!record) {
          const matchingDuas = duasById.get(id) || [];
          if (matchingDuas.length === 1) {
            record = matchingDuas[0];
            collection = collectionOf(record, "dua");
          }
        }
        const reference = create(collection, id);
        if (!byReference.has(reference)) {
          byReference.set(reference, { id, collection, docs: [], catalogRecord: collection === "azkar" ? record : null, duaRecord: collection.startsWith("dua-") ? record : null });
        }
        byReference.get(reference).docs.push(doc);
      });
    });
    return [...byReference.values()].sort((left, right) => left.id.localeCompare(right.id, "ru") || left.collection.localeCompare(right.collection));
  }

  window.AdminV2RecordIdentity = Object.freeze({ create, parse, matches, find, tag, collectionOf, buildAzkarLinks });
})();
