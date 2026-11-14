import { describe, expect, it, vi } from "vitest";
import { parseSnapshotEnvelope, readAllPages } from "./snapshot";

describe("offline snapshot helpers", () => {
  it("reads every page in order and stops after the final short page", async () => {
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      data: [0, 1, 2, 3, 4].slice(from, to + 1),
      error: null,
    }));

    await expect(readAllPages(fetchPage, 2)).resolves.toEqual([0, 1, 2, 3, 4]);
    expect(fetchPage.mock.calls).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
  });

  it("rejects the entire read if a page fails instead of returning a partial snapshot", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: [1, 2], error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("offline") });

    await expect(readAllPages(fetchPage, 2)).rejects.toThrow("offline");
  });

  it("rejects a null page even when the query did not provide an error", async () => {
    await expect(readAllPages(async () => ({ data: null, error: null }), 2)).rejects.toThrow(
      /page/i
    );
  });

  it("accepts only a complete snapshot for the current account and organization", () => {
    const snapshot = {
      userId: "user-1",
      organizationId: "org-1",
      syncedAt: "2026-11-14T10:00:00.000Z",
      organization: null,
      settings: null,
      clients: [],
      loans: [],
      schedules: [],
      payments: [],
      guarantors: [],
      investors: [],
    };
    const envelope = { complete: true, snapshot };

    expect(parseSnapshotEnvelope(envelope, "user-1", "org-1")).toEqual(snapshot);
    expect(() => parseSnapshotEnvelope({ complete: false, snapshot }, "user-1", "org-1")).toThrow(
      /complete/i
    );
    expect(() => parseSnapshotEnvelope(envelope, "user-2", "org-1")).toThrow(/account/i);
  });
});
