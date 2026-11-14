import { describe, expect, it } from "vitest";
import { applyPendingOperations, pendingCounts } from "./model";
import type { OfflineOperation, OfflineSnapshot } from "./types";

function baseSnapshot(): OfflineSnapshot {
  return {
    userId: "user-1",
    organizationId: "org-1",
    syncedAt: "2026-11-14T10:00:00.000Z",
    organization: null,
    settings: null,
    clients: [],
    loans: [{ id: "loan-1", organization_id: "org-1" }],
    schedules: [
      {
        id: "schedule-1",
        loan_id: "loan-1",
        organization_id: "org-1",
        amount: 100,
        paid_amount: 0,
        status: "pending",
      },
    ],
    payments: [],
    guarantors: [{ id: "guarantor-1", loan_id: "loan-1" }],
    investors: [],
  } as unknown as OfflineSnapshot;
}

function op(
  id: string,
  type: string,
  payload: Record<string, unknown>,
  state: OfflineOperation["state"] = "pending"
): OfflineOperation {
  return {
    id,
    userId: "user-1",
    organizationId: "org-1",
    createdAt: "2026-11-14T11:00:00.000Z",
    command: { type, payload },
    state,
    attempts: 0,
    lastError: null,
  } as OfflineOperation;
}

describe("offline local projections", () => {
  it("projects a queued payment into its schedule and history", () => {
    const snapshot = baseSnapshot();
    const payment = {
      id: "local-payment-1",
      loan_id: "loan-1",
      organization_id: "org-1",
      schedule_id: "schedule-1",
      amount: 40,
      paid_at: "2026-11-14T12:00:00.000Z",
      method: "manual",
      notes: null,
      receipt_path: null,
      idempotency_key: "payment-op-1",
    };

    const result = applyPendingOperations(snapshot, [
      op("payment-op-1", "payment.record", { payment, scheduleId: "schedule-1" }),
    ]);

    expect(result.payments).toHaveLength(1);
    expect(result.schedules[0].paid_amount).toBe(40);
    expect(result.schedules[0].status).toBe("pending");
  });

  it("does not project a payment twice if the server snapshot already includes its key", () => {
    const snapshot = baseSnapshot();
    const payment = {
      id: "payment-server-1",
      loan_id: "loan-1",
      organization_id: "org-1",
      schedule_id: "schedule-1",
      amount: 40,
      paid_at: "2026-11-14T12:00:00.000Z",
      method: "manual",
      notes: null,
      receipt_path: null,
      idempotency_key: "payment-op-1",
    };
    snapshot.payments = [payment] as OfflineSnapshot["payments"];
    snapshot.schedules[0].paid_amount = 40;

    const result = applyPendingOperations(snapshot, [
      op("payment-op-1", "payment.record", { payment, scheduleId: "schedule-1" }),
    ]);

    expect(result.payments).toHaveLength(1);
    expect(result.schedules[0].paid_amount).toBe(40);
  });

  it("distributes a queued payment across later schedule rows like the server RPC", () => {
    const snapshot = baseSnapshot();
    snapshot.schedules.push({
      ...snapshot.schedules[0],
      id: "schedule-2",
      sequence_number: 2,
      amount: 50,
      paid_amount: 0,
    });
    const payment = {
      id: "local-payment-2",
      loan_id: "loan-1",
      organization_id: "org-1",
      schedule_id: "schedule-1",
      amount: 120,
      paid_at: "2026-11-14T12:00:00.000Z",
      method: "manual",
      notes: null,
      receipt_path: null,
      idempotency_key: "payment-op-2",
    };

    const result = applyPendingOperations(snapshot, [
      op("payment-op-2", "payment.record", { payment, scheduleId: "schedule-1" }),
    ]);

    expect(result.schedules.map((row) => row.paid_amount)).toEqual([100, 20]);
    expect(result.schedules.map((row) => row.status)).toEqual(["paid", "pending"]);
  });

  it("replaces the schedule rows when projecting an edited loan", () => {
    const snapshot = baseSnapshot();
    const changedSchedule = {
      ...snapshot.schedules[0],
      due_date: "2027-01-15",
      amount: 125,
    };

    const result = applyPendingOperations(snapshot, [
      op("loan-edit-1", "loan.update", {
        loan: { id: "loan-1", organization_id: "org-1" },
        schedules: [changedSchedule],
        guarantors: [],
      }),
    ]);

    expect(result.schedules).toEqual([changedSchedule]);
  });

  it("hides a loan and its children for a queued deletion", () => {
    const result = applyPendingOperations(baseSnapshot(), [
      op("delete-op-1", "loan.delete", { loanId: "loan-1" }),
    ]);

    expect(result.loans).toEqual([]);
    expect(result.schedules).toEqual([]);
    expect(result.guarantors).toEqual([]);
  });

  it("counts pending and conflicting operations separately", () => {
    const result = pendingCounts([
      op("op-1", "client.create", {}),
      op("op-2", "payment.record", {}, "conflict"),
    ]);

    expect(result).toEqual({ pending: 1, syncing: 0, conflict: 1 });
  });
});
