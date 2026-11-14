const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

export function validateOfflineReceipt(input: { mimeType: string; size: number }): string {
  const extension = EXTENSION_BY_MIME[input.mimeType];
  if (!extension) throw new Error("Unsupported receipt format");
  if (!Number.isFinite(input.size) || input.size <= 0 || input.size > MAX_RECEIPT_BYTES) {
    throw new Error("Receipt must be between 1 byte and 8 MB");
  }
  return extension;
}

export function buildOfflineReceiptPath(input: {
  organizationId: string;
  loanId: string;
  operationId: string;
  mimeType: string;
}): string {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (![input.organizationId, input.loanId, input.operationId].every((value) => uuid.test(value))) {
    throw new Error("Receipt path identifiers are invalid");
  }
  const extension = validateOfflineReceipt({ mimeType: input.mimeType, size: 1 });
  return `${input.organizationId}/${input.loanId}/${input.operationId}.${extension}`;
}
