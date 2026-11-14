import { describe, expect, it, vi } from "vitest";
import { deliverExportFile, isAppleMobileBrowser, type FileExportEnvironment } from "@/lib/file-export";

function makeFile() {
  return Object.assign(
    new Blob(["date,amount\n01.12.2026,1000"], { type: "text/csv;charset=utf-8" }),
    { name: "schedule.csv" }
  ) as File;
}

function makeEnvironment(overrides: Partial<FileExportEnvironment> = {}): FileExportEnvironment {
  return {
    appleMobile: true,
    canShareFiles: vi.fn(() => true),
    shareFile: vi.fn(async () => undefined),
    downloadFile: vi.fn(),
    ...overrides,
  };
}

describe("export file delivery", () => {
  it("detects iPadOS when Safari reports a Mac platform", () => {
    expect(isAppleMobileBrowser({ userAgent: "Mozilla/5.0 Macintosh", platform: "MacIntel", maxTouchPoints: 5 })).toBe(true);
    expect(isAppleMobileBrowser({ userAgent: "Mozilla/5.0 Macintosh", platform: "MacIntel", maxTouchPoints: 0 })).toBe(false);
  });

  it("uses the iOS share sheet for a file the browser can share", async () => {
    const environment = makeEnvironment();

    const result = await deliverExportFile(makeFile(), environment);

    expect(result).toBe("shared");
    expect(environment.shareFile).toHaveBeenCalledOnce();
    expect(environment.downloadFile).not.toHaveBeenCalled();
  });

  it("downloads the file when native file sharing is unavailable", async () => {
    const environment = makeEnvironment({ appleMobile: false });

    const result = await deliverExportFile(makeFile(), environment);

    expect(result).toBe("downloaded");
    expect(environment.downloadFile).toHaveBeenCalledOnce();
    expect(environment.shareFile).not.toHaveBeenCalled();
  });

  it("does not download again when the user closes the share sheet", async () => {
    const environment = makeEnvironment({
      shareFile: vi.fn(async () => { throw new DOMException("Cancelled", "AbortError"); }),
    });

    const result = await deliverExportFile(makeFile(), environment);

    expect(result).toBe("cancelled");
    expect(environment.downloadFile).not.toHaveBeenCalled();
  });
});
