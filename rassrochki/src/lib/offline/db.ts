import type { OfflineOperation, OfflineReceipt, OfflineSnapshot } from "./types";

const DB_VERSION = 1;
const DEFAULT_DB_NAME = "rassrochki-offline-v1";
type StoreName = "snapshots" | "operations" | "receiptFiles";

type OfflineStoreOptions = {
  databaseName?: string;
  indexedDBFactory?: IDBFactory;
};

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameOperation(existing: OfflineOperation, incoming: OfflineOperation): boolean {
  return (
    existing.userId === incoming.userId &&
    existing.organizationId === incoming.organizationId &&
    stableJson(existing.command) === stableJson(incoming.command)
  );
}

export class OfflineStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly databaseName = DEFAULT_DB_NAME,
    private readonly factory?: IDBFactory
  ) {}

  private database(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    const factory = this.factory ?? globalThis.indexedDB;
    if (!factory) throw new Error("IndexedDB is unavailable in this browser");

    this.dbPromise = new Promise((resolve, reject) => {
      const request = factory.open(this.databaseName, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        const snapshots = db.createObjectStore("snapshots", {
          keyPath: ["userId", "organizationId"],
        });
        snapshots.createIndex("byAccount", ["userId", "organizationId"], { unique: true });

        const operations = db.createObjectStore("operations", { keyPath: "id" });
        operations.createIndex("byAccount", ["userId", "organizationId"]);
        operations.createIndex("byCreatedAt", "createdAt");

        const receipts = db.createObjectStore("receiptFiles", { keyPath: "operationId" });
        receipts.createIndex("byAccount", ["userId", "organizationId"]);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB"));
      request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked by another tab"));
    });

    return this.dbPromise;
  }

  private async transaction<T>(
    stores: StoreName | StoreName[],
    mode: IDBTransactionMode,
    action: (transaction: IDBTransaction) => Promise<T>
  ): Promise<T> {
    const db = await this.database();
    const tx = db.transaction(stores, mode);
    const done = transactionDone(tx);
    try {
      const result = await action(tx);
      await done;
      return result;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // The transaction may already have completed or aborted.
      }
      await done.catch(() => undefined);
      throw error;
    }
  }

  async putSnapshot(snapshot: OfflineSnapshot): Promise<void> {
    await this.transaction("snapshots", "readwrite", async (tx) => {
      await requestResult(tx.objectStore("snapshots").put(snapshot));
    });
  }

  async getSnapshot(userId: string, organizationId: string): Promise<OfflineSnapshot | null> {
    return this.transaction("snapshots", "readonly", async (tx) => {
      const result = await requestResult<OfflineSnapshot | undefined>(
        tx.objectStore("snapshots").get([userId, organizationId])
      );
      return result ?? null;
    });
  }

  async enqueue(operation: OfflineOperation): Promise<void> {
    await this.transaction("operations", "readwrite", async (tx) => {
      const store = tx.objectStore("operations");
      const existing = await requestResult<OfflineOperation | undefined>(store.get(operation.id));
      if (existing) {
        if (!sameOperation(existing, operation)) {
          throw new Error("Operation ID was already used with a different payload");
        }
        return;
      }
      await requestResult(store.add(operation));
    });
  }

  async listOperations(userId: string, organizationId: string): Promise<OfflineOperation[]> {
    const rows = await this.transaction("operations", "readonly", async (tx) =>
      requestResult<OfflineOperation[]>(
        tx.objectStore("operations").index("byAccount").getAll([userId, organizationId])
      )
    );
    return rows.sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
    );
  }

  async updateOperation(
    operationId: string,
    userId: string,
    organizationId: string,
    patch: Partial<Pick<OfflineOperation, "state" | "attempts" | "lastError">>
  ): Promise<void> {
    await this.transaction("operations", "readwrite", async (tx) => {
      const store = tx.objectStore("operations");
      const current = await requestResult<OfflineOperation | undefined>(store.get(operationId));
      if (!current || current.userId !== userId || current.organizationId !== organizationId) return;
      await requestResult(store.put({ ...current, ...patch }));
    });
  }

  async removeOperation(operationId: string, userId: string, organizationId: string): Promise<void> {
    await this.transaction(["operations", "receiptFiles"], "readwrite", async (tx) => {
      const operation = await requestResult<OfflineOperation | undefined>(
        tx.objectStore("operations").get(operationId)
      );
      if (!operation || operation.userId !== userId || operation.organizationId !== organizationId) {
        return;
      }
      await requestResult(tx.objectStore("operations").delete(operationId));
      const receipt = await requestResult<OfflineReceipt | undefined>(
        tx.objectStore("receiptFiles").get(operationId)
      );
      if (receipt?.userId === userId && receipt.organizationId === organizationId) {
        await requestResult(tx.objectStore("receiptFiles").delete(operationId));
      }
    });
  }

  async putReceipt(
    operationId: string,
    userId: string,
    organizationId: string,
    blob: Blob,
    fileName: string
  ): Promise<void> {
    await this.transaction(["operations", "receiptFiles"], "readwrite", async (tx) => {
      const operation = await requestResult<OfflineOperation | undefined>(
        tx.objectStore("operations").get(operationId)
      );
      if (!operation || operation.userId !== userId || operation.organizationId !== organizationId) {
        throw new Error("Receipt must belong to a queued operation for this account");
      }
      const receipt: OfflineReceipt = {
        operationId,
        userId,
        organizationId,
        blob,
        fileName,
        mimeType: blob.type || "application/octet-stream",
      };
      await requestResult(tx.objectStore("receiptFiles").put(receipt));
    });
  }

  async getReceipt(
    operationId: string,
    userId: string,
    organizationId: string
  ): Promise<OfflineReceipt | null> {
    return this.transaction("receiptFiles", "readonly", async (tx) => {
      const receipt = await requestResult<OfflineReceipt | undefined>(
        tx.objectStore("receiptFiles").get(operationId)
      );
      return receipt?.userId === userId && receipt.organizationId === organizationId
        ? receipt
        : null;
    });
  }

  async clearAccount(userId: string, organizationId: string): Promise<void> {
    await this.transaction(["snapshots", "operations", "receiptFiles"], "readwrite", async (tx) => {
      await requestResult(tx.objectStore("snapshots").delete([userId, organizationId]));
      for (const storeName of ["operations", "receiptFiles"] as const) {
        const store = tx.objectStore(storeName);
        const keys = await requestResult<IDBValidKey[]>(
          store.index("byAccount").getAllKeys([userId, organizationId])
        );
        await Promise.all(keys.map((key) => requestResult(store.delete(key))));
      }
    });
  }

  async close(): Promise<void> {
    if (!this.dbPromise) return;
    const db = await this.dbPromise.catch(() => null);
    db?.close();
    this.dbPromise = null;
  }
}

export function createOfflineStore(options: OfflineStoreOptions = {}): OfflineStore {
  return new OfflineStore(options.databaseName, options.indexedDBFactory);
}

let browserStore: OfflineStore | null = null;

export function getOfflineStore(): OfflineStore {
  if (typeof window === "undefined") throw new Error("Offline storage is available in the browser only");
  browserStore ??= createOfflineStore();
  return browserStore;
}
