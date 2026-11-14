import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { createOfflineStore } from "./db";
import type { OfflineOperation, OfflineSnapshot } from "./types";

let databaseNumber = 0;
const stores: ReturnType<typeof createOfflineStore>[] = [];

function makeStore() {
  const store = createOfflineStore({ databaseName: `rassrochki-test-${databaseNumber++}` });
  stores.push(store);
  return store;
}

function snapshot(userId: string, organizationId: string): OfflineSnapshot {
  return {
    userId,
    organizationId,
    syncedAt: "2026-11-14T10:00:00.000Z",
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

function operation(overrides: Partial<OfflineOperation> = {}): OfflineOperation {
  return {
    id: "op-1",
    userId: "user-1",
    organizationId: "org-1",
    createdAt: "2026-11-14T10:00:00.000Z",
    command: { type: "client.create", payload: { id: "client-1" } },
    state: "pending",
    attempts: 0,
    lastError: null,
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
});

describe("offline IndexedDB store", () => {
  it("keeps snapshots isolated by user and organization", async () => {
    const store = makeStore();
    const first = snapshot("user-1", "org-1");
    const otherOrg = snapshot("user-1", "org-2");

    await store.putSnapshot(first);
    await store.putSnapshot(otherOrg);

    expect(await store.getSnapshot("user-1", "org-1")).toEqual(first);
    expect(await store.getSnapshot("user-2", "org-1")).toBeNull();
    expect(await store.getSnapshot("user-1", "org-2")).toEqual(otherOrg);
  });

  it("orders queued commands and treats an identical operation retry as one entry", async () => {
    const store = makeStore();
    const earlier = operation({ id: "op-early", createdAt: "2026-11-14T09:00:00.000Z" });
    const later = operation({ id: "op-late", createdAt: "2026-11-14T11:00:00.000Z" });

    await store.enqueue(later);
    await store.enqueue(earlier);
    await store.enqueue(earlier);

    expect((await store.listOperations("user-1", "org-1")).map((item) => item.id)).toEqual([
      "op-early",
      "op-late",
    ]);
  });

  it("rejects reuse of an operation id with a different payload", async () => {
    const store = makeStore();
    await store.enqueue(operation());

    await expect(
      store.enqueue(
        operation({ command: { type: "client.create", payload: { id: "different-client" } } })
      )
    ).rejects.toThrow(/operation id/i);
  });

  it("updates a queued command only for its owning account", async () => {
    const store = makeStore();
    await store.enqueue(operation());

    await store.updateOperation("op-1", "user-1", "org-1", {
      state: "conflict",
      attempts: 2,
      lastError: "Версия записи изменилась",
    });
    await store.updateOperation("op-1", "user-2", "org-1", {
      state: "pending",
      lastError: null,
    });

    expect(await store.listOperations("user-1", "org-1")).toMatchObject([
      { id: "op-1", state: "conflict", attempts: 2, lastError: "Версия записи изменилась" },
    ]);
    expect(await store.listOperations("user-2", "org-1")).toEqual([]);
  });

  it("stores a deterministic receipt path on its queued payment before sync", async () => {
    const store = makeStore();
    await store.enqueue(operation({ command: { type: "payment.record", payload: { payment: { receipt_path: null } } } }));
    await store.updateOperation("op-1", "user-1", "org-1", {
      command: { type: "payment.record", payload: { payment: { receipt_path: "org-1/loan-1/op-1.jpg" } } },
    });
    expect(await store.listOperations("user-1", "org-1")).toMatchObject([
      { command: { payload: { payment: { receipt_path: "org-1/loan-1/op-1.jpg" } } } },
    ]);
  });

  it("keeps receipt blobs until the owning operation is removed", async () => {
    const store = makeStore();
    const file = new Blob(["receipt"], { type: "image/jpeg" });
    await store.enqueue(operation());
    await store.putReceipt("op-1", "user-1", "org-1", file, "receipt.jpg");

    const stored = await store.getReceipt("op-1", "user-1", "org-1");
    expect(stored?.blob).toBeInstanceOf(Blob);
    expect(await stored?.blob.text()).toBe("receipt");

    await store.removeOperation("op-1", "user-1", "org-1");
    expect(await store.getReceipt("op-1", "user-1", "org-1")).toBeNull();
  });

  it("clears only one account's snapshot, commands, and receipts", async () => {
    const store = makeStore();
    await store.putSnapshot(snapshot("user-1", "org-1"));
    await store.putSnapshot(snapshot("user-1", "org-2"));
    await store.enqueue(operation());
    await store.enqueue(operation({ id: "other-org", organizationId: "org-2" }));
    await store.putReceipt("op-1", "user-1", "org-1", new Blob(["one"]), "one.jpg");
    await store.putReceipt("other-org", "user-1", "org-2", new Blob(["two"]), "two.jpg");

    await store.clearAccount("user-1", "org-1");

    expect(await store.getSnapshot("user-1", "org-1")).toBeNull();
    expect(await store.getSnapshot("user-1", "org-2")).not.toBeNull();
    expect(await store.listOperations("user-1", "org-1")).toEqual([]);
    expect((await store.listOperations("user-1", "org-2")).map((item) => item.id)).toEqual([
      "other-org",
    ]);
    expect(await store.getReceipt("op-1", "user-1", "org-1")).toBeNull();
    expect(await store.getReceipt("other-org", "user-1", "org-2")).not.toBeNull();
  });
});
