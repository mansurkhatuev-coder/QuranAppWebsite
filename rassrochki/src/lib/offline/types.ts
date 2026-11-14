import type {
  Client,
  Investor,
  LoanGuarantor,
  LoanWithRelations,
  Organization,
  OrganizationSettings,
  Payment,
  PaymentSchedule,
} from "@/types/database";

export type OfflineSnapshot = {
  userId: string;
  organizationId: string;
  syncedAt: string;
  organization: Organization | null;
  settings: OrganizationSettings | null;
  clients: Client[];
  loans: LoanWithRelations[];
  schedules: PaymentSchedule[];
  payments: Payment[];
  guarantors: LoanGuarantor[];
  investors: Investor[];
};

export type OfflineOperationState = "pending" | "syncing" | "conflict";

export type OfflineCommand = {
  type: string;
  payload: Record<string, unknown>;
};

export type OfflineOperation = {
  id: string;
  userId: string;
  organizationId: string;
  createdAt: string;
  dependsOn?: string[];
  command: OfflineCommand;
  state: OfflineOperationState;
  attempts: number;
  lastError: string | null;
};

export type OfflineReceipt = {
  operationId: string;
  userId: string;
  organizationId: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
};

export type OfflineOperationCounts = Record<OfflineOperationState, number>;
