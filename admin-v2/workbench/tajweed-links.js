(() => {
  "use strict";

  function mergeDocuments(sourceDocs, localDocs) {
    const merged = new Map();
    for (const doc of Array.isArray(sourceDocs) ? sourceDocs : []) {
      const id = String(doc?.id || "");
      if (id) merged.set(id, doc);
    }
    for (const doc of Array.isArray(localDocs) ? localDocs : []) {
      const id = String(doc?.id || "");
      if (!id) continue;
      merged.set(id, merged.has(id) ? { ...merged.get(id), ...doc } : doc);
    }
    return [...merged.values()];
  }

  function findRelated(kind, item, documents, reference = "") {
    if (!item) return null;
    if (kind === "tajweed") return item;
    const available = Array.isArray(documents) ? documents : [];
    const wantedReference = String(reference || "");
    if (wantedReference) {
      const exact = available.find((doc) => String(doc?.sourceRecordId || "") === wantedReference);
      if (exact) return exact;
    }
    if (kind === "materials") {
      return available.find((doc) => String(doc?.sourceMaterialId || "") === String(item.id || "")) || null;
    }
    const id = String(item.id || "");
    return id
      ? available.find((doc) => (Array.isArray(doc?.azkarIds) ? doc.azkarIds : []).some((linkedId) => String(linkedId) === id)) || null
      : null;
  }

  function createDraft({ kind, item, reference, documents = [] }) {
    if (!item || !item.id) throw new Error("Для таджвид-разметки нужен материал со стабильным ID.");
    const existing = findRelated(kind, item, documents, reference);
    if (existing) return existing;
    const source = item.catalogRecord || item.duaRecord || item;
    let identityParts = [kind, String(item.id)];
    try {
      const parsed = JSON.parse(String(reference || ""));
      if (Array.isArray(parsed) && parsed.length === 2) identityParts = parsed.map(String);
    } catch {
      // Keep a readable kind + ID when the reference uses a non-JSON format.
    }
    const base = identityParts.join("-").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    const usedIds = new Set((Array.isArray(documents) ? documents : []).map((doc) => String(doc?.id || "")));
    let id = `admin-v2-${base || String(item.id).replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
    let suffix = 2;
    while (usedIds.has(id)) id = `admin-v2-${base || "document"}-${suffix++}`;
    const doc = {
      version: 2,
      id,
      title: String(item.title || item.navTitle || source.title || source.navTitle || item.id),
      azkarIds: kind === "materials" ? [] : [String(item.id)],
      arabic: String(source.arabic || source.text || item.arabic || item.text || ""),
      transliteration: String(source.transliteration || source.translit || item.transliteration || item.translit || ""),
      marks: [],
      sourceRecordId: String(reference || `${kind}:${item.id}`),
    };
    if (kind === "materials") doc.sourceMaterialId = String(item.id);
    return doc;
  }

  window.AdminV2TajweedLinks = Object.freeze({ mergeDocuments, findRelated, createDraft });
})();
