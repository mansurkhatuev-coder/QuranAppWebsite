(() => {
  "use strict";

  const DB_NAME = "rassrochki-offline-v1";
  const ACTIVE_ACCOUNT_KEY = "rassrochki:offline-account";
  const app = { snapshot: null, operations: [], view: "dashboard", loanId: null };
  const content = document.getElementById("content");
  const syncInfo = document.getElementById("sync-info");
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
      throw new Error("Сначала войдите в приложение с интернетом и подготовьте офлайн-доступ.");
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
      return { snapshot, operations, db };
    } catch (error) {
      db.close();
      throw error;
    }
  }

  function switchView(view) {
    app.view = view;
    app.loanId = null;
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
    if (!rows.length) return '<article class="card">В сохранённой копии нет клиентов.</article>';
    return `<article class="card"><h2>Клиенты (${rows.length})</h2><div class="list">${rows.map((client) => `
      <div class="row">
        <div><strong>${text(client.full_name)}</strong><div class="muted">${text(client.phone || "Телефон не указан")}</div>${client.notes ? `<div class="muted">${text(client.notes)}</div>` : ""}</div>
        <span class="badge ${client.is_blacklisted ? "offline" : "online"}">${client.is_blacklisted ? "Чёрный список" : "Активен"}</span>
      </div>`).join("")}</div></article>`;
  }

  function renderLoans() {
    const rows = [...app.snapshot.loans].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    if (!rows.length) return '<article class="card">В сохранённой копии нет рассрочек.</article>';
    return `<article class="card"><h2>Рассрочки (${rows.length})</h2><div class="list">${rows.map((loan) => `
      <div class="row">
        <div><strong>${text(relatedName(loan.clients) || loan.title || "Рассрочка")}</strong><div class="muted">${text(loan.title || "Товар не указан")} · ${date(loan.start_date)}</div><div class="muted">${text(money(loan.principal))} · ${loan.status === "closed" ? "Закрыта" : "Активна"}</div></div>
        <button type="button" data-loan="${text(loan.id)}">Открыть</button>
      </div>`).join("")}</div></article>`;
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

  function render() {
    if (!app.snapshot) return;
    document.querySelectorAll("nav [data-view]").forEach((button) => {
      button.setAttribute("aria-current", button.dataset.view === app.view ? "page" : "false");
    });
    content.innerHTML = app.view === "dashboard"
      ? renderDashboard()
      : app.view === "clients"
        ? renderClients()
        : app.loanId
          ? renderLoanDetails()
          : renderLoans();
  }

  function updateNetworkState() {
    const online = navigator.onLine;
    networkState.textContent = online ? "Есть интернет" : "Без сети";
    networkState.className = `badge ${online ? "online" : "offline"}`;
    onlineAction.style.display = online ? "block" : "none";
  }

  async function start() {
    updateNetworkState();
    window.addEventListener("online", updateNetworkState);
    window.addEventListener("offline", updateNetworkState);
    document.querySelectorAll("nav [data-view]").forEach((button) => {
      button.addEventListener("click", () => switchView(button.dataset.view));
    });
    content.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const loanButton = target.closest("[data-loan]");
      if (loanButton) {
        app.loanId = loanButton.getAttribute("data-loan");
        app.view = "loans";
        render();
      } else if (target.closest("[data-back-to-loans]")) {
        app.loanId = null;
        render();
      }
    });

    try {
      const { snapshot, operations, db } = await loadAccount();
      db.close();
      if (!snapshot) throw new Error("Нет сохранённых данных. Подключитесь к интернету и подготовьте офлайн-доступ.");
      app.snapshot = snapshot;
      app.operations = operations || [];
      orgName.textContent = snapshot.organization?.name || "Сохранённая копия";
      const pending = app.operations.filter((item) => item.state !== "conflict").length;
      const conflicts = app.operations.filter((item) => item.state === "conflict").length;
      const syncedAt = new Date(snapshot.syncedAt).toLocaleString("ru-RU");
      syncInfo.innerHTML = `<strong>Копия от ${text(syncedAt)}</strong>${pending ? ` · ожидают отправки: ${pending}` : ""}${conflicts ? ` · конфликтов: ${conflicts}` : ""}`;
      if (!navigator.onLine) syncInfo.classList.add("warning");
      render();
    } catch (error) {
      syncInfo.classList.add("warning");
      syncInfo.textContent = error instanceof Error ? error.message : "Не удалось загрузить офлайн-данные.";
      content.innerHTML = '<article class="card"><a class="button" href="/login">Войти после восстановления интернета</a></article>';
    }
  }

  void start();
})();
