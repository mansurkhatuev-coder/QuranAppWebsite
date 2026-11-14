import { describe, expect, it } from "vitest";
import { buildOfflineReceiptPath, validateOfflineReceipt } from "./receipt";

describe("offline receipt upload", () => {
  it("uses a deterministic org/loan/operation path", () => {
    expect(buildOfflineReceiptPath({
      organizationId: "123e4567-e89b-42d3-a456-426614174000",
      loanId: "223e4567-e89b-42d3-a456-426614174000",
      operationId: "323e4567-e89b-42d3-a456-426614174000",
      mimeType: "image/jpeg",
    })).toBe("123e4567-e89b-42d3-a456-426614174000/223e4567-e89b-42d3-a456-426614174000/323e4567-e89b-42d3-a456-426614174000.jpg");
  });

  it("accepts supported receipt files up to 8 MB and rejects unsupported or oversized files", () => {
    expect(validateOfflineReceipt({ mimeType: "application/pdf", size: 8 * 1024 * 1024 })).toBe("pdf");
    expect(() => validateOfflineReceipt({ mimeType: "image/svg+xml", size: 100 })).toThrow(/format/i);
    expect(() => validateOfflineReceipt({ mimeType: "image/jpeg", size: 8 * 1024 * 1024 + 1 })).toThrow(/8 MB/i);
  });
});
