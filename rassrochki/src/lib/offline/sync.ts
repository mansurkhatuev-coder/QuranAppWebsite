import type { OfflineOperation, OfflineSnapshot } from "./types";
import type { OfflineStore } from "./db";
import { parseSnapshotEnvelope } from "./snapshot";
import type { OfflineReceipt } from "./types";

export type OfflineSyncResult = {
  operationId: string;
  status: "synced" | "conflict" | "failed";
  message?: string;
  [key: string]: unknown;
};

export type OfflineSyncCommand = Pick<OfflineOperation, "id" | "userId" | "organizationId" | "command"> & {
  createdAt?: string;
  dependsOn?: string[];
};

const SYNCABLE_COMMANDS = new Set([
  "client.create",
  "client.blacklist",
  "client.address",
  "client.delete",
  "loan.create",
  "loan.edit",
  "payment.record",
  "cash.transaction.create",
  "loan.delete",
]);

export function getClientOperationDependencies(
  operations: OfflineOperation[],
  clientId: string,
  loans: Array<Pick<OfflineSnapshot["loans"][number], "id" | "client_id">>
): string[] {
  const clientIdByLoanId = new Map(loans.map((loan) => [loan.id, loan.client_id]));

  for (const operation of operations) {
    const payload = operation.command.payload;
    const loan = isRecord(payload.loan) ? payload.loan : {};
    const loanId = typeof payload.loanId === "string"
      ? payload.loanId
      : typeof loan.id === "string"
        ? loan.id
        : null;
    if (loanId && typeof loan.client_id === "string") {
      clientIdByLoanId.set(loanId, loan.client_id);
    }
  }

  return operations
    .filter((operation) => {
      if (operation.state === "conflict") return false;
      const payload = operation.command.payload;
      const client = isRecord(payload.client) ? payload.client : {};
      const loan = isRecord(payload.loan) ? payload.loan : {};
      const payment = isRecord(payload.payment) ? payload.payment : {};
      const directClientId = typeof payload.clientId === "string"
        ? payload.clientId
        : typeof client.id === "string"
          ? client.id
          : typeof loan.client_id === "string"
            ? loan.client_id
            : null;
      if (directClientId === clientId) return true;

      const loanIds = [payload.loanId, loan.id, payment.loan_id]
        .filter((value): value is string => typeof value === "string");
      return loanIds.some((loanId) => clientIdByLoanId.get(loanId) === clientId);
    })
    .map((operation) => operation.id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseSyncBatch(
  value: unknown,
  userId: string,
  organizationId: string
): OfflineSyncCommand[] {
  if (!isRecord(value) || !Array.isArray(value.operations)) {
    throw new Error("Offline sync batch is invalid");
  }
  if (value.operations.length > 25) throw new Error("Offline sync batch exceeds 25 operations");

  const ids = new Set<string>();
  return value.operations.map((candidate) => {
    if (!isRecord(candidate) || !isRecord(candidate.command) || !isRecord(candidate.command.payload)) {
      throw new Error("Offline sync operation is invalid");
    }
    const { id, userId: ownerId, organizationId: ownerOrganizationId } = candidate;
    if (ownerId !== userId || ownerOrganizationId !== organizationId) {
      throw new Error("Offline operation belongs to another account or organization");
    }
    if (
      typeof id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ||
      ids.has(id)
    ) {
      throw new Error("Offline operation ID is invalid or duplicated");
    }
    ids.add(id);
    if (typeof candidate.command.type !== "string" || !SYNCABLE_COMMANDS.has(candidate.command.type)) {
      throw new Error("Offline operation command is unsupported");
    }
    if (
      candidate.dependsOn !== undefined &&
      (!Array.isArray(candidate.dependsOn) || candidate.dependsOn.some((dependency) => typeof dependency !== "string"))
    ) {
      throw new Error("Offline operation dependencies are invalid");
    }
    return {
      id,
      userId,
      organizationId,
      command: { type: candidate.command.type, payload: candidate.command.payload },
      ...(typeof candidate.createdAt === "string" ? { createdAt: candidate.createdAt } : {}),
      ...(Array.isArray(candidate.dependsOn) ? { dependsOn: candidate.dependsOn as string[] } : {}),
    };
  });
}

function byCreation(a: OfflineOperation, b: OfflineOperation): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

export function orderOperationsForSync(operations: OfflineOperation[]): OfflineOperation[] {
  const byId = new Map<string, OfflineOperation>();
  for (const operation of operations) {
    if (byId.has(operation.id)) throw new Error("Offline queue contains duplicate operation IDs");
    byId.set(operation.id, operation);
  }

  const dependencies = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const operation of operations) {
    const relevant = (operation.dependsOn ?? []).filter((dependencyId) => {
      const dependency = byId.get(dependencyId);
      if (!dependency) return false;
      if (
        dependency.userId !== operation.userId ||
        dependency.organizationId !== operation.organizationId
      ) {
        throw new Error("Offline queue dependency belongs to another account");
      }
      return true;
    });
    dependencies.set(operation.id, relevant.length);
    for (const dependencyId of relevant) {
      const dependentIds = children.get(dependencyId) ?? [];
      dependentIds.push(operation.id);
      children.set(dependencyId, dependentIds);
    }
  }

  const ready = operations.filter((operation) => dependencies.get(operation.id) === 0).sort(byCreation);
  const ordered: OfflineOperation[] = [];
  while (ready.length > 0) {
    const current = ready.shift()!;
    ordered.push(current);
    for (const childId of children.get(current.id) ?? []) {
      const remaining = (dependencies.get(childId) ?? 1) - 1;
      dependencies.set(childId, remaining);
      if (remaining === 0) {
        ready.push(byId.get(childId)!);
        ready.sort(byCreation);
      }
    }
  }

  if (ordered.length !== operations.length) throw new Error("Offline queue dependency cycle detected");
  return ordered;
}

export async function applySyncResponse(input: {
  store: OfflineStore;
  userId: string;
  organizationId: string;
  sentOperations: OfflineOperation[];
  results: OfflineSyncResult[];
  snapshot: OfflineSnapshot;
}): Promise<void> {
  const { store, userId, organizationId, sentOperations, results, snapshot } = input;
  if (snapshot.userId !== userId || snapshot.organizationId !== organizationId) {
    throw new Error("Sync response contains a snapshot for another account");
  }

  const sentIds = new Set(sentOperations.map((operation) => operation.id));
  if (sentIds.size !== sentOperations.length) throw new Error("Sync response request has duplicate operation IDs");
  const resultIds = new Set<string>();
  for (const result of results) {
    if (!sentIds.has(result.operationId) || resultIds.has(result.operationId)) {
      throw new Error("Sync response does not match the submitted operations");
    }
    resultIds.add(result.operationId);
  }

  // Keep queued commands until a complete, correctly scoped snapshot is safely stored.
  await store.putSnapshot(snapshot);
  for (const operation of sentOperations) {
    const result = results.find((item) => item.operationId === operation.id);
    if (!result) {
      await store.updateOperation(operation.id, userId, organizationId, {
        state: "pending",
        attempts: operation.attempts + 1,
        lastError: "Сервер не подтвердил результат операции",
      });
      continue;
    }
    if (result.status === "synced") {
      await store.removeOperation(operation.id, userId, organizationId);
    } else if (result.status === "conflict") {
      await store.updateOperation(operation.id, userId, organizationId, {
        state: "conflict",
        attempts: operation.attempts + 1,
        lastError: result.message ?? "Нужно разрешить конфликт данных",
      });
    } else {
      await store.updateOperation(operation.id, userId, organizationId, {
        state: "pending",
        attempts: operation.attempts + 1,
        lastError: result.message ?? "Не удалось отправить операцию. Повторим позже.",
      });
    }
  }
}

export async function syncOfflineQueue(input: {
  store: OfflineStore;
  userId: string;
  organizationId: string;
  fetcher?: typeof fetch;
  uploadReceipt?: (receipt: OfflineReceipt, path: string) => Promise<void>;
}): Promise<void> {
  const { store, userId, organizationId, uploadReceipt } = input;
  const fetcher = input.fetcher ?? fetch;
  const queued = await store.listOperations(userId, organizationId);
  const pending = orderOperationsForSync(queued.filter((operation) => operation.state !== "conflict"));
  const sentOperations = pending.slice(0, 25);
  if (sentOperations.length === 0) return;

  await Promise.all(sentOperations.map((operation) =>
    store.updateOperation(operation.id, userId, organizationId, { state: "syncing", lastError: null })
  ));

  const prepared: OfflineOperation[] = [];
  const results: OfflineSyncResult[] = [];
  const failedIds = new Set(
    queued.filter((operation) => operation.state === "conflict").map((operation) => operation.id)
  );
  for (const operation of sentOperations) {
    if ((operation.dependsOn ?? []).some((dependencyId) => failedIds.has(dependencyId))) {
      results.push({
        operationId: operation.id,
        status: "conflict",
        message: "Предыдущая операция ожидает разрешения конфликта",
      });
      failedIds.add(operation.id);
      continue;
    }

    let command = operation.command;
    if (command.type === "payment.record") {
      const payment = command.payload.payment as Record<string, unknown> | undefined;
      const receipt = await store.getReceipt(operation.id, userId, organizationId);
      if (receipt) {
        const loanId = typeof payment?.loan_id === "string" ? payment.loan_id : "";
        if (!loanId || !uploadReceipt) {
          results.push({ operationId: operation.id, status: "failed", message: "Чек сохранён на устройстве, но пока не удалось подключить его отправку." });
          failedIds.add(operation.id);
          continue;
        }
        const extension = receipt.fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const path = `${organizationId}/${loanId}/${operation.id}.${extension}`;
        try {
          await uploadReceipt(receipt, path);
        } catch {
          results.push({ operationId: operation.id, status: "failed", message: "Не удалось загрузить чек. Файл и оплата сохранены для повтора." });
          failedIds.add(operation.id);
          continue;
        }
        command = {
          ...command,
          payload: {
            ...command.payload,
            payment: { ...payment, receipt_path: path },
          },
        };
      } else if (payment?.receipt_path === null && payment?.method === "transfer_with_receipt") {
        results.push({ operationId: operation.id, status: "failed", message: "Локальный файл чека не найден. Оплата оставлена в очереди." });
        failedIds.add(operation.id);
        continue;
      }
    }
    prepared.push({ ...operation, command });
  }

  if (prepared.length > 0) {
    try {
      const response = await fetcher("/api/offline/sync", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ operations: prepared }),
      });
      if (!response.ok) throw new Error("sync request failed");
      const body: unknown = await response.json();
      if (isRecord(body) && Array.isArray(body.results)) {
        for (const result of body.results) {
          if (
            isRecord(result) &&
            typeof result.operationId === "string" &&
            (result.status === "synced" || result.status === "conflict" || result.status === "failed")
          ) {
            results.push(result as OfflineSyncResult);
          }
        }
      }
    } catch {
      for (const operation of prepared) {
        results.push({
          operationId: operation.id,
          status: "failed",
          message: "Связь с сервером прервалась. Операция сохранена для повтора.",
        });
      }
    }
  }

  try {
    const snapshotResponse = await fetcher("/api/offline/snapshot", {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!snapshotResponse.ok) throw new Error("snapshot refresh failed");
    const snapshot = parseSnapshotEnvelope(await snapshotResponse.json(), userId, organizationId);
    await applySyncResponse({ store, userId, organizationId, sentOperations, results, snapshot });
  } catch (error) {
    await Promise.all(sentOperations.map((operation) =>
      store.updateOperation(operation.id, userId, organizationId, {
        state: "pending",
        attempts: operation.attempts + 1,
        lastError: "Не удалось получить свежий снимок. Операции останутся в очереди и будут повторены безопасно.",
      })
    ));
    throw error;
  }
}
