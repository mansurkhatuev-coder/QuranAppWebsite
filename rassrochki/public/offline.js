(() => {
  "use strict";

  const DB_NAME = "rassrochki-offline-v1";
  const ACTIVE_ACCOUNT_KEY = "rassrochki:offline-account";
  const app = { snapshot: null, baseSnapshot: null, operations: [], account: null, view: "dashboard", loanId: null, form: null, syncError: null };
  const content = document.getElementById("content");
  const syncInfo = document.getElementById("sync-info");
  const syncState = document.getElementById("sync-state");
  const syncDetail = document.getElementById("sync-detail");
  const syncPending = document.getElementById("sync-pending");
  const syncConflicts = document.getElementById("sync-conflicts");
  const syncErrorDetails = document.getElementById("sync-error-details");
  const syncErrorText = document.getElementById("sync-error-text");
  const orgName = document.getElementById("org-name");
  const networkState = document.getElementById("network-state");
  const onlineAction = document.getElementById("online-action");

  function text(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);
  }

  function money(value) {
    const currency = app.snapshot?.settings?.currency || "RUB";
    try {
      return new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(Number(value) || 0);
    } catch {
      return `${Math.round(Number(value) || 0).toLocaleString("ru-RU")} ${currency}`;
    }
  }

  function date(value) {
    if (!value) return "—";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? text(value) : parsed.toLocaleDateString("ru-RU");
  }

  function relatedName(value) {
    if (Array.isArray(value)) return value[0]?.full_name || value[0]?.name || "";
    return value?.full_name || value?.name || "";
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("snapshots")) {
          const snapshots = db.createObjectStore("snapshots", {
            keyPath: ["userId", "organizationId"],
          });
          snapshots.createIndex("byAccount", ["userId", "organizationId"], { unique: true });
        }
        if (!db.objectStoreNames.contains("operations")) {
          const operations = db.createObjectStore("operations", { keyPath: "id" });
          operations.createIndex("byAccount", ["userId", "organizationId"]);
          operations.createIndex("byCreatedAt", "createdAt");
        }
        if (!db.objectStoreNames.contains("receiptFiles")) {
          const receipts = db.createObjectStore("receiptFiles", { keyPath: "operationId" });
          receipts.createIndex("byAccount", ["userId", "organizationId"]);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Не удалось открыть локальную базу"));
    });
  }

  function requestValue(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Не удалось прочитать локальные данные"));
    });
  }

  async function loadAccount() {
    let account;
    try {
      account = JSON.parse(localStorage.getItem(ACTIVE_ACCOUNT_KEY) || "null");
    } catch {
      account = null;
    }
    if (!account?.userId || !account?.organizationId) {
      throw new Error("Сначала войдите в приложение с интернетом, чтобы загрузить данные на это устройство.");
    }

    const db = await openDatabase();
    try {
      const tx = db.transaction(["snapshots", "operations"], "readonly");
      const snapshotRequest = tx.objectStore("snapshots").get([account.userId, account.organizationId]);
      const operationsRequest = tx
        .objectStore("operations")
        .index("byAccount")
        .getAll([account.userId, account.organizationId]);
      const [snapshot, operations] = await Promise.all([
        requestValue(snapshotRequest),
        requestValue(operationsRequest),
      ]);
      return { snapshot, operations, account, db };
    } catch (error) {
      db.close();
      throw error;
    }
  }

  function transactionComplete(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error("Не удалось сохранить локальные данные"));
      transaction.onerror = () => reject(transaction.error || new Error("Не удалось сохранить локальные данные"));
    });
  }

  async function enqueue(command, dependsOn = [], receiptFile = null) {
    const operation = {
      id: crypto.randomUUID(),
      userId: app.account.userId,
      organizationId: app.account.organizationId,
      createdAt: new Date().toISOString(),
      dependsOn,
      command,
      state: "pending",
      attempts: 0,
      lastError: null,
    };
    const db = await openDatabase();
    const names = receiptFile ? ["operations", "receiptFiles"] : ["operations"];
    const tx = db.transaction(names, "readwrite");
    const done = transactionComplete(tx);
    tx.objectStore("operations").add(operation);
    if (receiptFile) {
      tx.objectStore("receiptFiles").put({
        operationId: operation.id,
        userId: app.account.userId,
        organizationId: app.account.organizationId,
        blob: receiptFile,
        fileName: receiptFile.name || "receipt.jpg",
        mimeType: receiptFile.type || "image/jpeg",
      });
    }
    await done;
    db.close();
    window.dispatchEvent(new Event("rassrochki:offline-queue-changed"));
    await refreshLocalData();
    return operation;
  }

  function projectPendingOperations() {
    const snapshot = structuredClone(app.baseSnapshot);
    for (const operation of orderQueuedOperations(app.operations)) {
      const payload = operation.command?.payload || {};
      if (operation.userId !== snapshot.userId || operation.organizationId !== snapshot.organizationId) continue;
      switch (operation.command.type) {
        case "client.create": {
          const client = payload.client;
          if (client?.id && !snapshot.clients.some((item) => item.id === client.id)) snapshot.clients.push(client);
          break;
        }
        case "client.blacklist":
          snapshot.clients = snapshot.clients.map((client) => client.id === payload.clientId
            ? { ...client, is_blacklisted: Boolean(payload.isBlacklisted), blacklist_note: payload.blacklistNote || null, offline_version: Number(client.offline_version || 1) + 1 }
            : client);
          break;
        case "client.delete":
          if (!snapshot.loans.some((loan) => loan.client_id === payload.clientId)) {
            snapshot.clients = snapshot.clients.filter((client) => client.id !== payload.clientId);
          }
          break;
        case "loan.create":
        case "loan.edit": {
          const loan = payload.loan;
          if (!loan?.id) break;
          const current = snapshot.loans.find((item) => item.id === loan.id);
          const projectedLoan = { ...loan, offline_version: current ? Number(current.offline_version || 1) + (operation.command.type === "loan.edit" ? 1 : 0) : Number(loan.offline_version || 1) };
          const index = snapshot.loans.findIndex((item) => item.id === loan.id);
          if (index < 0) snapshot.loans.push(projectedLoan); else snapshot.loans[index] = projectedLoan;
          if (Array.isArray(payload.projectedSchedules)) snapshot.schedules = [...snapshot.schedules.filter((row) => row.loan_id !== loan.id), ...payload.projectedSchedules];
          else if (Array.isArray(payload.schedules)) snapshot.schedules = [...snapshot.schedules.filter((row) => row.loan_id !== loan.id), ...payload.schedules];
          if (Array.isArray(payload.guarantors)) snapshot.guarantors = [...snapshot.guarantors.filter((item) => item.loan_id !== loan.id), ...payload.guarantors];
          break;
        }
        case "payment.record": {
          const payment = payload.payment;
          if (!payment?.id || snapshot.payments.some((row) => row.idempotency_key === operation.id)) break;
          snapshot.payments.push({ ...payment, idempotency_key: operation.id });
          let remaining = Number(payment.amount);
          const rows = snapshot.schedules.filter((row) => row.loan_id === payment.loan_id).sort((a, b) => a.sequence_number - b.sequence_number);
          const start = rows.findIndex((row) => row.id === (payload.scheduleId || payment.schedule_id));
          for (const row of rows.slice(Math.max(0, start))) {
            if (remaining <= 0.009) break;
            const paid = Math.max(Number(row.paid_amount || 0), row.status === "paid" ? Number(row.amount) : 0);
            const due = Math.max(0, Math.round((Number(row.amount) - paid) * 100) / 100);
            const applied = Math.min(remaining, due);
            const totalPaid = Math.round((paid + applied) * 100) / 100;
            remaining = Math.round((remaining - applied) * 100) / 100;
            snapshot.schedules = snapshot.schedules.map((item) => item.id === row.id ? { ...item, paid_amount: totalPaid, paid_at: payment.paid_at, status: totalPaid + 0.009 >= Number(item.amount) ? "paid" : item.status } : item);
          }
          snapshot.loans = snapshot.loans.map((loan) => loan.id === payment.loan_id ? { ...loan, offline_version: Number(loan.offline_version || 1) + 1 } : loan);
          break;
        }
        case "loan.delete": {
          const loanId = payload.loanId;
          snapshot.loans = snapshot.loans.filter((loan) => loan.id !== loanId);
          snapshot.schedules = snapshot.schedules.filter((row) => row.loan_id !== loanId);
          snapshot.payments = snapshot.payments.filter((row) => row.loan_id !== loanId);
          snapshot.guarantors = snapshot.guarantors.filter((row) => row.loan_id !== loanId);
          break;
        }
      }
    }
    return snapshot;
  }

  function updateSyncInfo() {
    if (!app.baseSnapshot) return;
    const pending = app.operations.filter((item) => item.state !== "conflict").length;
    const conflicts = app.operations.filter((item) => item.state === "conflict").length;
    const lastError = app.operations.find((item) => item.state !== "conflict" && item.lastError)?.lastError;
    const errorDetail = String(lastError || app.syncError || "");
    const hasError = Boolean(errorDetail);
    const hasChanges = pending > 0 || conflicts > 0;
    const status = !navigator.onLine
      ? "Нет сети · данные на устройстве"
      : hasError
        ? "Синхронизация не завершена"
        : conflicts > 0
          ? "Нужно проверить изменения"
          : pending > 0
            ? "Изменения ждут отправки"
            : "Копия сохранена на устройстве";
    const tone = !navigator.onLine || hasError ? "offline" : hasChanges ? "pending" : "online";
    syncState.textContent = status;
    syncState.className = `badge ${tone}`;
    syncDetail.textContent = `Копия ${new Date(app.baseSnapshot.syncedAt).toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
    syncPending.hidden = pending === 0;
    syncPending.textContent = pending > 0 ? `Ждут отправки: ${pending}` : "";
    syncConflicts.hidden = conflicts === 0;
    syncConflicts.textContent = conflicts > 0 ? `Нужно проверить: ${conflicts}` : "";
    setSyncErrorDetail(errorDetail);
    syncInfo.classList.toggle("warning", !navigator.onLine || hasError || conflicts > 0);
  }

  function setSyncErrorDetail(detail) {
    syncErrorText.textContent = detail;
    syncErrorDetails.hidden = !detail;
    if (!detail) syncErrorDetails.open = false;
  }

  function showSyncMessage(label, detail = "", warning = true) {
    syncState.textContent = label;
    syncState.className = `badge ${warning ? "offline" : "online"}`;
    syncDetail.textContent = detail;
    syncPending.hidden = true;
    syncPending.textContent = "";
    syncConflicts.hidden = true;
    syncConflicts.textContent = "";
    setSyncErrorDetail(warning ? detail : "");
    syncInfo.classList.toggle("warning", warning);
  }

  async function refreshLocalData() {
    const { snapshot, operations, account, db } = await loadAccount();
    db.close();
    if (!snapshot) throw new Error("Нет сохранённых данных. Подключитесь к интернету, чтобы загрузить копию.");
    app.baseSnapshot = snapshot;
    app.account = account;
    app.operations = operations || [];
    app.snapshot = projectPendingOperations();
    updateSyncInfo();
    render();
  }

  function switchView(view) {
    app.view = view;
    app.loanId = null;
    app.form = null;
    render();
  }

  function renderDashboard() {
    const snapshot = app.snapshot;
    const activeLoans = snapshot.loans.filter((loan) => loan.status !== "closed").length;
    const paid = snapshot.payments.reduce((total, payment) => total + Number(payment.amount || 0), 0);
    const overdue = snapshot.schedules.filter((schedule) => schedule.status === "overdue").length;
    return `
      <div class="grid">
        <article class="card"><div class="muted">Клиенты</div><div class="stat">${snapshot.clients.length}</div></article>
        <article class="card"><div class="muted">Активные рассрочки</div><div class="stat">${activeLoans}</div></article>
        <article class="card"><div class="muted">Получено оплат</div><div class="stat">${text(money(paid))}</div></article>
        <article class="card"><div class="muted">Просроченные платежи</div><div class="stat">${overdue}</div></article>
      </div>
      <article class="card"><h2>Ближайшие платежи</h2>${renderUpcoming()}</article>
    `;
  }

  function renderUpcoming() {
    const rows = app.snapshot.schedules
      .filter((row) => row.status !== "paid")
      .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
      .slice(0, 8);
    if (!rows.length) return '<p class="muted">Нет неоплаченных платежей в сохранённой копии.</p>';
    return `<div class="list">${rows.map((row) => {
      const loan = app.snapshot.loans.find((item) => item.id === row.loan_id);
      return `<div class="row"><div><strong>${text(relatedName(loan?.clients) || loan?.title || "Рассрочка")}</strong><div class="muted">${date(row.due_date)} · платёж #${text(row.sequence_number)}</div></div><strong>${text(money(row.amount))}</strong></div>`;
    }).join("")}</div>`;
  }

  function renderClients() {
    const rows = [...app.snapshot.clients].sort((a, b) => a.full_name.localeCompare(b.full_name, "ru"));
    return `<article class="card"><div class="row"><h2>Клиенты (${rows.length})</h2><button type="button" class="primary" data-action="new-client">+ Новый клиент</button></div>${rows.length ? `<div class="list">${rows.map((client) => `
      <div class="row">
        <div><strong>${text(client.full_name)}</strong><div class="muted">${text(client.phone || "Телефон не указан")}</div>${client.notes ? `<div class="muted">${text(client.notes)}</div>` : ""}</div>
        <div class="actions"><span class="badge ${client.is_blacklisted ? "offline" : "online"}">${client.is_blacklisted ? "Чёрный список" : "Активен"}</span>${app.operations.some((item) => item.command?.payload?.client?.id === client.id || item.command?.payload?.clientId === client.id) ? '<span class="badge pending">Не синхр.</span>' : ""}
          <button type="button" data-action="toggle-blacklist" data-client="${text(client.id)}">${client.is_blacklisted ? "Убрать из списка" : "В чёрный список"}</button>
          ${app.snapshot.loans.some((loan) => loan.client_id === client.id) ? "" : `<button type="button" class="danger-button" data-action="delete-client" data-client="${text(client.id)}">Удалить</button>`}
        </div>
      </div>`).join("")}</div>` : '<p class="muted">Клиентов пока нет. Их можно добавить без интернета.</p>'}</article>`;
  }

  function renderLoans() {
    const allRows = [...app.snapshot.loans].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const filters = [["all", "Все"], ["overdue", "Просрочено"], ["soon", "Скоро срок · 7 дней"], ["normal", "В срок"]];
    const visible = allRows.filter((loan) => {
      const summary = debtSummary(loan);
      return app.loanFilter === "all" ||
        (app.loanFilter === "overdue" && summary.overdue > 0) ||
        (app.loanFilter === "soon" && summary.overdue === 0 && summary.soon > 0) ||
        (app.loanFilter === "normal" && summary.remaining > 0 && summary.overdue === 0 && summary.soon === 0);
    });
    const filterButtons = filters.map(([key, label]) =>
      '<button type="button" data-loan-filter="' + key + '"' +
      (app.loanFilter === key ? ' class="primary"' : "") + '>' + label + "</button>"
    ).join("");
    const loanRows = visible.map((loan) => {
      const summary = debtSummary(loan);
      const tone = summary.overdue > 0 ? "overdue" : summary.soon > 0 ? "soon" : summary.remaining > 0 ? "normal" : "";
      const indicator = summary.overdue > 0
        ? "Просрочено · " + text(money(summary.overdue))
        : summary.soon > 0
          ? "Скоро срок · " + date(summary.nextDue)
          : summary.remaining > 0 ? "В срок · остаток " + text(money(summary.remaining)) : "Оплат к внесению нет";
      return '<div class="row tone-' + tone + '">' +
        '<div><strong>' + text(relatedName(loan.clients) || loan.title || "Рассрочка") + "</strong>" +
        '<div class="muted">' + text(loan.title || "Товар не указан") + " · " + date(loan.start_date) + "</div>" +
        '<div class="muted">' + text(money(loan.principal)) + " · " + (loan.status === "closed" ? "Закрыта" : "Активна") +
        (pendingForLoan(loan.id).length ? ' · <span class="badge pending">Ожидает отправки</span>' : "") + "</div>" +
        '<div class="muted">' + indicator + "</div></div>" +
        '<div class="actions"><button type="button" data-loan="' + text(loan.id) + '">Открыть</button>' +
        '<button type="button" data-action="edit-loan" data-loan-id="' + text(loan.id) + '">Изменить</button></div></div>';
    }).join("");
    return '<article class="card"><div class="row"><h2>Рассрочки (' + visible.length + ")</h2>" +
      '<button type="button" class="primary" data-action="new-loan">+ Новая рассрочка</button></div>' +
      '<div class="actions" style="justify-content:flex-start;margin:10px 0">' + filterButtons + "</div>" +
      '<div class="actions" style="justify-content:flex-start;margin:10px 0">' +
      '<button type="button" data-action="export-overdue-csv">Выгрузить просрочивших · CSV</button>' +
      '<button type="button" data-action="export-loans-csv">Выгрузить все рассрочки · CSV</button></div>' +
      (visible.length ? '<div class="list">' + loanRows + "</div>" : '<p class="muted">По выбранному фильтру рассрочек нет.</p>') +
      "</article>";
  }

  function debtSummary(loan) {
    const today = dateKey(new Date());
    const grace = Math.max(0, Number(app.snapshot.settings?.overdue_days || 0));
    const cutoffDate = new Date();
    cutoffDate.setHours(0, 0, 0, 0);
    cutoffDate.setDate(cutoffDate.getDate() - grace);
    const soonDate = new Date();
    soonDate.setHours(0, 0, 0, 0);
    soonDate.setDate(soonDate.getDate() + 7);
    const cutoff = dateKey(cutoffDate);
    const soonThrough = dateKey(soonDate);
    let remaining = 0;
    let overdue = 0;
    let soon = 0;
    const dates = [];
    for (const row of app.snapshot.schedules.filter((item) => item.loan_id === loan.id)) {
      const paid = row.status === "paid" ? Number(row.amount) : Number(row.paid_amount || 0);
      const due = Math.max(0, Number(row.amount) - paid);
      if (due <= 0.009) continue;
      remaining += due;
      dates.push(row.due_date);
      if (row.due_date < cutoff) overdue += due;
      else if (row.due_date >= today && row.due_date <= soonThrough) soon += due;
    }
    return {
      remaining: Math.round(remaining * 100) / 100,
      overdue: Math.round(overdue * 100) / 100,
      soon: Math.round(soon * 100) / 100,
      nextDue: dates.sort()[0] || "",
    };
  }

  function dateKey(value) {
    const item = value instanceof Date ? value : new Date(String(value) + "T00:00:00");
    return item.getFullYear() + "-" + String(item.getMonth() + 1).padStart(2, "0") + "-" + String(item.getDate()).padStart(2, "0");
  }

  function csvValue(value) {
    let raw = value == null ? "" : String(value);
    if (typeof value === "string" && /^[=+@-]/.test(raw)) raw = "'" + raw;
    return /[",\r\n]/.test(raw) ? '"' + raw.replace(/"/g, '""') + '"' : raw;
  }

  function downloadOfflineCsv(filename, rows) {
    const content = "\uFEFF" + rows.map((row) => row.map(csvValue).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportOverdueCsv() {
    const rows = [["Клиент", "Телефон", "Адрес", "Рассрочка", "Общий остаток", "Просрочено", "К оплате за 7 дней", "Ближайшая дата"]];
    for (const loan of app.snapshot.loans) {
      const summary = debtSummary(loan);
      if (summary.overdue <= 0) continue;
      const client = app.snapshot.clients.find((item) => item.id === loan.client_id);
      rows.push([client?.full_name || "", client?.phone || "", client?.address || "", loan.title || loan.id,
        summary.remaining, summary.overdue, summary.soon, summary.nextDue]);
    }
    downloadOfflineCsv("prosrochivshie.csv", rows);
  }

  function exportAllLoansCsv() {
    const rows = [["ID рассрочки", "Клиент", "Телефон", "Адрес клиента", "Поручители", "Адреса поручителей", "Название", "Цена", "Наценка, %", "К возврату", "Взнос", "Срок, мес.", "Платёж/мес.", "Начало", "Статус", "График", "История оплат"]];
    for (const loan of app.snapshot.loans) {
      const client = app.snapshot.clients.find((item) => item.id === loan.client_id);
      const guarantors = app.snapshot.guarantors.filter((item) => item.loan_id === loan.id);
      const schedule = app.snapshot.schedules.filter((item) => item.loan_id === loan.id).sort((a, b) => a.sequence_number - b.sequence_number)
        .map((item) => "#" + item.sequence_number + " " + item.due_date + " " + item.amount + " (оплачено " + (item.paid_amount || 0) + ")").join("\n");
      const payments = app.snapshot.payments.filter((item) => item.loan_id === loan.id)
        .map((item) => item.paid_at.slice(0, 10) + " " + item.amount + (item.notes ? " · " + item.notes : "")).join("\n");
      rows.push([loan.id, client?.full_name || "", client?.phone || "", client?.address || "",
        guarantors.map((item) => item.full_name).join("; "), guarantors.map((item) => item.address || "").join("; "),
        loan.title || "", loan.cost_amount || 0, loan.markup_percent, loan.principal, loan.down_payment,
        loan.term_months, loan.monthly_payment, loan.start_date, loan.status, schedule, payments]);
    }
    downloadOfflineCsv("rassrochki_full.csv", rows);
  }

  function renderLoanDetails() {
    const loan = app.snapshot.loans.find((item) => item.id === app.loanId);
    if (!loan) return '<article class="card">Рассрочка отсутствует в локальной копии.</article>';
    const schedules = app.snapshot.schedules
      .filter((row) => row.loan_id === loan.id)
      .sort((a, b) => a.sequence_number - b.sequence_number);
    const payments = app.snapshot.payments
      .filter((row) => row.loan_id === loan.id)
      .sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at)));
    const guarantors = app.snapshot.guarantors.filter((row) => row.loan_id === loan.id);
    return `
      <article class="card">
        <button type="button" data-back-to-loans>← К рассрочкам</button>
        <div class="actions"><button type="button" data-action="edit-loan" data-loan-id="${text(loan.id)}">Изменить условия</button><button type="button" data-action="payment" data-loan-id="${text(loan.id)}">Записать оплату</button><button type="button" class="danger-button" data-action="delete-loan" data-loan-id="${text(loan.id)}">Удалить рассрочку</button></div>
        <h2>${text(relatedName(loan.clients) || loan.title || "Рассрочка")}</h2>
        <p class="muted">${text(loan.title || "Товар не указан")} · ${loan.status === "closed" ? "Закрыта" : "Активна"}</p>
        <p><strong>Сумма:</strong> ${text(money(loan.principal))}</p>
        <p><strong>Первый взнос:</strong> ${text(money(loan.down_payment))}</p>
        ${guarantors.length ? `<p><strong>Поручители:</strong> ${guarantors.map((g) => text(g.full_name)).join(", ")}</p>` : ""}
      </article>
      <article class="card"><h3>График платежей</h3><div class="table-wrap"><table><thead><tr><th>№</th><th>Срок</th><th>Сумма</th><th>Оплачено</th><th>Статус</th></tr></thead><tbody>${schedules.map((row) => `
        <tr><td>${text(row.sequence_number)}</td><td>${date(row.due_date)}</td><td>${text(money(row.amount))}</td><td>${text(money(row.paid_amount || 0))}</td><td>${row.status === "paid" ? "Оплачен" : row.status === "overdue" ? "Просрочен" : "Ожидает"}</td></tr>`).join("")}</tbody></table></div></article>
      <article class="card"><h3>История оплат</h3>${payments.length ? `<div class="list">${payments.map((row) => `<div class="row"><span>${date(row.paid_at)}${row.notes ? `<div class="muted">${text(row.notes)}</div>` : ""}</span><strong>${text(money(row.amount))}</strong></div>`).join("")}</div>` : '<p class="muted">Оплат нет.</p>'}</article>
    `;
  }

  function pendingForLoan(loanId) {
    return app.operations.filter((operation) => {
      if (operation.state === "conflict") return false;
      const payload = operation.command?.payload || {};
      return payload.loanId === loanId || payload.loan?.id === loanId || payload.payment?.loan_id === loanId;
    });
  }

  function dependenciesForLoan(loanId) {
    return pendingForLoan(loanId).map((operation) => operation.id);
  }

  function renderClientForm() {
    return `<article class="card"><h2>Новый клиент</h2><form data-form="client-create" class="form-grid">
      <label class="field full">ФИО<input name="full_name" required maxlength="200" autocomplete="name"></label>
      <label class="field">Телефон<input name="phone" type="tel" autocomplete="tel"></label>
      <label class="field full">Адрес клиента<textarea name="address" maxlength="1000" autocomplete="street-address"></textarea></label>
      <label class="field full">Заметки<textarea name="notes" maxlength="4000"></textarea></label>
      <div class="actions field full"><button type="button" data-action="cancel-form">Отмена</button><button class="primary" type="submit">Сохранить</button></div>
    </form></article>`;
  }

  function renderLoanForm(loanId = null) {
    const loan = loanId ? app.snapshot.loans.find((item) => item.id === loanId) : null;
    const clients = app.snapshot.clients.filter((client) => !client.is_blacklisted || client.id === loan?.client_id);
    if (!clients.length) return `<article class="card"><h2>Новая рассрочка</h2><p class="muted">Сначала добавьте клиента. Это можно сделать офлайн.</p><button type="button" data-action="new-client">Добавить клиента</button><button type="button" data-action="cancel-form">Отмена</button></article>`;
    const value = (key, fallback = "") => text(loan?.[key] ?? fallback);
    return `<article class="card"><h2>${loan ? "Изменить рассрочку" : "Новая рассрочка"}</h2><form data-form="${loan ? "loan-edit" : "loan-create"}" data-loan-id="${text(loanId || "")}" class="form-grid">
      <label class="field full">Клиент<select name="client_id" required>${clients.map((client) => `<option value="${text(client.id)}" ${client.id === loan?.client_id ? "selected" : ""}>${text(client.full_name)}${client.is_blacklisted ? " · чёрный список" : ""}</option>`).join("")}</select></label>
      <label class="field full">Название / товар<input name="title" maxlength="200" value="${value("title")}" placeholder="Например, холодильник"></label>
      <label class="field">Цена товара<input name="cost_amount" type="number" min="0.01" step="0.01" value="${value("cost_amount")}" ${loan ? "" : "required"}></label>
      <label class="field">Наценка, %<input name="markup_percent" type="number" min="0" step="0.01" value="${value("markup_percent", app.snapshot.settings?.default_markup_percent || 0)}"></label>
      <label class="field full">Сумма к возврату<input name="principal" type="number" min="0.01" step="0.01" required readonly value="${value("principal", "")}"></label>
      <label class="field">Первоначальный взнос<input name="down_payment" type="number" min="0" step="0.01" value="${value("down_payment", "0")}"></label>
      <label class="field">Срок, месяцев<input name="term_months" type="number" min="1" max="120" step="1" required value="${value("term_months", app.snapshot.settings?.default_term_months || 6)}"></label>
      <label class="field">Начало рассрочки<input name="start_date" type="date" required value="${value("start_date", new Date().toISOString().slice(0, 10))}"></label>
      <label class="field">Платёж в месяц (0 — автоматически)<input name="monthly_payment" type="number" min="0" step="0.01" value="${value("monthly_payment", "0")}"></label>
      <label class="field">Инвестор<select name="investor_id"><option value="">Без инвестора</option>${app.snapshot.investors.map((investor) => `<option value="${text(investor.id)}" ${investor.id === loan?.investor_id ? "selected" : ""}>${text(investor.name)}</option>`).join("")}</select></label>
      <label class="field">Вложение инвестора<input name="investor_amount" type="number" min="0" step="0.01" value="${value("investor_amount")}"></label>
      <label class="field">Доля владельца, %<input name="income_share_manager" type="number" min="0" max="100" step="0.01" value="${value("income_share_manager", app.snapshot.settings?.income_share_manager || 100)}"></label>
      <label class="field">Доля инвестора, %<input name="income_share_investor" type="number" min="0" max="100" step="0.01" value="${value("income_share_investor", app.snapshot.settings?.income_share_investor || 0)}"></label>
      <label class="field full">Заметки<textarea name="notes" maxlength="4000">${value("notes")}</textarea></label>
      <div class="actions field full"><button type="button" data-action="cancel-form">Отмена</button><button class="primary" type="submit">${loan ? "Сохранить" : "Создать"}</button></div>
    </form><p class="muted">Неоплаченный график будет пересчитан. Уже полученные оплаты и строки с чеками сохраняются.</p></article>`;
  }

  function renderPaymentForm(loanId) {
    const loan = app.snapshot.loans.find((item) => item.id === loanId);
    if (!loan) return "";
    const rows = app.snapshot.schedules.filter((row) => row.loan_id === loanId).sort((a, b) => a.sequence_number - b.sequence_number);
    const start = rows.find((row) => row.status !== "paid" && Number(row.paid_amount || 0) + 0.009 < Number(row.amount));
    if (!start) return `<article class="card"><p>Неоплаченных платежей нет.</p><button type="button" data-action="cancel-form">Назад</button></article>`;
    const remaining = rows.reduce((sum, row) => sum + Math.max(0, Number(row.amount) - Math.max(Number(row.paid_amount || 0), row.status === "paid" ? Number(row.amount) : 0)), 0);
    return `<article class="card"><h2>Записать оплату</h2><p class="muted">Оплата будет локальной до следующей синхронизации.</p><form data-form="payment" data-loan-id="${text(loanId)}" class="form-grid">
      <label class="field full">Начать с платежа<select name="schedule_id" required>${rows.filter((row) => row.status !== "paid").map((row) => `<option value="${text(row.id)}" ${row.id === start.id ? "selected" : ""}>№ ${text(row.sequence_number)} · ${date(row.due_date)} · ${text(money(row.amount))}</option>`).join("")}</select></label>
      <label class="field">Сумма<input name="amount" type="number" min="0.01" max="${text(remaining)}" step="0.01" required value="${text(Math.min(remaining, Number(start.amount) - Number(start.paid_amount || 0)))}"></label>
      <label class="field">Дата оплаты<input name="paid_at" type="date" required value="${new Date().toISOString().slice(0, 10)}"></label>
      <label class="field">Способ<select name="method"><option value="manual">Наличные / вручную</option><option value="transfer_with_receipt">Перевод с чеком</option></select></label>
      <label class="field">Чек (необязательно)<input name="receipt" type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"></label>
      <label class="field full">Заметки<textarea name="notes" maxlength="1000"></textarea></label>
      <div class="actions field full"><button type="button" data-action="cancel-form">Отмена</button><button class="primary" type="submit">Сохранить оплату</button></div>
    </form></article>`;
  }

  function addMonthsClamped(dateValue, months) {
    const [year, month, day] = String(dateValue).slice(0, 10).split("-").map(Number);
    const first = new Date(year, month - 1 + months, 1);
    const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
  }

  function buildRows(principal, months, startDate, monthlyPayment) {
    const base = Number(monthlyPayment) > 0 ? Number(monthlyPayment) : Math.round(principal / months * 100) / 100;
    let remaining = principal;
    return Array.from({ length: months }, (_, index) => {
      const amount = index === months - 1 ? Math.round(remaining * 100) / 100 : Math.min(base, Math.round(remaining * 100) / 100);
      remaining = Math.round((remaining - amount) * 100) / 100;
      return { sequence_number: index + 1, due_date: addMonthsClamped(startDate, index + 1), amount };
    });
  }

  function buildEditPlan(loanId, schedulePrincipal, termMonths, startDate, monthlyPayment) {
    const schedules = app.snapshot.schedules.filter((row) => row.loan_id === loanId).sort((a, b) => a.sequence_number - b.sequence_number);
    const payments = app.snapshot.payments.filter((payment) => payment.loan_id === loanId);
    const paymentsBySchedule = new Map();
    for (const payment of payments) {
      if (!payment.schedule_id) continue;
      paymentsBySchedule.set(payment.schedule_id, Math.round(((paymentsBySchedule.get(payment.schedule_id) || 0) + Number(payment.amount)) * 100) / 100);
    }
    const paidById = new Map(schedules.map((row) => [row.id, Math.max(Number(row.paid_amount || 0), row.status === "paid" ? Number(row.amount) : 0, paymentsBySchedule.get(row.id) || 0)]));
    const knownIds = new Set(schedules.map((row) => row.id));
    const scheduledCollected = schedules.reduce((sum, row) => sum + paidById.get(row.id), 0);
    const unallocated = payments.reduce((sum, payment) => sum + (payment.schedule_id && knownIds.has(payment.schedule_id) ? 0 : Number(payment.amount)), 0);
    const collected = Math.round((scheduledCollected + unallocated) * 100) / 100;
    if (collected > schedulePrincipal + 0.009) throw new Error("Новая сумма графика меньше уже полученных оплат.");

    let paidCount = 0;
    while (paidCount < schedules.length) {
      const row = schedules[paidCount];
      if (row.sequence_number !== paidCount + 1 || paidById.get(row.id) + 0.009 < Number(row.amount)) break;
      paidCount += 1;
    }
    const remainingRows = schedules.slice(paidCount);
    const protectedRows = remainingRows.filter((row) => paidById.get(row.id) > 0 || row.receipt_path || paymentsBySchedule.has(row.id));
    if (protectedRows.length > 1) throw new Error("В нескольких неоплаченных строках есть оплаты или чеки. Сначала синхронизируйте или исправьте график.");
    const partial = protectedRows[0] || null;
    if (partial && partial.sequence_number !== paidCount + 1) throw new Error("В графике есть пропуск между оплаченными платежами.");
    if (termMonths < paidCount + (partial ? 1 : 0)) throw new Error("Срок нельзя сделать короче уже сохранённых оплат.");

    const remainingPrincipal = Math.max(0, Math.round((schedulePrincipal - collected) * 100) / 100);
    const slots = termMonths - paidCount;
    if (remainingPrincipal > 0.009 && slots <= 0) throw new Error("В новом сроке не остаётся месяцев для остатка.");
    const shiftedStart = addMonthsClamped(startDate, paidCount);
    const rebuilt = remainingPrincipal > 0.009
      ? buildRows(remainingPrincipal, slots, shiftedStart, monthlyPayment)
        .map((row, index) => ({ ...row, sequence_number: paidCount + index + 1 }))
        .filter((row) => row.amount > 0.001)
      : [];

    const partialPaid = partial ? paidById.get(partial.id) : 0;
    const partialRow = partial ? {
      ...partial,
      sequence_number: paidCount + 1,
      due_date: rebuilt[0]?.due_date || addMonthsClamped(startDate, paidCount + 1),
      amount: Math.round((partialPaid + (rebuilt[0]?.amount || 0)) * 100) / 100,
      paid_amount: partialPaid,
      status: partialPaid + 0.009 >= (partialPaid + (rebuilt[0]?.amount || 0)) ? "paid" : "pending",
    } : null;
    const inserted = rebuilt.slice(partial ? 1 : 0).map((row) => ({ ...row, id: crypto.randomUUID() }));
    const projected = [
      ...schedules.slice(0, paidCount),
      ...(partialRow ? [partialRow] : []),
      ...inserted.map((row) => ({
        ...row,
        loan_id: loanId,
        organization_id: app.account.organizationId,
        status: row.due_date < new Date().toISOString().slice(0, 10) ? "overdue" : "pending",
        paid_at: null,
        paid_amount: 0,
        receipt_path: null,
      })),
    ];
    return {
      collected,
      remainingPrincipal,
      partialSchedule: partialRow ? { id: partialRow.id, sequence_number: partialRow.sequence_number, due_date: partialRow.due_date, amount: partialRow.amount } : null,
      newSchedules: inserted,
      projectedSchedules: projected,
      status: remainingPrincipal > 0.009 ? "active" : "closed",
    };
  }

  function loanValuesFromForm(form) {
    const data = new FormData(form);
    const number = (name, fallback = 0) => {
      const value = data.get(name);
      if (value === null || String(value).trim() === "") return fallback;
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) throw new Error("Проверьте числовые поля.");
      return Math.round(parsed * 100) / 100;
    };
    const rawPrincipal = number("principal");
    const costText = String(data.get("cost_amount") || "").trim();
    const costAmount = costText ? number("cost_amount") : null;
    const markupPercent = number("markup_percent");
    const targetPrincipal = costAmount !== null
      ? Math.round(costAmount * (100 + markupPercent) / 100 * 100) / 100
      : rawPrincipal;
    const downPayment = number("down_payment");
    const termMonths = number("term_months");
    const startDate = String(data.get("start_date") || "");
    const targetScheduled = targetPrincipal - downPayment;
    if (!data.get("client_id") || targetPrincipal <= 0 || (form.dataset.form === "loan-create" && !(costAmount > 0)) || downPayment < 0 || downPayment > targetPrincipal || !Number.isInteger(termMonths) || termMonths < 1 || termMonths > 120 || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      throw new Error("Проверьте клиента, сумму, взнос, срок и дату начала.");
    }
    if (targetScheduled <= 0.009) throw new Error("После взноса не осталось суммы для графика. Уменьшите взнос или проверьте условия рассрочки.");
    const monthlyInput = number("monthly_payment");
    const monthlyPayment = Math.max(1, Math.round(monthlyInput > 0 ? monthlyInput : targetScheduled / termMonths));
    const scheduled = Math.round(monthlyPayment * termMonths * 100) / 100;
    const principal = Math.round((scheduled + downPayment) * 100) / 100;
    const effectiveMarkupPercent = costAmount > 0
      ? Math.round(((principal - costAmount) / costAmount) * 10000) / 100
      : markupPercent;
    const investorId = String(data.get("investor_id") || "") || null;
    const selectedClient = app.snapshot.clients.find((client) => client.id === data.get("client_id"));
    if (!selectedClient || selectedClient.is_blacklisted) throw new Error("Выберите клиента, которого нет в чёрном списке.");
    const investor = app.snapshot.investors.find((item) => item.id === investorId);
    const loan = {
      client_id: selectedClient.id,
      investor_id: investorId,
      investor_amount: investorId ? number("investor_amount") || null : null,
      title: String(data.get("title") || "").trim() || null,
      cost_amount: costAmount,
      markup_percent: effectiveMarkupPercent,
      principal,
      down_payment: downPayment,
      schedule_on_full_amount: false,
      term_months: termMonths,
      start_date: startDate,
      monthly_payment: monthlyPayment,
      income_share_manager: number("income_share_manager", 100),
      income_share_investor: investorId ? number("income_share_investor") : 0,
      notes: String(data.get("notes") || "").trim() || null,
      clients: { full_name: selectedClient.full_name, phone: selectedClient.phone, address: selectedClient.address },
      investors: investor ? { name: investor.name } : null,
    };
    return { data, loan, schedulePrincipal: scheduled, monthlyPayment, termMonths, startDate };
  }

  function updateLoanEstimate(form) {
    if (!(form instanceof HTMLFormElement) || !form.dataset.form?.startsWith("loan-")) return;
    const data = new FormData(form);
    const cost = Number(data.get("cost_amount")) || 0;
    const markup = Number(data.get("markup_percent")) || 0;
    const principal = form.elements.namedItem("principal");
    if (!(principal instanceof HTMLInputElement)) return;
    const down = Number(data.get("down_payment")) || 0;
    const months = Number(data.get("term_months")) || 0;
    const target = cost > 0 ? Math.round(cost * (100 + markup) / 100 * 100) / 100 : Number(principal.value) || 0;
    const targetScheduled = Math.max(0, target - down);
    const inputMonthly = Number(data.get("monthly_payment")) || 0;
    const monthly = months > 0 ? Math.max(1, Math.round(inputMonthly > 0 ? inputMonthly : targetScheduled / months)) : 0;
    const total = months > 0 ? Math.round((down + monthly * months) * 100) / 100 : target;
    if (cost > 0) principal.value = String(total);
    else if (form.dataset.form === "loan-create") principal.value = "";
    let note = form.querySelector("[data-rounding-note]");
    if (!note && principal.parentElement) {
      note = document.createElement("p");
      note.dataset.roundingNote = "true";
      note.className = "field full muted";
      principal.parentElement.insertAdjacentElement("afterend", note);
    }
    if (note && cost > 0 && months > 0) {
      const effective = Math.round(((total - cost) / cost) * 10000) / 100;
      const change = Math.round((effective - markup) * 100) / 100;
      const totalChange = Math.round((total - target) * 100) / 100;
      note.textContent = "После округления до " + monthly + " ₽ фактическая наценка " + effective + "% (" +
        (change > 0 ? "+" : "") + change + " п.п.), сумма к возврату изменится на " +
        (totalChange > 0 ? "+" : "") + totalChange + " ₽.";
    }
  }

  async function handleFormSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.dataset.form) return;
    event.preventDefault();
    try {
      if (form.dataset.form === "client-create") {
        const values = new FormData(form);
        const clientId = crypto.randomUUID();
        const client = {
          id: clientId,
          organization_id: app.account.organizationId,
          full_name: String(values.get("full_name") || "").trim(),
          phone: String(values.get("phone") || "").trim() || null,
          address: String(values.get("address") || "").trim() || null,
          notes: String(values.get("notes") || "").trim() || null,
          is_blacklisted: false,
          blacklist_note: null,
          created_at: new Date().toISOString(),
          offline_version: 1,
        };
        if (!client.full_name) throw new Error("Укажите ФИО клиента.");
        await enqueue({ type: "client.create", payload: { client } });
        app.form = null;
        app.view = "clients";
        render();
        return;
      }

      if (form.dataset.form === "loan-create" || form.dataset.form === "loan-edit") {
        const editing = form.dataset.form === "loan-edit";
        const loanId = editing ? form.dataset.loanId : crypto.randomUUID();
        const current = editing ? app.snapshot.loans.find((item) => item.id === loanId) : null;
        if (editing && !current) throw new Error("Рассрочка больше не найдена в сохранённых данных.");
        if (editing && app.operations.some((item) => item.state === "conflict" && (item.command?.payload?.loanId === loanId || item.command?.payload?.loan?.id === loanId || item.command?.payload?.payment?.loan_id === loanId))) {
          throw new Error("Сначала разрешите конфликт этой рассрочки.");
        }
        const values = loanValuesFromForm(form);
        const loan = {
          ...values.loan,
          id: loanId,
          organization_id: app.account.organizationId,
          created_at: current?.created_at || new Date().toISOString(),
          offline_version: Number(current?.offline_version || 1),
          status: current?.status || "active",
        };
        const clientOperations = app.operations.filter((item) => item.state !== "conflict" && (item.command?.payload?.client?.id === loan.client_id || item.command?.payload?.clientId === loan.client_id));
        const dependencies = editing ? dependenciesForLoan(loanId) : clientOperations.map((item) => item.id);

        if (!editing) {
          const schedules = buildRows(values.schedulePrincipal, values.termMonths, values.startDate, values.monthlyPayment).map((row) => ({
            ...row,
            id: crypto.randomUUID(),
            loan_id: loanId,
            organization_id: app.account.organizationId,
            status: "pending",
            paid_at: null,
            paid_amount: 0,
            receipt_path: null,
          }));
          loan.status = "active";
          await enqueue({ type: "loan.create", payload: { loan, schedules, guarantors: [] } }, dependencies);
        } else {
          const plan = buildEditPlan(loanId, values.schedulePrincipal, values.termMonths, values.startDate, values.monthlyPayment);
          loan.status = plan.status;
          const existingGuarantors = app.snapshot.guarantors.filter((item) => item.loan_id === loanId).map(({ id, full_name, phone, address, notes }) => ({ id, full_name, phone, address, notes }));
          const operation = await enqueue({
            type: "loan.edit",
            payload: {
              loanId,
              expectedVersion: Number(current.offline_version || 1),
              loan,
              partialSchedule: plan.partialSchedule,
              newSchedules: plan.newSchedules,
              projectedSchedules: plan.projectedSchedules,
              guarantors: existingGuarantors,
              expectedTotal: values.schedulePrincipal,
            },
          }, dependencies);
          app.loanId = loanId;
          app.form = null;
          app.view = "loans";
          await refreshLocalData();
          return operation;
        }
        app.form = null;
        app.view = "loans";
        app.loanId = loanId;
        render();
        return;
      }

      if (form.dataset.form === "payment") {
        const loanId = form.dataset.loanId;
        const loan = app.snapshot.loans.find((item) => item.id === loanId);
        if (!loan) throw new Error("Рассрочка отсутствует в локальной копии.");
        const values = new FormData(form);
        const scheduleId = String(values.get("schedule_id") || "");
        const schedules = app.snapshot.schedules.filter((row) => row.loan_id === loanId).sort((a, b) => a.sequence_number - b.sequence_number);
        const earliest = schedules.find((row) => row.status !== "paid" && Number(row.paid_amount || 0) + 0.009 < Number(row.amount));
        if (!earliest || earliest.id !== scheduleId) throw new Error("Оплату нужно начать с самого раннего неоплаченного платежа.");
        const amount = Number(values.get("amount"));
        const remaining = schedules.reduce((sum, row) => sum + Math.max(0, Number(row.amount) - Math.max(Number(row.paid_amount || 0), row.status === "paid" ? Number(row.amount) : 0)), 0);
        if (!Number.isFinite(amount) || amount <= 0 || amount > remaining + 0.009) throw new Error("Сумма больше остатка рассрочки или указана неверно.");
        const file = values.get("receipt");
        const receipt = file instanceof File && file.size > 0 ? file : null;
        if (receipt && receipt.size > 8 * 1024 * 1024) throw new Error("Чек слишком большой (максимум 8 МБ).");
        if (receipt && !["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"].includes(receipt.type)) throw new Error("Формат чека не поддерживается.");
        const operationId = crypto.randomUUID();
        const payment = {
          id: crypto.randomUUID(),
          loan_id: loanId,
          organization_id: app.account.organizationId,
          schedule_id: scheduleId,
          amount: Math.round(amount * 100) / 100,
          paid_at: new Date(`${values.get("paid_at")}T12:00:00`).toISOString(),
          method: receipt ? "transfer_with_receipt" : "manual",
          notes: String(values.get("notes") || "").trim() || null,
          receipt_path: null,
          idempotency_key: operationId,
        };
        await enqueue({ type: "payment.record", payload: { payment, scheduleId } }, dependenciesForLoan(loanId), receipt, operationId);
        app.form = null;
        app.view = "loans";
        app.loanId = loanId;
        render();
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Не удалось сохранить изменение на устройстве.");
    }
  }

  async function discardOperation(operationId) {
    const db = await openDatabase();
    const tx = db.transaction(["operations", "receiptFiles"], "readwrite");
    const done = transactionComplete(tx);
    const operations = await requestValue(tx.objectStore("operations").index("byAccount").getAll([app.account.userId, app.account.organizationId]));
    const removed = new Set([operationId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const operation of operations) {
        if (!removed.has(operation.id) && (operation.dependsOn || []).some((id) => removed.has(id))) {
          removed.add(operation.id);
          operation.state = "conflict";
          operation.lastError = "Зависимость отменена на этом устройстве. Проверьте это изменение.";
          tx.objectStore("operations").put(operation);
          changed = true;
        }
      }
    }
    tx.objectStore("operations").delete(operationId);
    tx.objectStore("receiptFiles").delete(operationId);
    await done;
    db.close();
    await refreshLocalData();
  }

  async function clearCurrentDeviceData() {
    if (!app.account) return;
    const queuedCount = app.operations.length;
    const warning = queuedCount
      ? `На устройстве есть ${queuedCount} ожидающих или конфликтующих операций. Они и локальные чеки будут удалены без отправки. Продолжить?`
      : "Удалить офлайн-копию данных этой организации с устройства?";
    if (!window.confirm(warning)) return;
    const db = await openDatabase();
    const tx = db.transaction(["snapshots", "operations", "receiptFiles"], "readwrite");
    const done = transactionComplete(tx);
    tx.objectStore("snapshots").delete([app.account.userId, app.account.organizationId]);
    for (const name of ["operations", "receiptFiles"]) {
      const store = tx.objectStore(name);
      const keys = await requestValue(store.index("byAccount").getAllKeys([app.account.userId, app.account.organizationId]));
      for (const key of keys) store.delete(key);
    }
    await done;
    db.close();
    localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
    app.snapshot = null;
    app.baseSnapshot = null;
    app.operations = [];
    app.account = null;
    showSyncMessage("Данные удалены", "Копия организации очищена с этого устройства.", false);
    content.innerHTML = '<article class="card"><a class="button" href="/login">Войти и загрузить данные</a></article>';
  }

  async function handleOfflineClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const loanFilterButton = target.closest("[data-loan-filter]");
    if (loanFilterButton) {
      app.loanFilter = loanFilterButton.getAttribute("data-loan-filter") || "all";
      render();
      return;
    }
    const actionButton = target.closest("[data-action]");
    if (actionButton) {
      const action = actionButton.getAttribute("data-action");
      const clientId = actionButton.getAttribute("data-client");
      const loanId = actionButton.getAttribute("data-loan-id");
      if (action === "export-overdue-csv") {
        exportOverdueCsv();
        return;
      }
      if (action === "export-loans-csv") {
        exportAllLoansCsv();
        return;
      }
      if (action === "cancel-form") {
        app.form = null;
        render();
        return;
      }
      if (action === "new-client") {
        app.form = "client-create";
        app.view = "clients";
        render();
        return;
      }
      if (action === "new-loan") {
        app.form = "loan-create";
        app.view = "loans";
        app.loanId = null;
        render();
        return;
      }
      if (action === "edit-loan" && loanId) {
        if (app.operations.some((item) => item.state === "conflict" && (item.command?.payload?.loanId === loanId || item.command?.payload?.loan?.id === loanId || item.command?.payload?.payment?.loan_id === loanId))) {
          window.alert("Сначала разрешите конфликт этой рассрочки на главной странице.");
          return;
        }
        app.loanId = loanId;
        app.form = "loan-edit";
        app.view = "loans";
        render();
        return;
      }
      if (action === "payment" && loanId) {
        app.loanId = loanId;
        app.form = "payment";
        app.view = "loans";
        render();
        return;
      }
      if (action === "toggle-blacklist" && clientId) {
        const client = app.snapshot.clients.find((item) => item.id === clientId);
        if (!client) return;
        const dependencies = app.operations.filter((item) => item.state !== "conflict" && (item.command?.payload?.client?.id === clientId || item.command?.payload?.clientId === clientId)).map((item) => item.id);
        await enqueue({ type: "client.blacklist", payload: { clientId, expectedVersion: Number(client.offline_version || 1), isBlacklisted: !client.is_blacklisted, blacklistNote: null } }, dependencies);
        return;
      }
      if (action === "delete-client" && clientId) {
        const client = app.snapshot.clients.find((item) => item.id === clientId);
        if (!client || app.snapshot.loans.some((loan) => loan.client_id === clientId)) return;
        if (!window.confirm(`Удалить клиента «${client.full_name}» с этого устройства и при синхронизации?`)) return;
        const dependencies = app.operations.filter((item) => item.state !== "conflict" && (item.command?.payload?.client?.id === clientId || item.command?.payload?.clientId === clientId || item.command?.payload?.loan?.client_id === clientId)).map((item) => item.id);
        await enqueue({ type: "client.delete", payload: { clientId, expectedVersion: Number(client.offline_version || 1) } }, dependencies);
        return;
      }
      if (action === "delete-loan" && loanId) {
        const loan = app.snapshot.loans.find((item) => item.id === loanId);
        if (!loan) return;
        if (app.operations.some((item) => item.state === "conflict" && (item.command?.payload?.loanId === loanId || item.command?.payload?.loan?.id === loanId || item.command?.payload?.payment?.loan_id === loanId))) {
          window.alert("Сначала разрешите конфликт этой рассрочки.");
          return;
        }
        const payments = app.snapshot.payments.filter((payment) => payment.loan_id === loanId);
        const schedules = app.snapshot.schedules.filter((row) => row.loan_id === loanId);
        const receipts = new Set([...payments.map((payment) => payment.receipt_path), ...schedules.map((row) => row.receipt_path)].filter(Boolean));
        const total = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        const label = relatedName(loan.clients) || loan.title || "Рассрочка";
        if (!window.confirm(`Удалить рассрочку «${label}»?\n\nБудут удалены ${payments.length} оплат на сумму ${money(total)}, график и ${receipts.size} чеков. Сумма исчезнет из дашбордов после локального скрытия и будет удалена с сервера при синхронизации. Это действие нельзя отменить после отправки.`)) return;
        await enqueue({ type: "loan.delete", payload: { loanId, expectedVersion: Number(loan.offline_version || 1) } }, dependenciesForLoan(loanId));
        app.form = null;
        app.loanId = null;
        app.view = "loans";
        render();
        return;
      }
      if (action === "discard-operation") {
        const operationId = actionButton.getAttribute("data-operation");
        const operation = app.operations.find((item) => item.id === operationId);
        if (operation && window.confirm(`Удалить конфликтующее изменение с этого устройства?\n\n${operation.lastError || "Сервер не изменится."}`)) {
          await discardOperation(operation.id);
        }
        return;
      }
    }
    const loanButton = target.closest("[data-loan]");
    if (loanButton) {
      app.loanId = loanButton.getAttribute("data-loan");
      app.form = null;
      app.view = "loans";
      render();
    } else if (target.closest("[data-back-to-loans]")) {
      app.loanId = null;
      app.form = null;
      render();
    }
  }

  function render() {
    if (!app.snapshot) return;
    document.querySelectorAll("nav [data-view]").forEach((button) => {
      button.setAttribute("aria-current", button.dataset.view === app.view ? "page" : "false");
    });
    if (app.form === "client-create") content.innerHTML = renderClientForm();
    else if (app.form === "loan-create") content.innerHTML = renderLoanForm();
    else if (app.form === "loan-edit") content.innerHTML = renderLoanForm(app.loanId);
    else if (app.form === "payment") content.innerHTML = renderPaymentForm(app.loanId);
    else content.innerHTML = app.view === "dashboard"
      ? renderDashboard()
      : app.view === "clients"
        ? renderClients()
        : app.loanId
          ? renderLoanDetails()
          : renderLoans();
    if (app.view === "clients" && !app.form) addClientAddressesToList();
    if (app.form === "loan-create" || app.form === "loan-edit") {
      const loanForm = content.querySelector('form[data-form^="loan-"]');
      if (loanForm) updateLoanEstimate(loanForm);
    }
    if (app.view === "dashboard" && !app.form) {
      const conflicts = app.operations.filter((operation) => operation.state === "conflict");
      if (conflicts.length) {
        content.insertAdjacentHTML("beforeend", `<article class="card warning"><h2>Операции требуют внимания</h2>${conflicts.map((operation) => `<div class="row"><span>${text(operation.lastError || "Конфликт данных")}</span><button class="danger-button" type="button" data-action="discard-operation" data-operation="${text(operation.id)}">Удалить локальную операцию</button></div>`).join("")}<p class="muted">Удаление здесь отменит только локальное изменение. Серверные данные не затрагиваются.</p></article>`);
      }
    }
  }

  function addClientAddressesToList() {
    for (const client of app.snapshot.clients) {
      if (!client.address) continue;
      const action = Array.from(content.querySelectorAll("[data-client]")).find((item) => item.getAttribute("data-client") === client.id);
      const row = action?.closest(".row");
      const details = row?.querySelector("strong")?.parentElement;
      if (!details) continue;
      const address = document.createElement("div");
      address.className = "muted";
      address.textContent = "Адрес: " + client.address;
      details.append(address);
    }
  }

  function updateNetworkState() {
    const online = navigator.onLine;
    networkState.textContent = !online ? "Без сети" : app.syncError ? "Сервер недоступен" : "Есть интернет";
    networkState.className = `badge ${online && !app.syncError ? "online" : "offline"}`;
    onlineAction.style.display = online ? "block" : "none";
    updateSyncInfo();
  }

  let syncRunning = false;

  function orderQueuedOperations(operations) {
    const byId = new Map(operations.map((operation) => [operation.id, operation]));
    const remaining = new Map();
    const children = new Map();
    for (const operation of operations) {
      const dependencies = (operation.dependsOn || []).filter((id) => byId.has(id));
      remaining.set(operation.id, dependencies.length);
      for (const id of dependencies) children.set(id, [...(children.get(id) || []), operation.id]);
    }
    const compare = (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
    const ready = operations.filter((operation) => remaining.get(operation.id) === 0).sort(compare);
    const result = [];
    while (ready.length) {
      const current = ready.shift();
      result.push(current);
      for (const childId of children.get(current.id) || []) {
        remaining.set(childId, remaining.get(childId) - 1);
        if (remaining.get(childId) === 0) {
          ready.push(byId.get(childId));
          ready.sort(compare);
        }
      }
    }
    if (result.length !== operations.length) throw new Error("В очереди есть циклическая зависимость.");
    return result;
  }

  async function syncNow() {
    if (!navigator.onLine || syncRunning || !app.account) return;
    syncRunning = true;
    const button = document.getElementById("sync-now");
    if (button) { button.disabled = true; button.textContent = "Синхронизация…"; }
    try {
      const db = await openDatabase();
      const tx = db.transaction(["operations"], "readonly");
      const operations = await requestValue(tx.objectStore("operations").index("byAccount").getAll([app.account.userId, app.account.organizationId]));
      db.close();
      const queued = orderQueuedOperations(operations.filter((operation) => operation.state !== "conflict"));
      const batch = queued.slice(0, 25);
      const statusById = new Map();
      const prepared = [];
      const localResults = [];
      for (const operation of batch) {
        const blocker = (operation.dependsOn || []).find((id) => {
          const dependency = operations.find((item) => item.id === id);
          return dependency?.state === "conflict" || statusById.get(id) === "conflict" || statusById.get(id) === "failed";
        });
        if (blocker) {
          localResults.push({ operationId: operation.id, status: "conflict", message: "Сначала разрешите предыдущий конфликт." });
          statusById.set(operation.id, "conflict");
          continue;
        }
        operation.state = "syncing";
        operation.lastError = null;
        const payment = operation.command?.payload?.payment;
        const receiptDb = await openDatabase();
        const receiptTx = receiptDb.transaction(["receiptFiles"], "readonly");
        const receipt = await requestValue(receiptTx.objectStore("receiptFiles").get(operation.id));
        receiptDb.close();
        let command = operation.command;
        if (receipt) {
          try {
            const form = new FormData();
            form.set("operationId", operation.id);
            form.set("loanId", String(payment?.loan_id || ""));
            form.set("receipt", receipt.blob, receipt.fileName || "receipt.jpg");
            const upload = await fetch("/api/offline/receipt", { method: "POST", body: form, cache: "no-store" });
            const uploadBody = await upload.json();
            if (!upload.ok || typeof uploadBody.path !== "string") throw new Error("upload failed");
            command = { ...command, payload: { ...command.payload, payment: { ...payment, receipt_path: uploadBody.path } } };
          } catch {
            localResults.push({ operationId: operation.id, status: "failed", message: "Чек остался на устройстве. Не удалось загрузить его, повторите синхронизацию." });
            statusById.set(operation.id, "failed");
            continue;
          }
        }
        prepared.push({ ...operation, command });
        statusById.set(operation.id, "ready");
      }

      const results = [...localResults];
      if (prepared.length) {
        try {
          const response = await fetch("/api/offline/sync", {
            method: "POST",
            cache: "no-store",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ operations: prepared }),
          });
          const body = await response.json();
          if (!response.ok || !Array.isArray(body.results)) throw new Error("sync request failed");
          results.push(...body.results);
        } catch {
          for (const operation of prepared) results.push({ operationId: operation.id, status: "failed", message: "Связь прервалась. Операция сохранена для безопасного повтора." });
        }
      }

      const snapshotResponse = await fetch("/api/offline/snapshot", { method: "GET", cache: "no-store", headers: { Accept: "application/json" } });
      const envelope = await snapshotResponse.json();
      if (!snapshotResponse.ok || envelope.complete !== true || envelope.snapshot?.userId !== app.account.userId || envelope.snapshot?.organizationId !== app.account.organizationId) throw new Error("snapshot refresh failed");
      const freshDb = await openDatabase();
      const snapshotTx = freshDb.transaction(["snapshots"], "readwrite");
      const snapshotDone = transactionComplete(snapshotTx);
      snapshotTx.objectStore("snapshots").put(envelope.snapshot);
      await snapshotDone;
      freshDb.close();

      const resultById = new Map(results.map((result) => [result.operationId, result]));
      const updateDb = await openDatabase();
      const updateTx = updateDb.transaction(["operations", "receiptFiles"], "readwrite");
      const updateDone = transactionComplete(updateTx);
      const operationStore = updateTx.objectStore("operations");
      for (const operation of batch) {
        const result = resultById.get(operation.id);
        if (result?.status === "synced") {
          operationStore.delete(operation.id);
          updateTx.objectStore("receiptFiles").delete(operation.id);
        } else {
          operation.state = result?.status === "conflict" ? "conflict" : "pending";
          operation.attempts = Number(operation.attempts || 0) + 1;
          operation.lastError = String(result?.message || (result?.status === "conflict" ? "Не удалось согласовать изменение." : "Операция ожидает повторной синхронизации."));
          operationStore.put(operation);
        }
      }
      await updateDone;
      updateDb.close();
      localStorage.setItem(ACTIVE_ACCOUNT_KEY, JSON.stringify(app.account));
      app.syncError = null;
      updateNetworkState();
      await refreshLocalData();
    } catch {
      app.syncError = "Синхронизация не завершена. Изменения сохранены для повтора.";
      updateNetworkState();
      await refreshLocalData().catch(() => undefined);
    } finally {
      syncRunning = false;
      if (button) { button.disabled = false; button.textContent = "Синхронизировать изменения"; }
    }
  }

  async function start() {
    updateNetworkState();
    window.addEventListener("online", () => { updateNetworkState(); void syncNow(); });
    window.addEventListener("offline", updateNetworkState);
    document.getElementById("sync-now")?.addEventListener("click", () => void syncNow());
    document.getElementById("clear-offline")?.addEventListener("click", () => { void clearCurrentDeviceData(); });
    document.querySelectorAll("nav [data-view]").forEach((button) => {
      button.addEventListener("click", () => switchView(button.dataset.view));
    });
    content.addEventListener("click", (event) => { void handleOfflineClick(event).catch((error) => window.alert(error instanceof Error ? error.message : "Не удалось выполнить офлайн-изменение.")); });
    content.addEventListener("submit", (event) => { void handleFormSubmit(event); });
    content.addEventListener("input", (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && ["cost_amount", "markup_percent", "down_payment", "term_months", "monthly_payment"].includes(target.name)) updateLoanEstimate(target.form);
    });

    try {
      const { snapshot, operations, account, db } = await loadAccount();
      db.close();
      if (!snapshot) throw new Error("Нет сохранённых данных. Подключитесь к интернету, чтобы загрузить копию.");
      app.baseSnapshot = snapshot;
      app.account = account;
      app.operations = operations || [];
      app.snapshot = projectPendingOperations();
      orgName.textContent = snapshot.organization?.name || "Сохранённая копия";
      updateSyncInfo();
      render();
      if (navigator.onLine && app.operations.some((item) => item.state !== "conflict")) void syncNow();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Не удалось загрузить офлайн-данные.";
      showSyncMessage("Копии нет", "Подключитесь к интернету, чтобы загрузить данные на это устройство.");
      setSyncErrorDetail(detail);
      content.innerHTML = '<article class="card"><p>Данные этого аккаунта ещё не сохранены на устройстве.</p><a class="button" href="/login">Войти и загрузить данные</a></article>';
    }
  }

  void start();
})();
