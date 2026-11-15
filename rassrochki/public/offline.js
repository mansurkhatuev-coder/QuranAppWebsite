(() => {
  "use strict";

  const DB_NAME = "rassrochki-offline-v1";
  const ACTIVE_ACCOUNT_KEY = "rassrochki:offline-account";
  const PAYMENT_ROUNDING_STEP = 100;
  const app = { snapshot: null, baseSnapshot: null, operations: [], account: null, view: "dashboard", loanId: null, clientId: null, cashType: null, form: null, syncError: null };
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
    snapshot.cash_transactions = Array.isArray(snapshot.cash_transactions) ? snapshot.cash_transactions : [];
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
        case "client.address":
          snapshot.clients = snapshot.clients.map((client) => client.id === payload.clientId
            ? { ...client, address: payload.address, offline_version: Number(client.offline_version || 1) + 1 }
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
          snapshot.payments.push({ ...payment, cash_recorded_at: payment.cash_recorded_at || operation.createdAt, idempotency_key: operation.id });
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
        case "cash.transaction.create": {
          const transaction = payload.transaction;
          if (transaction?.id && !snapshot.cash_transactions.some((item) => item.id === transaction.id)) {
            const investor = snapshot.investors.find((item) => item.id === transaction.investor_id);
            snapshot.cash_transactions.push({
              ...transaction,
              operation_id: operation.id,
              organization_id: app.account.organizationId,
              created_at: operation.createdAt,
              investors: investor ? { name: investor.name } : null,
            });
          }
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
    app.clientId = null;
    app.cashType = null;
    app.form = null;
    render();
  }

  function renderDashboard() {
    const snapshot = app.snapshot;
    const activeLoans = snapshot.loans.filter((loan) => loan.status !== "closed").length;
    const paid = snapshot.payments.reduce((total, payment) => total + Number(payment.amount || 0), 0);
    const overdue = snapshot.schedules.filter((schedule) => schedule.status === "overdue").length;
    const cash = getCashSummary();
    return `
      <div class="grid">
        <article class="card"><div class="muted">Клиенты</div><div class="stat">${snapshot.clients.length}</div></article>
        <article class="card"><div class="muted">Активные рассрочки</div><div class="stat">${activeLoans}</div></article>
        <article class="card"><div class="muted">Получено оплат</div><div class="stat">${text(money(paid))}</div></article>
        <article class="card"><div class="muted">Остаток кассы</div><div class="stat">${cash.initialized ? text(money(cash.balance)) : "Не задан"}</div><div class="muted">${cash.initialized ? `За месяц +${text(money(cash.monthInflow))} · −${text(money(cash.monthOutflow))}` : '<button type="button" data-cash-type="opening_balance">Указать остаток</button>'}</div></article>
        <article class="card"><div class="muted">Просроченные платежи</div><div class="stat">${overdue}</div></article>
      </div>
      <article class="card"><h2>Ближайшие платежи</h2>${renderUpcoming()}</article>
    `;
  }

  const cashTypeLabels = {
    opening_balance: "Начальный остаток",
    deposit: "Пополнение",
    owner_withdrawal: "Забрал с кассы",
    expense: "Расход",
    investor_contribution: "Вклад инвестора",
    investor_return: "Возврат инвестору",
  };

  function getCashSummary() {
    const snapshot = app.snapshot;
    const transactions = Array.isArray(snapshot.cash_transactions) ? snapshot.cash_transactions : [];
    const opening = transactions.find((item) => item.transaction_type === "opening_balance");
    if (!opening) return { initialized: false, balance: 0, monthInflow: 0, monthOutflow: 0, entries: [] };
    const start = Date.parse(opening.occurred_at) || 0;
    const entries = [{
      id: opening.id,
      label: cashTypeLabels.opening_balance,
      occurred_at: opening.occurred_at,
      amount: Number(opening.amount) || 0,
      direction: "opening",
      details: "Начало учёта денег, уже находившихся в кассе и на счетах",
      notes: opening.notes || null,
    }];
    const typeDirection = {
      deposit: "in",
      owner_withdrawal: "out",
      expense: "out",
      investor_contribution: "in",
      investor_return: "out",
    };
    for (const item of transactions) {
      if (item.id === opening.id || Date.parse(item.occurred_at) < start) continue;
      const investor = item.investors || snapshot.investors.find((row) => row.id === item.investor_id);
      const amount = Number(item.amount) || 0;
      const direction = typeDirection[item.transaction_type] || "in";
      entries.push({
        id: item.id,
        label: cashTypeLabels[item.transaction_type] || "Операция кассы",
        occurred_at: item.occurred_at,
        amount,
        direction,
        signed_amount: direction === "in" ? amount : -amount,
        details: investor ? `Инвестор: ${investor.name}` : item.transaction_type === "deposit" ? "Дополнительное поступление" : "",
        notes: item.notes || null,
      });
    }
    const loansById = new Map(snapshot.loans.map((loan) => [loan.id, loan]));
    for (const loan of snapshot.loans) {
      const recordedAt = loan.down_payment_recorded_at || loan.created_at;
      if ((Date.parse(recordedAt) || 0) < start || Number(loan.down_payment || 0) <= 0) continue;
      const name = relatedName(loan.clients) || loan.title || "Рассрочка";
      entries.push({ id: `down-payment:${loan.id}`, label: "Первоначальный взнос", occurred_at: recordedAt, amount: Number(loan.down_payment), direction: "in", signed_amount: Number(loan.down_payment), details: name, notes: null });
    }
    for (const payment of snapshot.payments) {
      const recordedAt = payment.cash_recorded_at || payment.paid_at;
      if ((Date.parse(recordedAt) || 0) < start || !loansById.has(payment.loan_id) || Number(payment.amount) <= 0) continue;
      const loan = loansById.get(payment.loan_id);
      entries.push({
        id: `payment:${payment.id}`,
        label: "Оплата по рассрочке",
        occurred_at: recordedAt,
        amount: Number(payment.amount),
        direction: "in",
        signed_amount: Number(payment.amount),
        details: relatedName(loan.clients) || loan.title || "Рассрочка",
        notes: payment.notes || null,
      });
    }
    entries.sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at) || a.id.localeCompare(b.id));
    const now = new Date();
    const thisMonth = (entry) => {
      const dateValue = new Date(entry.occurred_at);
      return dateValue.getFullYear() === now.getFullYear() && dateValue.getMonth() === now.getMonth();
    };
    const monthInflow = entries.filter((item) => item.direction === "in" && thisMonth(item)).reduce((sum, item) => sum + item.amount, 0);
    const monthOutflow = entries.filter((item) => item.direction === "out" && thisMonth(item)).reduce((sum, item) => sum + item.amount, 0);
    return {
      initialized: true,
      balance: Math.round((Number(opening.amount) + entries.reduce((sum, item) => sum + Number(item.signed_amount || 0), 0)) * 100) / 100,
      monthInflow: Math.round(monthInflow * 100) / 100,
      monthOutflow: Math.round(monthOutflow * 100) / 100,
      entries,
    };
  }

  function renderCashForm(type) {
    const opening = type === "opening_balance";
    const needsInvestor = type === "investor_contribution" || type === "investor_return";
    return `<article class="card"><form data-form="cash-entry" data-type="${text(type)}" class="form-grid">
      <div class="field full"><h2>${text(cashTypeLabels[type] || "Операция кассы")}</h2>${opening ? '<p class="muted">Старые оплаты уже входят в этот остаток и повторно не прибавятся.</p>' : ""}</div>
      <label class="field">Сумма, ${text(app.snapshot.settings?.currency || "RUB")}<input name="amount" type="number" min="${opening ? "0" : "0.01"}" step="0.01" required></label>
      ${needsInvestor ? `<label class="field">Инвестор<select name="investor_id" required><option value="">Выберите инвестора</option>${app.snapshot.investors.map((item) => `<option value="${text(item.id)}">${text(item.name)}</option>`).join("")}</select></label>` : ""}
      <label class="field full">Комментарий (необязательно)<textarea name="notes" maxlength="1000" placeholder="${type === "expense" ? "На что потрачено" : type === "owner_withdrawal" ? "Зачем забрали" : ""}"></textarea></label>
      <div class="actions field full"><button type="button" data-action="cancel-form">Отмена</button><button class="primary" type="submit">Сохранить</button></div>
    </form></article>`;
  }

  function renderCash() {
    const summary = getCashSummary();
    if (!summary.initialized) {
      return `<article class="card" style="max-width:680px;border-top:4px solid #0f766e"><div class="muted">Начало учёта</div><h2>Сколько денег уже есть?</h2><p class="muted">Укажите общий остаток наличных и на счетах. Старые оплаты уже входят в него и повторно не прибавятся. Новые оплаты и взносы клиентов будут записываться автоматически.</p>${app.form === "cash-entry" ? renderCashForm("opening_balance") : '<button type="button" class="primary" data-cash-type="opening_balance">Указать остаток</button>'}</article>`;
    }
    const types = [
      ["deposit", "Пополнить"],
      ["investor_contribution", "Вклад инвестора"],
      ["owner_withdrawal", "Забрал с кассы"],
      ["expense", "Расход"],
      ["investor_return", "Возврат инвестору"],
    ];
    const entries = summary.entries.length ? `<div class="list">${summary.entries.map((item) => {
      const operation = app.operations.find((row) => row.command?.type === "cash.transaction.create" && row.command.payload?.transaction?.id === item.id);
      const sign = item.direction === "in" ? "+" : item.direction === "out" ? "−" : "";
      const tone = item.direction === "in" ? 'style="color:#166534"' : item.direction === "out" ? 'style="color:#b91c1c"' : "";
      return `<div class="row"><div><strong>${text(item.label)}</strong>${item.details ? `<div class="muted">${text(item.details)}</div>` : ""}${item.notes ? `<div>${text(item.notes)}</div>` : ""}<div class="muted">${date(item.occurred_at)}${operation ? ' · <span class="badge pending">Ожидает отправки</span>' : ""}</div></div><strong ${tone}>${item.direction === "opening" ? text(money(item.amount)) : `${sign}${text(money(item.amount))}`}</strong></div>`;
    }).join("")}</div>` : '<p class="muted">Операций пока нет.</p>';
    return `<div class="grid">
      <article class="card" style="grid-column:1/-1;background:#0f172a;color:white"><div style="color:#ccfbf1">Деньги в кассе и на счетах</div><div class="stat">${text(money(summary.balance))}</div><div class="muted" style="color:#cbd5e1">За месяц поступило ${text(money(summary.monthInflow))} · снятия и расходы ${text(money(summary.monthOutflow))}</div></article>
      <article class="card"><div class="muted">Поступления за месяц</div><div class="stat">${text(money(summary.monthInflow))}</div></article>
      <article class="card"><div class="muted">Расходы и изъятия за месяц</div><div class="stat">${text(money(summary.monthOutflow))}</div><div class="muted">Чистое движение ${text(money(summary.monthInflow - summary.monthOutflow))}</div></article>
    </div>
    <article class="card"><h2>Добавить движение</h2><p class="muted">Вклады инвестора и возвраты не являются прибылью.</p><div class="actions" style="justify-content:flex-start">${types.map(([type, label]) => `<button type="button" data-cash-type="${type}">${label}</button>`).join("")}</div>${app.form === "cash-entry" ? renderCashForm(app.cashType || "deposit") : ""}</article>
    <article class="card"><h2>История кассы</h2><p class="muted">Учёт начат ${date(summary.entries.find((item) => item.direction === "opening")?.occurred_at)} · ${summary.entries.length} операций</p>${entries}</article>`;
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
        <div><strong>${text(client.full_name)}</strong><div class="muted">${text(client.phone || "Телефон не указан")}</div><div class="muted">${client.address ? `Адрес: ${text(client.address)}` : "Адрес не указан"}</div>${client.notes ? `<div class="muted">${text(client.notes)}</div>` : ""}</div>
        <div class="actions"><span class="badge ${client.is_blacklisted ? "offline" : "online"}">${client.is_blacklisted ? "Чёрный список" : "Активен"}</span>${app.operations.some((item) => item.command?.payload?.client?.id === client.id || item.command?.payload?.clientId === client.id) ? '<span class="badge pending">Не синхр.</span>' : ""}
          <button type="button" data-action="edit-client-address" data-client="${text(client.id)}">Изменить адрес</button>
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
          ? "Скоро срок · " + date(summary.soonDue)
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
    let soonDue = "";
    const dates = [];
    for (const row of app.snapshot.schedules.filter((item) => item.loan_id === loan.id)) {
      const paid = row.status === "paid" ? Number(row.amount) : Number(row.paid_amount || 0);
      const due = Math.max(0, Number(row.amount) - paid);
      if (due <= 0.009) continue;
      remaining += due;
      dates.push(row.due_date);
      if (row.due_date < cutoff) overdue += due;
      else if (row.due_date >= today && row.due_date <= soonThrough) {
        soon += due;
        if (!soonDue || row.due_date < soonDue) soonDue = row.due_date;
      }
    }
    return {
      remaining: Math.round(remaining * 100) / 100,
      overdue: Math.round(overdue * 100) / 100,
      soon: Math.round(soon * 100) / 100,
      nextDue: dates.sort()[0] || "",
      soonDue,
    };
  }

  function dateKey(value) {
    const item = value instanceof Date ? value : new Date(String(value) + "T00:00:00");
    return item.getFullYear() + "-" + String(item.getMonth() + 1).padStart(2, "0") + "-" + String(item.getDate()).padStart(2, "0");
  }

  function csvValue(value) {
    let raw = value == null ? "" : String(value);
    if (typeof value === "string" && /^[\s\uFEFF]*[=+@\-]/.test(raw)) raw = "'" + raw;
    return /[",\t\r\n]/.test(raw) ? '"' + raw.replace(/"/g, '""') + '"' : raw;
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
    const columns = [
      ["organization_id", "ID организации"], ["record_type", "Тип записи"],
      ["loan_id", "ID рассрочки"], ["client_id", "ID клиента"], ["client_name", "ФИО клиента"],
      ["client_phone", "Телефон клиента"], ["client_address", "Адрес клиента"], ["client_notes", "Заметки клиента"],
      ["client_is_blacklisted", "Клиент в чёрном списке"], ["client_blacklist_note", "Причина чёрного списка"],
      ["client_created_at", "Клиент создан"], ["client_offline_version", "Версия клиента"],
      ["investor_id", "ID инвестора"], ["investor_name", "Имя инвестора"], ["investor_share_percent", "Доля инвестора по умолчанию, %"],
      ["investor_notes", "Заметки инвестора"], ["investor_created_at", "Инвестор создан"],
      ["deal_invested_amount", "Вложение инвестора в сделку"],
      ["manager_share_percent", "Доля владельца в сделке, %"], ["deal_investor_share_percent", "Доля инвестора в сделке, %"],
      ["loan_title", "Название / товар"], ["cost_amount", "Цена"], ["markup_percent", "Наценка, %"],
      ["principal", "К возврату"], ["down_payment", "Первоначальный взнос"], ["term_months", "Срок, мес."],
      ["monthly_payment", "Платёж в месяц"], ["schedule_on_full_amount", "График на полную сумму"],
      ["start_date", "Дата начала"], ["loan_status", "Статус рассрочки"], ["loan_created_at", "Создана"],
      ["loan_offline_version", "Версия рассрочки"],
      ["loan_notes", "Заметки по рассрочке"],
      ["guarantor_id", "ID поручителя"], ["guarantor_name", "ФИО поручителя"],
      ["guarantor_phone", "Телефон поручителя"], ["guarantor_address", "Адрес поручителя"],
      ["guarantor_notes", "Заметки поручителя"], ["guarantor_created_at", "Поручитель создан"],
      ["schedule_id", "ID платежа графика"], ["schedule_number", "Номер платежа"],
      ["schedule_due_date", "Срок платежа"], ["schedule_amount", "Сумма по графику"],
      ["schedule_status", "Статус платежа"], ["schedule_paid_amount", "Оплачено по графику"],
      ["schedule_paid_at", "Дата оплаты по графику"], ["schedule_receipt_path", "Путь к чеку графика"],
      ["payment_id", "ID оплаты"], ["payment_schedule_id", "ID платежа графика для оплаты"],
      ["payment_paid_at", "Дата фактической оплаты"], ["payment_amount", "Сумма оплаты"],
      ["payment_method", "Способ оплаты"], ["payment_notes", "Заметки оплаты"],
      ["payment_receipt_path", "Путь к чеку оплаты"], ["payment_idempotency_key", "Ключ идемпотентности оплаты"],
    ];
    const rows = [columns.map(([, label]) => label)];
    const append = (fields) => rows.push(columns.map(([key]) => fields[key] ?? ""));

    for (const loan of app.snapshot.loans) {
      const client = app.snapshot.clients.find((item) => item.id === loan.client_id);
      const investor = app.snapshot.investors.find((item) => item.id === loan.investor_id);
      const guarantors = app.snapshot.guarantors.filter((item) => item.loan_id === loan.id);
      const schedule = app.snapshot.schedules.filter((item) => item.loan_id === loan.id).sort((a, b) => a.sequence_number - b.sequence_number);
      const payments = app.snapshot.payments.filter((item) => item.loan_id === loan.id)
        .sort((a, b) => String(a.paid_at || "").localeCompare(String(b.paid_at || "")));
      append({
        organization_id: loan.organization_id || app.snapshot.organizationId,
        record_type: "loan",
        loan_id: loan.id,
        client_id: loan.client_id,
        client_name: client?.full_name,
        client_phone: client?.phone,
        client_address: client?.address,
        client_notes: client?.notes,
        client_is_blacklisted: client?.is_blacklisted == null ? "" : client.is_blacklisted ? "Да" : "Нет",
        client_blacklist_note: client?.blacklist_note,
        client_created_at: client?.created_at,
        client_offline_version: client?.offline_version,
        investor_id: loan.investor_id,
        investor_name: investor?.name,
        investor_share_percent: investor?.share_percent,
        investor_notes: investor?.notes,
        investor_created_at: investor?.created_at,
        deal_invested_amount: loan.investor_amount,
        manager_share_percent: loan.income_share_manager,
        deal_investor_share_percent: loan.income_share_investor,
        loan_title: loan.title,
        cost_amount: loan.cost_amount,
        markup_percent: loan.markup_percent,
        principal: loan.principal,
        down_payment: loan.down_payment,
        term_months: loan.term_months,
        monthly_payment: loan.monthly_payment,
        schedule_on_full_amount: loan.schedule_on_full_amount,
        start_date: loan.start_date,
        loan_status: loan.status,
        loan_created_at: loan.created_at,
        loan_offline_version: loan.offline_version,
        loan_notes: loan.notes,
      });
      for (const item of guarantors) append({
        organization_id: item.organization_id || loan.organization_id || app.snapshot.organizationId,
        record_type: "guarantor",
        loan_id: loan.id,
        client_id: loan.client_id,
        guarantor_id: item.id,
        guarantor_name: item.full_name,
        guarantor_phone: item.phone,
        guarantor_address: item.address,
        guarantor_notes: item.notes,
        guarantor_created_at: item.created_at,
      });
      for (const item of schedule) append({
        organization_id: item.organization_id || loan.organization_id || app.snapshot.organizationId,
        record_type: "schedule",
        loan_id: loan.id,
        client_id: loan.client_id,
        schedule_id: item.id,
        schedule_number: item.sequence_number,
        schedule_due_date: item.due_date,
        schedule_amount: item.amount,
        schedule_status: item.status,
        schedule_paid_amount: item.paid_amount,
        schedule_paid_at: item.paid_at,
        schedule_receipt_path: item.receipt_path,
      });
      for (const item of payments) append({
        organization_id: item.organization_id || loan.organization_id || app.snapshot.organizationId,
        record_type: "payment",
        loan_id: loan.id,
        client_id: loan.client_id,
        payment_id: item.id,
        payment_schedule_id: item.schedule_id,
        payment_paid_at: item.paid_at,
        payment_amount: item.amount,
        payment_method: item.method,
        payment_notes: item.notes,
        payment_receipt_path: item.receipt_path,
        payment_idempotency_key: item.idempotency_key,
      });
    }

    const loanClientIds = new Set(app.snapshot.loans.map((loan) => loan.client_id));
    for (const client of app.snapshot.clients.filter((item) => !loanClientIds.has(item.id))) {
      append({
        organization_id: client.organization_id || app.snapshot.organizationId,
        record_type: "client",
        client_id: client.id,
        client_name: client.full_name,
        client_phone: client.phone,
        client_address: client.address,
        client_notes: client.notes,
        client_is_blacklisted: client.is_blacklisted ? "Да" : "Нет",
        client_blacklist_note: client.blacklist_note,
        client_created_at: client.created_at,
        client_offline_version: client.offline_version,
      });
    }
    const loanInvestorIds = new Set(app.snapshot.loans.map((loan) => loan.investor_id).filter(Boolean));
    for (const investor of app.snapshot.investors.filter((item) => !loanInvestorIds.has(item.id))) {
      append({
        organization_id: investor.organization_id || app.snapshot.organizationId,
        record_type: "investor",
        investor_id: investor.id,
        investor_name: investor.name,
        investor_share_percent: investor.share_percent,
        investor_notes: investor.notes,
        investor_created_at: investor.created_at,
      });
    }

    const loanIds = new Set(app.snapshot.loans.map((loan) => loan.id));
    const orphanLoanIds = new Set([
      ...app.snapshot.guarantors.map((item) => item.loan_id),
      ...app.snapshot.schedules.map((item) => item.loan_id),
      ...app.snapshot.payments.map((item) => item.loan_id),
    ].filter((loanId) => !loanIds.has(loanId)));
    for (const loanId of orphanLoanIds) {
      const guarantors = app.snapshot.guarantors.filter((item) => item.loan_id === loanId);
      const schedules = app.snapshot.schedules.filter((item) => item.loan_id === loanId).sort((a, b) => a.sequence_number - b.sequence_number);
      const payments = app.snapshot.payments.filter((item) => item.loan_id === loanId).sort((a, b) => String(a.paid_at || "").localeCompare(String(b.paid_at || "")));
      for (const item of guarantors) append({
        organization_id: item.organization_id || app.snapshot.organizationId,
        record_type: "orphan_guarantor",
        loan_id: loanId,
        guarantor_id: item.id,
        guarantor_name: item.full_name,
        guarantor_phone: item.phone,
        guarantor_address: item.address,
        guarantor_notes: item.notes,
        guarantor_created_at: item.created_at,
      });
      for (const item of schedules) append({
        organization_id: item.organization_id || app.snapshot.organizationId,
        record_type: "orphan_schedule",
        loan_id: loanId,
        schedule_id: item.id,
        schedule_number: item.sequence_number,
        schedule_due_date: item.due_date,
        schedule_amount: item.amount,
        schedule_status: item.status,
        schedule_paid_amount: item.paid_amount,
        schedule_paid_at: item.paid_at,
        schedule_receipt_path: item.receipt_path,
      });
      for (const item of payments) append({
        organization_id: item.organization_id || app.snapshot.organizationId,
        record_type: "orphan_payment",
        loan_id: loanId,
        payment_id: item.id,
        payment_schedule_id: item.schedule_id,
        payment_paid_at: item.paid_at,
        payment_amount: item.amount,
        payment_method: item.method,
        payment_notes: item.notes,
        payment_receipt_path: item.receipt_path,
        payment_idempotency_key: item.idempotency_key,
      });
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

  function clientIdForOperation(operation) {
    const payload = operation.command?.payload || {};
    const directClientId = payload.clientId || payload.client?.id || payload.loan?.client_id;
    if (directClientId) return directClientId;
    const loanId = payload.loanId || payload.loan?.id || payload.payment?.loan_id;
    if (!loanId) return null;
    const loan = app.snapshot?.loans.find((item) => item.id === loanId) || app.baseSnapshot?.loans.find((item) => item.id === loanId);
    return loan?.client_id || null;
  }

  function dependenciesForClient(clientId) {
    return app.operations
      .filter((operation) => operation.state !== "conflict" && clientIdForOperation(operation) === clientId)
      .map((operation) => operation.id);
  }

  function clientHasConflict(clientId) {
    return app.operations.some((operation) => operation.state === "conflict" && clientIdForOperation(operation) === clientId);
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

  function renderClientAddressForm(clientId) {
    const client = app.snapshot.clients.find((item) => item.id === clientId);
    if (!client) return '<article class="card"><p>Клиент отсутствует в локальной копии.</p><button type="button" data-action="cancel-form">Назад</button></article>';
    return `<article class="card" style="max-width:560px"><h2>Изменить адрес клиента</h2><p class="muted">${text(client.full_name)}</p><form data-form="client-address-edit" data-client-id="${text(client.id)}" class="form-grid">
      <label class="field full">Адрес клиента<textarea name="address" maxlength="1000" rows="2" autocomplete="street-address">${text(client.address || "")}</textarea></label>
      <div class="actions field full"><button type="button" data-action="cancel-form">Отмена</button><button class="primary" type="submit">Сохранить адрес</button></div>
    </form></article>`;
  }

  function renderLoanForm(loanId = null) {
    const loan = loanId ? app.snapshot.loans.find((item) => item.id === loanId) : null;
    const clients = app.snapshot.clients.filter((client) => !client.is_blacklisted || client.id === loan?.client_id);
    if (!clients.length) return `<article class="card"><h2>Новая рассрочка</h2><p class="muted">Сначала добавьте клиента. Это можно сделать офлайн.</p><button type="button" data-action="new-client">Добавить клиента</button><button type="button" data-action="cancel-form">Отмена</button></article>`;
    const value = (key, fallback = "") => text(loan?.[key] ?? fallback);
    return `<article class="card"><h2>${loan ? "Изменить рассрочку" : "Новая рассрочка"}</h2><form data-form="${loan ? "loan-edit" : "loan-create"}" data-loan-id="${text(loanId || "")}" data-original-principal="${value("principal", "0")}" class="form-grid">
      <label class="field full">Клиент<select name="client_id" required>${clients.map((client) => `<option value="${text(client.id)}" ${client.id === loan?.client_id ? "selected" : ""}>${text(client.full_name)}${client.is_blacklisted ? " · чёрный список" : ""}</option>`).join("")}</select></label>
      <label class="field full">Название / товар<input name="title" maxlength="200" value="${value("title")}" placeholder="Например, холодильник"></label>
      <label class="field">Цена товара<input name="cost_amount" type="number" min="0.01" step="0.01" value="${value("cost_amount")}" ${loan ? "" : "required"}></label>
      <label class="field">Наценка, %<input name="markup_percent" type="number" min="0" step="0.01" value="${value("markup_percent", app.snapshot.settings?.default_markup_percent || 0)}"></label>
      <label class="field full">Сумма к возврату<input name="principal" type="number" min="0.01" step="0.01" required readonly value="${value("principal", "")}"></label>
      <label class="field">Первоначальный взнос<input name="down_payment" type="number" min="0" step="0.01" value="${value("down_payment", "0")}"></label>
      <label class="field">Срок, месяцев<input name="term_months" type="number" min="1" max="120" step="1" required value="${value("term_months", app.snapshot.settings?.default_term_months || 6)}"></label>
      <label class="field">Начало рассрочки<input name="start_date" type="date" required value="${value("start_date", new Date().toISOString().slice(0, 10))}"></label>
      <p class="field full muted">Ежемесячный платёж округляется до ближайших 100 ₽.</p>
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
    const roundingStep = PAYMENT_ROUNDING_STEP;
    const monthlyPayment = Math.max(roundingStep, Math.round((monthlyInput > 0 ? monthlyInput : targetScheduled / termMonths) / roundingStep) * roundingStep);
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
    const target = cost > 0
      ? Math.round(cost * (100 + markup) / 100 * 100) / 100
      : form.dataset.form === "loan-edit"
        ? Number(form.dataset.originalPrincipal) || 0
        : Number(principal.value) || 0;
    const targetScheduled = Math.max(0, target - down);
    const inputMonthly = Number(data.get("monthly_payment")) || 0;
    const roundingStep = PAYMENT_ROUNDING_STEP;
    const monthly = months > 0 ? Math.max(roundingStep, Math.round((inputMonthly > 0 ? inputMonthly : targetScheduled / months) / roundingStep) * roundingStep) : 0;
    const total = months > 0 ? Math.round((down + monthly * months) * 100) / 100 : target;
    if (months > 0 && (cost > 0 || form.dataset.form === "loan-edit")) principal.value = String(total);
    else if (form.dataset.form === "loan-create") principal.value = "";
    let note = form.querySelector("[data-rounding-note]");
    if (!note && principal.parentElement) {
      note = document.createElement("p");
      note.dataset.roundingNote = "true";
      note.className = "field full muted";
      principal.parentElement.insertAdjacentElement("afterend", note);
    }
    if (note && months > 0) {
      const totalChange = Math.round((total - target) * 100) / 100;
      const effectiveMarkup = cost > 0
        ? (() => {
          const effective = Math.round(((total - cost) / cost) * 10000) / 100;
          const change = Math.round((effective - markup) * 100) / 100;
          return effective + "% (" + (change > 0 ? "+" : "") + change + " п.п.)";
        })()
        : "не рассчитывается без исходной цены";
      note.textContent = "Округление до " + roundingStep + " ₽: " + monthly + " ₽ в месяц. Фактическая наценка " + effectiveMarkup +
        ". Сумма к возврату изменится на " +
        (totalChange > 0 ? "+" : "") + totalChange + " ₽.";
    }
  }

  async function handleFormSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.dataset.form) return;
    event.preventDefault();
    try {
      if (form.dataset.form === "cash-entry") {
        const type = form.dataset.type;
        const allowed = ["opening_balance", "deposit", "owner_withdrawal", "expense", "investor_contribution", "investor_return"];
        if (!allowed.includes(type)) throw new Error("Неизвестный тип кассовой операции.");
        if (type === "opening_balance" && app.snapshot.cash_transactions.some((item) => item.transaction_type === "opening_balance")) {
          throw new Error("Начальный остаток уже задан.");
        }
        const values = new FormData(form);
        const amountText = String(values.get("amount") || "").trim();
        const amount = Number(amountText);
        if (!amountText || !Number.isFinite(amount) || amount < 0 || (type !== "opening_balance" && amount <= 0)) {
          throw new Error(type === "opening_balance" ? "Введите остаток не меньше нуля." : "Введите сумму больше нуля.");
        }
        if (type === "opening_balance" && !window.confirm(`Установить начальный остаток ${money(amount)}? Его нельзя будет задать повторно.`)) return;
        const investorId = String(values.get("investor_id") || "").trim() || null;
        const needsInvestor = type === "investor_contribution" || type === "investor_return";
        if (needsInvestor && !app.snapshot.investors.some((item) => item.id === investorId)) throw new Error("Выберите инвестора из сохранённого списка.");
        const notes = String(values.get("notes") || "").trim() || null;
        await enqueue({
          type: "cash.transaction.create",
          payload: {
            transaction: {
              id: crypto.randomUUID(),
              transaction_type: type,
              amount: Math.round(amount * 100) / 100,
              occurred_at: new Date().toISOString(),
              investor_id: investorId,
              notes,
            },
          },
        });
        app.cashType = null;
        app.form = null;
        app.view = "cash";
        render();
        return;
      }

      if (form.dataset.form === "client-address-edit") {
        const clientId = form.dataset.clientId;
        const client = app.snapshot.clients.find((item) => item.id === clientId);
        if (!client) throw new Error("Клиент отсутствует в локальной копии.");
        if (clientHasConflict(clientId)) throw new Error("Сначала разрешите конфликт операций этого клиента на главной странице.");
        const values = new FormData(form);
        const address = String(values.get("address") || "").trim();
        await enqueue({
          type: "client.address",
          payload: { clientId, expectedVersion: Number(client.offline_version || 1), address },
        }, dependenciesForClient(clientId));
        app.clientId = null;
        app.form = null;
        app.view = "clients";
        render();
        return;
      }

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
          cash_recorded_at: new Date().toISOString(),
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
    const cashTypeButton = target.closest("[data-cash-type]");
    if (cashTypeButton) {
      app.cashType = cashTypeButton.getAttribute("data-cash-type");
      app.form = "cash-entry";
      app.view = "cash";
      render();
      return;
    }
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
        app.clientId = null;
        app.cashType = null;
        app.form = null;
        render();
        return;
      }
      if (action === "new-client") {
        app.clientId = null;
        app.form = "client-create";
        app.view = "clients";
        render();
        return;
      }
      if (action === "edit-client-address" && clientId) {
        if (!app.snapshot.clients.some((item) => item.id === clientId)) return;
        if (clientHasConflict(clientId)) {
          window.alert("Сначала разрешите конфликт операций этого клиента на главной странице.");
          return;
        }
        app.clientId = clientId;
        app.form = "client-address-edit";
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
        await enqueue({ type: "client.blacklist", payload: { clientId, expectedVersion: Number(client.offline_version || 1), isBlacklisted: !client.is_blacklisted, blacklistNote: null } }, dependenciesForClient(clientId));
        return;
      }
      if (action === "delete-client" && clientId) {
        const client = app.snapshot.clients.find((item) => item.id === clientId);
        if (!client || app.snapshot.loans.some((loan) => loan.client_id === clientId)) return;
        if (!window.confirm(`Удалить клиента «${client.full_name}» с этого устройства и при синхронизации?`)) return;
        await enqueue({ type: "client.delete", payload: { clientId, expectedVersion: Number(client.offline_version || 1) } }, dependenciesForClient(clientId));
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
    if (app.form === "cash-entry") content.innerHTML = renderCash();
    else if (app.form === "client-create") content.innerHTML = renderClientForm();
    else if (app.form === "client-address-edit") content.innerHTML = renderClientAddressForm(app.clientId);
    else if (app.form === "loan-create") content.innerHTML = renderLoanForm();
    else if (app.form === "loan-edit") content.innerHTML = renderLoanForm(app.loanId);
    else if (app.form === "payment") content.innerHTML = renderPaymentForm(app.loanId);
    else content.innerHTML = app.view === "dashboard"
      ? renderDashboard()
      : app.view === "clients"
        ? renderClients()
        : app.view === "cash"
          ? renderCash()
        : app.loanId
          ? renderLoanDetails()
          : renderLoans();
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
