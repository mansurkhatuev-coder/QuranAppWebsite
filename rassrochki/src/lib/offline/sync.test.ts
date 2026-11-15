import "fake-indexeddb/auto";
import { afterEach } from "vitest";
import { describe, expect, it } from "vitest";
import { createOfflineStore } from "./db";
import {
  applySyncResponse,
  getClientOperationDependencies,
  orderOperationsForSync,
  parseSyncBatch,
  syncOfflineQueue,
} from "./sync";
import type { OfflineOperation, OfflineSnapshot } from "./types";

let databaseNumber = 0;
const stores: ReturnType<typeof createOfflineStore>[] = [];

function makeStore() {
  const store = createOfflineStore({ databaseName: `rassrochki-sync-test-${databaseNumber++}` });
  stores.push(store);
  return store;
}

function snapshot(userId = "user-1", organizationId = "org-1"): OfflineSnapshot {
  return {
    userId,
    organizationId,
    syncedAt: "2026-11-14T12:00:00.000Z",
    organization: null,
    settings: null,
    clients: [],
    loans: [],
    schedules: [],
    payments: [],
    guarantors: [],
    investors: [],
  } as unknown as OfflineSnapshot;
}

function operation(
  id: string,
  createdAt: string,
  dependsOn: string[] = []
): OfflineOperation {
  return {
    id,
    userId: "user-1",
    organizationId: "org-1",
    createdAt,
    dependsOn,
    command: { type: "client.create", payload: {} },
    state: "pending",
    attempts: 0,
    lastError: null,
  };
}

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
});

