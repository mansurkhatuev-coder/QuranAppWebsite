(() => {
  "use strict";

  const STORES = [
    { key: "rustore", rowKey: "rustore" },
    { key: "apple", rowKey: "appstore" },
    { key: "googleplay", rowKey: "googleplay" },
  ];
  const PAGE_SIZE = 1000;
  const MAX_ROWS = 100000;

  function normalizeDay(row) {
    return {
      day: String(row.day || ""),
      downloads: Number(row.downloads) || 0,
      updates: Number(row.updates) || 0,
      uninstalls: Number(row.uninstalls) || 0,
      currentUserInstalls: row.current_user_installs == null ? null : Number(row.current_user_installs) || 0,
      activeDeviceInstalls: row.active_device_installs == null ? null : Number(row.active_device_installs) || 0,
    };
  }

  function summarize(rows, payload = {}) {
    const ordered = [...rows].sort((a, b) => a.day.localeCompare(b.day));
    const latest = [...ordered].reverse().find((row) => row.currentUserInstalls != null || row.activeDeviceInstalls != null);
    return {
      rows: ordered,
      days: ordered.length,
      total: ordered.reduce((sum, row) => sum + row.downloads, 0),
      firstDay: ordered[0]?.day || null,
      lastDay: ordered.at(-1)?.day || null,
      status: String(payload.status || (ordered.length ? "ok" : "empty")),
      message: String(payload.message || ""),
      fetchedAt: payload.fetchedAt || null,
      requestedAt: payload.requestedAt || null,
      currentUserInstalls: latest?.currentUserInstalls ?? null,
      activeDeviceInstalls: latest?.activeDeviceInstalls ?? null,
    };
  }

  function createSnapshot(dayRows, metadataRows, coverage = {}) {
    const daysByStore = new Map(STORES.map((store) => [store.rowKey, []]));
    for (const row of Array.isArray(dayRows) ? dayRows : []) {
      const storeRows = daysByStore.get(String(row.store || ""));
      if (storeRows) storeRows.push(normalizeDay(row));
    }
    const metadataByKey = new Map(
      (Array.isArray(metadataRows) ? metadataRows : []).map((row) => [String(row.key || ""), row.payload || {}]),
    );
    return {
      ok: true,
      coverage: {
        complete: coverage.complete !== false,
        expectedRows: Object.prototype.hasOwnProperty.call(coverage, "expectedRows")
          ? (Number.isFinite(coverage.expectedRows) ? coverage.expectedRows : null)
          : (Array.isArray(dayRows) ? dayRows.length : 0),
        loadedRows: Number.isFinite(coverage.loadedRows) ? coverage.loadedRows : (Array.isArray(dayRows) ? dayRows.length : 0),
        message: String(coverage.message || ""),
      },
      rustore: summarize(daysByStore.get("rustore"), metadataByKey.get("rustore")),
      apple: summarize(daysByStore.get("appstore"), metadataByKey.get("apple")),
      googleplay: summarize(daysByStore.get("googleplay"), metadataByKey.get("googleplay")),
    };
  }

  async function loadDayRows(client) {
    const rows = [];
    let expectedRows = null;
    let stoppedEarly = false;

    while (rows.length < MAX_ROWS) {
      const start = rows.length;
      const result = await client
        .from("store_download_days")
        .select("store,day,downloads,updates,uninstalls,current_user_installs,active_device_installs", { count: "exact" })
        .order("day", { ascending: true })
        .order("store", { ascending: true })
        .range(start, Math.min(start + PAGE_SIZE - 1, MAX_ROWS - 1));
      if (result.error) throw result.error;
      if (Number.isFinite(result.count)) expectedRows = result.count;
      const page = Array.isArray(result.data) ? result.data : [];
      rows.push(...page);

      if (expectedRows != null && rows.length >= expectedRows) break;
      if (!page.length) {
        if (expectedRows == null || rows.length < expectedRows) stoppedEarly = true;
        break;
      }
      if (expectedRows == null && page.length < PAGE_SIZE) {
        stoppedEarly = true;
        break;
      }
    }

    const complete = expectedRows != null && rows.length >= expectedRows && rows.length <= MAX_ROWS && !stoppedEarly;
    return {
      rows,
      coverage: {
        complete,
        expectedRows,
        loadedRows: rows.length,
        message: complete ? "" : "Загружена часть истории статистики магазинов.",
      },
    };
  }

  async function load(client) {
    if (!client || typeof client.from !== "function") throw new Error("Нужен вход в Supabase для чтения статистики магазинов.");
    const [days, metadataResult] = await Promise.all([
      loadDayRows(client),
      client
        .from("store_download_meta")
        .select("key,payload")
        .limit(50),
    ]);
    if (metadataResult.error) throw metadataResult.error;
    return createSnapshot(days.rows, metadataResult.data, days.coverage);
  }

  window.AdminV2StoreDownloadsReadOnly = Object.freeze({ load, createSnapshot });
})();
