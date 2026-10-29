(function attachProductionContent(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AdminV2ProductionContent = Object.freeze(api);
})(typeof globalThis === "object" ? globalThis : this, function createProductionContent() {
  "use strict";

  const PACKS = Object.freeze({
    support_dua: "/data/support-dua.json",
    general_dua: "/data/general-dua.json",
  });

  function nextVersion(value) {
    return Number.isSafeInteger(value) && value >= 0 ? value + 1 : 1;
  }

  function buildDuaPublication(records, currentManifest, publishedAt = new Date().toISOString()) {
    if (!Array.isArray(records)) throw new TypeError("Каталог дуа должен быть списком.");
    const ids = new Set();
    const supportDua = [];
    const generalDua = [];

    for (const record of records) {
      const id = String(record?.id || "").trim();
      const category = String(record?.category || "");
      if (!id) throw new Error("У каждой записи должен быть сохранённый ID.");
      if (ids.has(id)) throw new Error(`Повторяется ID «${id}». Публикация остановлена.`);
      ids.add(id);
      if (!Object.hasOwn(PACKS, category)) throw new Error(`Неизвестный тип записи «${category}».`);
      if (!String(record?.text || "").trim()) throw new Error(`Заполните арабский текст: ${record.title || id}.`);
      (category === "support_dua" ? supportDua : generalDua).push(record);
    }

    const current = currentManifest && typeof currentManifest === "object" ? currentManifest : {};
    const currentPacks = current.packs && typeof current.packs === "object" ? current.packs : {};
    return {
      supportDua,
      generalDua,
      manifest: {
        version: nextVersion(current.version),
        publishedAt: new Date(publishedAt).toISOString(),
        packs: Object.fromEntries(Object.entries(PACKS).map(([category, url]) => [category, {
          version: nextVersion(currentPacks[category]?.version),
          url,
          itemCount: category === "support_dua" ? supportDua.length : generalDua.length,
        }])),
      },
    };
  }

  return { buildDuaPublication };
});
