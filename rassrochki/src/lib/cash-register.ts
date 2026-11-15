import type {
  CashTransaction,
  CashTransactionType,
  Investor,
  LoanWithRelations,
  Payment,
} from "@/types/database";

export type CashLedgerDirection = "in" | "out" | "opening";

export type CashLedgerEntry = {
  id: string;
  transactionType: CashTransactionType | "loan_payment" | "down_payment";
  occurredAt: string;
  amount: number;
  signedAmount: number;
  direction: CashLedgerDirection;
  label: string;
  details: string;
  notes: string | null;
};

export type CashRegisterSummary = {
  initialized: boolean;
  openingBalance: number;
  startedAt: string | null;
  balance: number;
  monthInflow: number;
  monthOutflow: number;
  entries: CashLedgerEntry[];
};

const TYPE_META: Record<CashTransactionType, { label: string; direction: CashLedgerDirection }> = {
  opening_balance: { label: "Начальный остаток", direction: "opening" },
  deposit: { label: "Пополнение", direction: "in" },
  owner_withdrawal: { label: "Забрал с кассы", direction: "out" },
  expense: { label: "Расход", direction: "out" },
  investor_contribution: { label: "Вклад инвестора", direction: "in" },
  investor_return: { label: "Возврат инвестору", direction: "out" },
};

function relatedName(value: unknown): string {
  if (Array.isArray(value)) {
    const row = value[0];
    return row && typeof row === "object" && "name" in row ? String(row.name ?? "") : "";
  }
  return value && typeof value === "object" && "name" in value
    ? String(value.name ?? "")
    : "";
}

function clientName(loan: LoanWithRelations): string {
  const client = loan.clients;
  if (Array.isArray(client)) return client[0]?.full_name ?? "";
  return client?.full_name ?? "";
}

export function cashTransactionLabel(type: CashTransactionType): string {
  return TYPE_META[type].label;
}

export function buildCashRegisterSummary(input: {
  loans: LoanWithRelations[];
  payments: Payment[];
  transactions?: CashTransaction[];
  investors?: Investor[];
  now?: Date;
}): CashRegisterSummary {
  const transactions = input.transactions ?? [];
  const opening = transactions.find((entry) => entry.transaction_type === "opening_balance");
  if (!opening) {
    return {
      initialized: false,
      openingBalance: 0,
      startedAt: null,
      balance: 0,
      monthInflow: 0,
      monthOutflow: 0,
      entries: [],
    };
  }

  const startedAt = Date.parse(opening.occurred_at);
  const safeStart = Number.isFinite(startedAt) ? startedAt : 0;
  const loansById = new Map(input.loans.map((loan) => [loan.id, loan]));
  const investorsById = new Map((input.investors ?? []).map((investor) => [investor.id, investor]));
  const entries: CashLedgerEntry[] = [
    {
      id: opening.id,
      transactionType: "opening_balance",
      occurredAt: opening.occurred_at,
      amount: Number(opening.amount) || 0,
      signedAmount: 0,
      direction: "opening",
      label: TYPE_META.opening_balance.label,
      details: "Начало учёта денег, уже находившихся в кассе и на счетах",
      notes: opening.notes,
    },
  ];

  for (const transaction of transactions) {
    if (
      transaction.id === opening.id ||
      transaction.transaction_type === "opening_balance" ||
      Date.parse(transaction.occurred_at) < safeStart
    ) continue;
    const meta = TYPE_META[transaction.transaction_type];
    const investorName =
      relatedName(transaction.investors) || investorsById.get(transaction.investor_id ?? "")?.name || "";
    const details = investorName
      ? `Инвестор: ${investorName}`
      : transaction.transaction_type === "deposit"
        ? "Дополнительное поступление"
        : "";
    const amount = Number(transaction.amount) || 0;
    entries.push({
      id: transaction.id,
      transactionType: transaction.transaction_type,
      occurredAt: transaction.occurred_at,
      amount,
      signedAmount: meta.direction === "in" ? amount : -amount,
      direction: meta.direction,
      label: meta.label,
      details,
      notes: transaction.notes,
    });
  }

  for (const loan of input.loans) {
    const recordedAt = loan.down_payment_recorded_at || loan.created_at;
    if (Date.parse(recordedAt) < safeStart) continue;
    const amount = Number(loan.down_payment) || 0;
    if (amount <= 0) continue;
    const who = clientName(loan) || loan.title || "Рассрочка";
    entries.push({
      id: `down-payment:${loan.id}`,
      transactionType: "down_payment",
      occurredAt: recordedAt,
      amount,
      signedAmount: amount,
      direction: "in",
      label: "Первоначальный взнос",
      details: who,
      notes: null,
    });
  }

  for (const payment of input.payments) {
    const recordedAt = payment.cash_recorded_at || payment.paid_at;
    if (Date.parse(recordedAt) < safeStart) continue;
    const loan = loansById.get(payment.loan_id);
    if (!loan) continue;
    const amount = Number(payment.amount) || 0;
    if (amount <= 0) continue;
    entries.push({
      id: `payment:${payment.id}`,
      transactionType: "loan_payment",
      occurredAt: recordedAt,
      amount,
      signedAmount: amount,
      direction: "in",
      label: "Оплата по рассрочке",
      details: clientName(loan) || loan.title || "Рассрочка",
      notes: payment.notes,
    });
  }

  entries.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || a.id.localeCompare(b.id));
  const current = input.now ?? new Date();
  const isCurrentMonth = (entry: CashLedgerEntry) => {
    const date = new Date(entry.occurredAt);
    return date.getFullYear() === current.getFullYear() && date.getMonth() === current.getMonth();
  };
  const balance = Number(opening.amount) + entries.reduce((sum, entry) => sum + entry.signedAmount, 0);
  const monthInflow = entries
    .filter((entry) => entry.direction === "in" && isCurrentMonth(entry))
    .reduce((sum, entry) => sum + entry.amount, 0);
  const monthOutflow = entries
    .filter((entry) => entry.direction === "out" && isCurrentMonth(entry))
    .reduce((sum, entry) => sum + entry.amount, 0);

  return {
    initialized: true,
    openingBalance: Number(opening.amount) || 0,
    startedAt: opening.occurred_at,
    balance: Math.round(balance * 100) / 100,
    monthInflow: Math.round(monthInflow * 100) / 100,
    monthOutflow: Math.round(monthOutflow * 100) / 100,
    entries,
  };
}
