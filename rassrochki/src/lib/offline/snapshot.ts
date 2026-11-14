import type { OfflineSnapshot } from "./types";

type PageResult<T> = {
  data: T[] | null;
  error: unknown | null;
};

export async function readAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 500
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error("Page size must be a positive integer");
  }

  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const result = await fetchPage(from, from + pageSize - 1);
    if (result.error) {
      throw result.error instanceof Error ? result.error : new Error("Snapshot page could not be loaded");
    }
    if (!result.data) throw new Error("Snapshot page returned no data");
    const page = result.data;
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseSnapshotEnvelope(
  value: unknown,
  userId: string,
  organizationId: string
): OfflineSnapshot {
  if (!isRecord(value) || value.complete !== true || !isRecord(value.snapshot)) {
    throw new Error("Offline snapshot is not complete");
  }

  const snapshot = value.snapshot;
  if (snapshot.userId !== userId || snapshot.organizationId !== organizationId) {
    throw new Error("Offline snapshot belongs to another account or organization");
  }
  if (
    typeof snapshot.syncedAt !== "string" ||
    !Number.isFinite(Date.parse(snapshot.syncedAt)) ||
    !["clients", "loans", "schedules", "payments", "guarantors", "investors"].every(
      (key) => Array.isArray(snapshot[key])
    ) ||
    !(snapshot.settings === null || isRecord(snapshot.settings)) ||
    !(snapshot.organization === null || isRecord(snapshot.organization))
  ) {
    throw new Error("Offline snapshot data is incomplete");
  }

  return snapshot as unknown as OfflineSnapshot;
}
