import { describe, expect, it } from "vitest";
import { getOfflineStatus } from "./status";

describe("offline status copy", () => {
  it("explains that the local copy is keeping work available without a network", () => {
    expect(
      getOfflineStatus({ online: false, syncing: false, cachedAt: "2026-11-15T08:00:00.000Z", pendingCount: 0, conflictCount: 0 })
    ).toEqual({ label: "Нет сети · данные сохранены", tone: "warning" });
  });

  it("shows when edits are waiting to be sent", () => {
    expect(
      getOfflineStatus({ online: true, syncing: false, cachedAt: "2026-11-15T08:00:00.000Z", pendingCount: 2, conflictCount: 0 })
    ).toEqual({ label: "Ждут отправки: 2", tone: "warning" });
  });

  it("shows when the device has no saved copy yet", () => {
    expect(
      getOfflineStatus({ online: false, syncing: false, cachedAt: null, pendingCount: 0, conflictCount: 0 })
    ).toEqual({ label: "Нет сети · копии нет", tone: "danger" });
  });
});