describe("offline sync operation order", () => {
  it("rejects sync commands scoped to a different account", () => {
    expect(() =>
      parseSyncBatch(
        {
          operations: [
            {
              id: "123e4567-e89b-42d3-a456-426614174000",
              userId: "other-user",
              organizationId: "org-1",
              command: { type: "client.create", payload: { client: { id: "c-1" } } },
            },
          ],
        },
        "user-1",
        "org-1"
      )
    ).toThrow(/another account/i);
  });

  it("accepts only bounded, allowlisted commands for the active account", () => {
    const batch = parseSyncBatch(
      {
        operations: [
          {
            id: "123e4567-e89b-42d3-a456-426614174000",
            userId: "user-1",
            organizationId: "org-1",
            command: { type: "client.create", payload: { client: { id: "c-1" } } },
          },
        ],
      },
      "user-1",
      "org-1"
    );
    expect(batch).toHaveLength(1);
    expect(() => parseSyncBatch({ operations: Array(26).fill({}) }, "user-1", "org-1")).toThrow(/25/);
    expect(() =>
      parseSyncBatch(
        {
          operations: [
            {
              id: "123e4567-e89b-42d3-a456-426614174000",
              userId: "user-1",
              organizationId: "org-1",
              command: { type: "admin.delete-all", payload: {} },
            },
          ],
        },
        "user-1",
        "org-1"
      )
    ).toThrow(/unsupported/i);
  });

  it("accepts client address updates and rejects unknown commands", () => {
    const addressCommand = parseSyncBatch(
      {
        operations: [
          {
            id: "123e4567-e89b-42d3-a456-426614174000",
            userId: "user-1",
            organizationId: "org-1",
            command: {
              type: "client.address",
              payload: { clientId: "client-1", expectedVersion: 3, address: "Новая улица, 10" },
            },
          },
        ],
      },
      "user-1",
      "org-1"
    );

    expect(addressCommand[0].command.type).toBe("client.address");
    expect(() =>
      parseSyncBatch(
        {
          operations: [
            {
              id: "123e4567-e89b-42d3-a456-426614174000",
              userId: "user-1",
              organizationId: "org-1",
              command: { type: "client.rename-everything", payload: {} },
            },
          ],
        },
        "user-1",
        "org-1"
      )
    ).toThrow(/unsupported/i);
  });

  it("finds same-client dependencies through queued loans and snapshot loans", () => {
    const loanDelete = operation("loan-delete", "2026-11-14T09:00:00.000Z");
    loanDelete.command = { type: "loan.delete", payload: { loanId: "snapshot-loan" } };
    const loanCreate = operation("loan-create", "2026-11-14T10:00:00.000Z");
    loanCreate.command = {
      type: "loan.create",
      payload: { loan: { id: "queued-loan", client_id: "client-1" } },
    };
    const payment = operation("payment", "2026-11-14T11:00:00.000Z");
    payment.command = {
      type: "payment.record",
      payload: { payment: { loan_id: "queued-loan" } },
    };
    const unrelated = operation("other-client-loan", "2026-11-14T12:00:00.000Z");
    unrelated.command = {
      type: "loan.create",
      payload: { loan: { id: "other-loan", client_id: "client-2" } },
    };

    expect(
      getClientOperationDependencies(
        [loanDelete, loanCreate, payment, unrelated],
        "client-1",
        [{ id: "snapshot-loan", client_id: "client-1" }]
      )
    ).toEqual(["loan-delete", "loan-create", "payment"]);
  });

  it("sends a dependency before a child even when the child has an earlier timestamp", () => {
    const child = operation("loan-op", "2026-11-14T09:00:00.000Z", ["client-op"]);
    const dependency = operation("client-op", "2026-11-14T10:00:00.000Z");

    expect(orderOperationsForSync([child, dependency]).map((item) => item.id)).toEqual([
      "client-op",
      "loan-op",
    ]);
  });

  it("keeps unrelated operations in chronological order", () => {
    const later = operation("later", "2026-11-14T11:00:00.000Z");
    const earlier = operation("earlier", "2026-11-14T09:00:00.000Z");

    expect(orderOperationsForSync([later, earlier]).map((item) => item.id)).toEqual([
      "earlier",
      "later",
    ]);
  });

  it("rejects cyclic queue dependencies instead of sending an unsafe order", () => {
    expect(() =>
      orderOperationsForSync([
        operation("first", "2026-11-14T09:00:00.000Z", ["second"]),
        operation("second", "2026-11-14T10:00:00.000Z", ["first"]),
      ])
    ).toThrow(/cycle/i);
  });

  it("stores the fresh snapshot before removing synced commands and keeps conflicts visible", async () => {
    const store = makeStore();
    const dependency = operation("client-op", "2026-11-14T09:00:00.000Z");
    const child = operation("loan-op", "2026-11-14T10:00:00.000Z", ["client-op"]);
    await store.enqueue(dependency);
    await store.enqueue(child);

    await applySyncResponse({
      store,
      userId: "user-1",
      organizationId: "org-1",
      sentOperations: [dependency, child],
      results: [
        { operationId: "client-op", status: "synced" },
        { operationId: "loan-op", status: "conflict", message: "Версия записи изменилась" },
      ],
      snapshot: snapshot(),
    });

    expect(await store.getSnapshot("user-1", "org-1")).not.toBeNull();
    expect(await store.listOperations("user-1", "org-1")).toMatchObject([
      { id: "loan-op", state: "conflict", lastError: "Версия записи изменилась" },
    ]);
  });

  it("rejects another account's snapshot without removing any queued commands", async () => {
    const store = makeStore();
    const command = operation("client-op", "2026-11-14T09:00:00.000Z");
    await store.enqueue(command);

    await expect(
      applySyncResponse({
        store,
        userId: "user-1",
        organizationId: "org-1",
        sentOperations: [command],
        results: [{ operationId: "client-op", status: "synced" }],
        snapshot: snapshot("user-2", "org-1"),
      })
    ).rejects.toThrow(/another account/i);
    expect(await store.listOperations("user-1", "org-1")).toHaveLength(1);
  });

  it("preserves the receipt blob and queued payment when its upload fails", async () => {
    const store = makeStore();
    const payment = operation("123e4567-e89b-42d3-a456-426614174000", "2026-11-14T09:00:00.000Z");
    payment.command = {
      type: "payment.record",
      payload: { payment: { loan_id: "loan-1", receipt_path: null } },
    };
    await store.enqueue(payment);
    await store.putReceipt(payment.id, "user-1", "org-1", new Blob(["receipt"]), "receipt.jpg");

    await syncOfflineQueue({
      store,
      userId: "user-1",
      organizationId: "org-1",
      fetcher: async (_input, init) => {
        if (init?.method === "POST") throw new Error("sync should not run after upload failure");
        return new Response(JSON.stringify({ complete: true, snapshot: snapshot() }), { status: 200 });
      },
      uploadReceipt: async () => { throw new Error("storage unavailable"); },
    });

    expect(await store.listOperations("user-1", "org-1")).toMatchObject([
      { id: payment.id, state: "pending", lastError: expect.stringMatching(/чек/i) },
    ]);
    expect(await store.getReceipt(payment.id, "user-1", "org-1")).not.toBeNull();
  });

  it("keeps retryable server failures pending while making conflicts explicit", async () => {
    const store = makeStore();
    const retry = operation("retry", "2026-11-14T09:00:00.000Z");
    const conflict = operation("conflict", "2026-11-14T10:00:00.000Z");
    await store.enqueue(retry);
    await store.enqueue(conflict);

    await applySyncResponse({
      store,
      userId: "user-1",
      organizationId: "org-1",
      sentOperations: [retry, conflict],
      results: [
        { operationId: "retry", status: "failed", message: "Временно недоступно" },
        { operationId: "conflict", status: "conflict", message: "Версия изменилась" },
      ],
      snapshot: snapshot(),
    });

    expect(await store.listOperations("user-1", "org-1")).toMatchObject([
      { id: "retry", state: "pending" },
      { id: "conflict", state: "conflict" },
    ]);
  });
});
