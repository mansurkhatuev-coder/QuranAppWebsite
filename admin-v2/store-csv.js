(() => {
  "use strict";

  function delimiterFor(line) {
    const counts = [",", ";", "\t"].map((delimiter) => [delimiter, (line.match(new RegExp(delimiter === "\t" ? "\\t" : `\\${delimiter}`, "g")) || []).length]);
    return counts.sort((left, right) => right[1] - left[1])[0][1] ? counts.sort((left, right) => right[1] - left[1])[0][0] : ",";
  }

  function parseLine(line, delimiter) {
    const cells = [];
    let value = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === delimiter && !quoted) { cells.push(value.trim()); value = ""; }
      else value += char;
    }
    cells.push(value.trim());
    return cells;
  }

  function parseDay(raw) {
    const value = String(raw || "").trim();
    let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (match) {
      const [year, month, day] = match.slice(1).map(Number);
      if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
    match = /^(\d{4})-(\d{2})$/.exec(value);
    if (!match) {
      const monthYear = /^(\d{1,2})[./-](\d{4})$/.exec(value);
      if (monthYear) match = [value, monthYear[2], monthYear[1]];
    }
    if (match) {
      const year = Number(match[1].length === 4 ? match[1] : match[2]);
      const month = Number(match[1].length === 4 ? match[2] : match[1]);
      if (month < 1 || month > 12) return null;
      return `${year}-${String(month).padStart(2, "0")}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;
    }
    match = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(value);
    if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
    return null;
  }

  function headerKind(value) {
    const header = String(value || "").replace(/^\uFEFF/, "").trim().toLowerCase();
    if (!header) return "other";
    if (/^timeperiod$|^time[_\s-]*period$|^period$/.test(header) || /^(date|дата|day|день)$/.test(header) || /период|дата начала/.test(header)) return "date";
    if (/download type|тип.*скач|тип.*загруз/.test(header) || header === "type") return "type";
    if (/обнов|upgrade|update/.test(header)) return "updates";
    if (/uninstall|удален/.test(header)) return "uninstalls";
    if (/current user installs/.test(header)) return "current";
    if (/installs on active devices/.test(header)) return "active";
    if (/^всего$|^total$|^итого$|установ|install|скач|download|загруз/.test(header)) return "downloads";
    if (/^count$|количество|^кол-?во/.test(header)) return "counts";
    if (/^country$|страна/.test(header)) return "country";
    return "other";
  }

  function parseCount(raw) {
    const value = Number(String(raw || "").replace(/[\s\u00a0,]/g, ""));
    return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  }

  function parseRuStore(input) {
    const text = String(input || "").replace(/^\uFEFF/, "").trim();
    if (!text) return { ok: false, reason: "Файл пустой." };
    const lines = text.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.trim());
    if (lines.length < 2) return { ok: false, reason: "В файле мало строк." };
    let header = null;
    for (let index = 0; index < Math.min(lines.length, 25); index += 1) {
      const delimiter = delimiterFor(lines[index]);
      const kinds = parseLine(lines[index], delimiter).map(headerKind);
      if (kinds.includes("date") && (kinds.includes("downloads") || kinds.includes("counts"))) { header = { index, delimiter, kinds }; break; }
    }
    if (!header) return { ok: false, reason: "Нет колонок «Период» и «Всего». Экспортируйте статистику RuStore в CSV." };
    const dayIndex = header.kinds.indexOf("date");
    let downloadIndex = header.kinds.indexOf("downloads");
    if (downloadIndex < 0) downloadIndex = header.kinds.indexOf("counts");
    const updateIndex = header.kinds.indexOf("updates");
    const typeIndex = header.kinds.indexOf("type");
    const merged = new Map();
    for (const line of lines.slice(header.index + 1)) {
      const cells = parseLine(line, header.delimiter);
      const day = parseDay(cells[dayIndex]);
      if (!day || /^(всего|total|итого)$/i.test(cells[dayIndex] || "")) continue;
      if (typeIndex >= 0 && /обнов|update|redownload/i.test(cells[typeIndex] || "")) continue;
      const row = merged.get(day) || { day, downloads: 0, updates: 0 };
      row.downloads += parseCount(cells[downloadIndex]);
      if (updateIndex >= 0) row.updates += parseCount(cells[updateIndex]);
      merged.set(day, row);
    }
    const rows = [...merged.values()].sort((left, right) => left.day.localeCompare(right.day));
    if (!rows.length) return { ok: false, reason: "Даты в CSV не распознаны." };
    return { ok: true, rows, total: rows.reduce((sum, row) => sum + row.downloads, 0), lastDay: rows.at(-1).day };
  }

  function parseGooglePlay(input) {
    const text = String(input || "").replace(/^\uFEFF/, "").trim();
    if (!text) return { ok: false, reason: "Файл пустой." };
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    const rows = lines.map((line) => parseLine(line, ","));
    if (rows.length < 2) return { ok: false, reason: "В файле нет строк с данными." };
    const headers = rows[0].map((value) => value.replace(/^\uFEFF/, "").trim().toLowerCase());
    const index = (...names) => names.map((name) => headers.indexOf(name.toLowerCase())).find((column) => column >= 0) ?? -1;
    const dateIndex = index("date", "дата");
    const downloadsIndex = index("daily user installs", "daily user installations", "ежедневные установки пользователей");
    if (dateIndex < 0 || downloadsIndex < 0) return { ok: false, reason: "Нужны колонки Date и Daily User Installs из отчёта Google Play." };
    const uninstallsIndex = index("daily user uninstalls", "ежедневные удаления пользователей");
    const updatesIndex = index("daily device upgrades", "daily device updates", "ежедневные обновления устройств");
    const currentIndex = index("current user installs", "current user installations", "текущие установки пользователей");
    const activeIndex = index("installs on active devices", "installations on active devices", "установки на активных устройствах");
    const countryIndex = index("country", "страна");
    const merged = new Map();
    for (const cells of rows.slice(1)) {
      const day = parseDay(cells[dateIndex]);
      if (!day) continue;
      const country = countryIndex >= 0 ? String(cells[countryIndex] || "").trim().toLowerCase() : "";
      if (["total", "all countries", "all countries/regions"].includes(country)) continue;
      const row = merged.get(day) || {
        day, downloads: 0, updates: 0, uninstalls: 0,
        currentUserInstalls: currentIndex >= 0 ? 0 : null,
        activeDeviceInstalls: activeIndex >= 0 ? 0 : null,
      };
      row.downloads += parseCount(cells[downloadsIndex]);
      if (updatesIndex >= 0) row.updates += parseCount(cells[updatesIndex]);
      if (uninstallsIndex >= 0) row.uninstalls += parseCount(cells[uninstallsIndex]);
      if (currentIndex >= 0) row.currentUserInstalls += parseCount(cells[currentIndex]);
      if (activeIndex >= 0) row.activeDeviceInstalls += parseCount(cells[activeIndex]);
      merged.set(day, row);
    }
    const resultRows = [...merged.values()].sort((left, right) => left.day.localeCompare(right.day));
    if (!resultRows.length) return { ok: false, reason: "В CSV нет распознаваемых дневных установок Google Play." };
    return { ok: true, rows: resultRows, total: resultRows.reduce((sum, row) => sum + row.downloads, 0), lastDay: resultRows.at(-1).day };
  }

  function mergeRows(existingRows, importedRows) {
    const merged = new Map();
    for (const row of Array.isArray(existingRows) ? existingRows : []) {
      if (row?.day) merged.set(String(row.day), row);
    }
    for (const row of Array.isArray(importedRows) ? importedRows : []) {
      if (!row?.day) continue;
      const key = String(row.day);
      merged.set(key, merged.has(key) ? { ...merged.get(key), ...row } : row);
    }
    return [...merged.values()].sort((left, right) => String(left.day).localeCompare(String(right.day)));
  }

  function sumDownloads(rows) {
    return (Array.isArray(rows) ? rows : []).reduce((sum, row) => sum + (Number(row.downloads) || 0), 0);
  }

  function readSnapshot(storage, key) {
    try {
      const value = JSON.parse(storage.getItem(key) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }

  function mergeSnapshot(remoteSnapshot, localSnapshot) {
    const combined = { ...(remoteSnapshot && typeof remoteSnapshot === 'object' ? remoteSnapshot : {}) };
    for (const platform of ['rustore', 'googleplay']) {
      const local = localSnapshot?.[platform];
      if (!Array.isArray(local?.rows) || !local.rows.length) continue;
      const rows = mergeRows(combined[platform]?.rows, local.rows);
      combined[platform] = {
        ...(combined[platform] || {}),
        ...local,
        rows,
        days: rows.length,
        total: sumDownloads(rows),
        lastDay: rows.at(-1)?.day || local.lastDay || '',
        localCsvRows: local.rows.length,
        localCsvLastDay: local.lastDay || local.rows.at(-1)?.day || '',
      };
    }
    return combined;
  }

  function saveImport(storage, key, platform, importedRows, fetchedAt = new Date().toISOString()) {
    const current = readSnapshot(storage, key);
    const rows = mergeRows(current[platform]?.rows, importedRows);
    const entry = {
      rows,
      days: rows.length,
      total: sumDownloads(rows),
      lastDay: rows.at(-1)?.day || '',
      status: 'local_csv',
      local: true,
      fetchedAt,
    };
    try {
      storage.setItem(key, JSON.stringify({ ...current, [platform]: entry }));
    } catch {
      throw new Error('Не удалось сохранить CSV в этом браузере. Проверьте свободное место или уменьшите файл.');
    }
    return entry;
  }

  window.AdminV2StoreCsv = Object.freeze({ parseRuStore, parseGooglePlay, mergeRows, readSnapshot, mergeSnapshot, saveImport });
})();
