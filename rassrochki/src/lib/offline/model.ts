import type { OfflineOperation, OfflineOperationCounts, OfflineSnapshot } from "./types";

type Payload = Record<string, unknown>;

function record(value: unknown): Payload {
  return value && typeof value === "object" ? (value as Payload) : {};
}

function array<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function idOf(value: unknown): string | null {
  const id = record(value).id;
  return typeof id === "string" ? id : null;
}

function replaceById<T extends { id: string }>(rows: T[], value: T): T[] {
  const index = rows.findIndex((row) => row.id === value.id);
  if (index < 0) return [...rows, value];
  return rows.map((row, rowIndex) => (rowIndex === index ? value : row));
}

function applyPayment(snapshot: OfflineSnapshot, operation: OfflineOperation, payload: Payload): void {
  const payment = record(payload.payment) as OfflineSnapshot["payments"][number];
  const paymentKey = payment.idempotency_key || operation.id;
  if (snapshot.payments.some((row) => row.idempotency_key === paymentKey)) return;
  if (!payment.id || !payment.loan_id || !payment.amount) return;

  const startId = typeof payload.scheduleId === "string" ? payload.scheduleId : payment.schedule_id;
  const start = snapshot.schedules.find((row) => row.id === startId);
  if (!start) return;

  snapshot.payments = [...snapshot.payments, { ...payment, idempotency_key: paymentKey }];

  let remaining = Number(payment.amount);
  const scheduleRows = snapshot.schedules
    .filter((row) => row.loan_id === payment.loan_id)
    .sort((a, b) => a.sequence_number - b.sequence_number);
  const startIndex = scheduleRows.findIndex((row) => row.id === start.id);

  for (const row of scheduleRows.slice(Math.max(0, startIndex))) {
    if (remaining <= 0.009) break;
    const oldPaid = Math.max(
      Number(row.paid_amount ?? 0),
      row.status === "paid" ? Number(row.amount) : 0
    );
    const due = Math.max(0, Math.round((Number(row.amount) - oldPaid) * 100) / 100);
    if (due <= 0.009) continue;

    const applied = Math.min(remaining, due);
    const paid = Math.round((oldPaid + applied) * 100) / 100;
    remaining = Math.round((remaining - applied) * 100) / 100;
    snapshot.schedules = snapshot.schedules.map((candidate) =>
      candidate.id === row.id
        ? {
            ...candidate,
            paid_amount: paid,
            paid_at: payment.paid_at,
            status: paid + 0.009 >= Number(candidate.amount) ? "paid" : candidate.status,
          }
        : candidate
    );
  }
}

export function applyPendingOperations(
  source: OfflineSnapshot,
  operations: OfflineOperation[]
): OfflineSnapshot {
  const snapshot: OfflineSnapshot = {
    ...source,
    clients: [...source.clients],
    loans: [...source.loans],
    schedules: [...source.schedules],
    payments: [...source.payments],
    guarantors: [...source.guarantors],
    investors: [...source.investors],
  };

  for (const operation of operations) {
    if (
      operation.userId !== snapshot.userId ||
      operation.organizationId !== snapshot.organizationId
    ) {
      continue;
    }

    const payload = record(operation.command.payload);
    switch (operation.command.type) {
      case "client.create": {
        const client = record(payload.client) as OfflineSnapshot["clients"][number];
        if (client.id && !snapshot.clients.some((row) => row.id === client.id)) {
          snapshot.clients = [...snapshot.clients, client];
        }
        break;
      }
      case "client.blacklist": {
        const clientId = String(payload.clientId ?? "");
        snapshot.clients = snapshot.clients.map((client) =>
          client.id === clientId
            ? {
                ...client,
                is_blacklisted: Boolean(payload.isBlacklisted),
                blacklist_note:
                  typeof payload.blacklistNote === "string" ? payload.blacklistNote : null,
              }
            : client
        );
        break;
      }
      case "client.delete": {
        const clientId = String(payload.clientId ?? "");
        if (!snapshot.loans.some((loan) => loan.client_id === clientId)) {
          snapshot.clients = snapshot.clients.filter((client) => client.id !== clientId);
        }
        break;
      }
      case "loan.create":
      case "loan.update": {
        const loan = record(payload.loan) as OfflineSnapshot["loans"][number];
        const loanId = idOf(loan);
        if (!loanId) break;
        snapshot.loans = replaceById(snapshot.loans, loan);
        const schedules = array<OfflineSnapshot["schedules"][number]>(payload.schedules);
        if (Array.isArray(payload.schedules)) {
          snapshot.schedules = [
            ...snapshot.schedules.filter((item) => item.loan_id !== loanId),
            ...schedules,
          ];
        }
        const guarantors = array<OfflineSnapshot["guarantors"][number]>(payload.guarantors);
        if (payload.guarantors) {
          snapshot.guarantors = [
            ...snapshot.guarantors.filter((item) => item.loan_id !== loanId),
            ...guarantors,
          ];
        }
        break;
      }
      case "payment.record":
        applyPayment(snapshot, operation, payload);
        break;
      case "loan.delete": {
        const loanId = String(payload.loanId ?? "");
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

export function pendingCounts(operations: OfflineOperation[]): OfflineOperationCounts {
  return operations.reduce<OfflineOperationCounts>(
    (counts, operation) => {
      counts[operation.state] += 1;
      return counts;
    },
    { pending: 0, syncing: 0, conflict: 0 }
  );
}
