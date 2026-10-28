(() => {
  "use strict";

  function select(docs, requestedId, currentId = "") {
    const available = Array.isArray(docs) ? docs : [];
    const requested = String(requestedId || "");
    if (requested && available.some((doc) => String(doc?.id) === requested)) return requested;
    if (requested) return "";
    const current = String(currentId || "");
    if (current && available.some((doc) => String(doc?.id) === current)) return current;
    return String(available.find((doc) => doc?.id)?.id || "");
  }

  function mergeSourceDocument(library, sourceDocument, localDocumentIds = []) {
    const id = String(sourceDocument?.id || "");
    if (!id) throw new Error("A Tajweed source document needs a stable ID.");
    const documents = Array.isArray(library?.docs) ? library.docs : [];
    const index = documents.findIndex((doc) => String(doc?.id || "") === id);
    const localDocument = index >= 0 ? documents[index] : null;
    const hasLocalDraft = (Array.isArray(localDocumentIds) ? localDocumentIds : []).map(String).includes(id);
    const merged = hasLocalDraft && localDocument
      ? { ...sourceDocument, ...localDocument }
      : { ...sourceDocument };
    const nextDocs = documents.slice();
    if (index >= 0) nextDocs[index] = merged;
    else nextDocs.push(merged);
    return { ...library, version: library?.version || 2, activeId: id, docs: nextDocs };
  }

  function addLocalDraftId(documentIds, documentId) {
    const id = String(documentId || "");
    return id ? [...new Set([...(Array.isArray(documentIds) ? documentIds : []).map(String), id])] : [...(Array.isArray(documentIds) ? documentIds : []).map(String)];
  }

  window.AdminV2PreviewSelection = Object.freeze({ select, mergeSourceDocument, addLocalDraftId });
})();
