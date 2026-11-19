import { classifyDebtSchedules } from "@/lib/debtor-filter";
import { formatDateShort, loanEndDate } from "@/lib/utils";
import { createXlsxFile, type XlsxSheet } from "@/lib/xlsx-export";
import type { Client, Investor, Loan, LoanGuarantor, Payment, PaymentSchedule } from "@/types/database";

export type LoanExportData = {
  loans: Loan[];
  clients: Client[];
  investors: Investor[];
  guarantors: LoanGuarantor[];
  schedules: PaymentSchedule[];
  payments: Payment[];
};

function buildLoansSheet(data: LoanExportData, loans: Loan[]): XlsxSheet {
  const clientById = new Map(data.clients.map((client) => [client.id, client]));
  const investorById = new Map(data.investors.map((investor) => [investor.id, investor]));
  const guarantorsByLoan = new Map<string, LoanGuarantor[]>();
  for (const guarantor of data.guarantors) {
    guarantorsByLoan.set(guarantor.loan_id, [...(guarantorsByLoan.get(guarantor.loan_id) ?? []), guarantor]);
  }
  return {
    name: "Рассрочки",
    rows: [[
      "ID рассрочки", "ID клиента", "ID инвестора", "Инвестор", "Клиент", "Телефон клиента", "Адрес клиента",
      "Поручители", "Телефоны поручителей", "Адреса поручителей", "Товар / услуга", "Цена", "Наценка, %",
      "К возврату", "Первоначальный взнос", "Срок, мес.", "Платёж в месяц", "Дата начала", "Дата окончания",
      "Статус", "Вложение инвестора", "Доля владельца, %", "Доля инвестора, %", "Заметки", "Списано",
    ], ...loans.map((loan) => {
      const client = clientById.get(loan.client_id);
      const guarantors = guarantorsByLoan.get(loan.id) ?? [];
      return [
        loan.id, loan.client_id, loan.investor_id ?? "", investorById.get(loan.investor_id ?? "")?.name ?? "",
        client?.full_name ?? "", client?.phone ?? "", client?.address ?? "",
        guarantors.map((row) => row.full_name).join("; "),
        guarantors.map((row) => row.phone ?? "").join("; "),
        guarantors.map((row) => row.address ?? "").join("; "), loan.title ?? "",
        Number(loan.cost_amount ?? 0), Number(loan.markup_percent), Number(loan.principal),
        Number(loan.down_payment), Number(loan.term_months), Number(loan.monthly_payment),
        formatDateShort(loan.start_date),
        loanEndDate(loan.start_date, loan.term_months)
          ? formatDateShort(loanEndDate(loan.start_date, loan.term_months)!)
          : "—",
        loan.status === "closed" ? "Закрыта" : "Активна", Number(loan.investor_amount ?? 0),
        Number(loan.income_share_manager), Number(loan.income_share_investor), loan.notes ?? "", Number(loan.debt_written_off ?? 0),
      ];
    })],
  };
}

function buildPaymentSheets(data: LoanExportData, loans: Loan[]): XlsxSheet[] {
  const loanIds = new Set(loans.map((loan) => loan.id));
  const clientIds = new Set(loans.map((loan) => loan.client_id));
  const schedules = data.schedules.filter((row) => loanIds.has(row.loan_id));
  const payments = data.payments.filter((row) => loanIds.has(row.loan_id));
  const clients = data.clients.filter((client) => clientIds.has(client.id));
  const guarantors = data.guarantors.filter((row) => loanIds.has(row.loan_id));
  const loanLabel = new Map(loans.map((loan) => [loan.id, loan.title ?? loan.id]));
  const clientLabel = new Map(clients.map((client) => [client.id, client.full_name]));

  return [
    buildLoansSheet(data, loans),
    {
      name: "Клиенты",
      rows: [["ID клиента", "ФИО", "Телефон", "Адрес", "Заметки", "В чёрном списке", "Причина"], ...clients.map((client) => [
        client.id, client.full_name, client.phone ?? "", client.address ?? "", client.notes ?? "",
        client.is_blacklisted ? "Да" : "Нет", client.blacklist_note ?? "",
      ])],
    },
    {
      name: "Поручители",
      rows: [["ID поручителя", "ID рассрочки", "Рассрочка", "ФИО", "Телефон", "Адрес", "Заметки"], ...guarantors.map((row) => [
        row.id, row.loan_id, loanLabel.get(row.loan_id) ?? "", row.full_name,
        row.phone ?? "", row.address ?? "", row.notes ?? "",
      ])],
    },
    {
      name: "Инвесторы",
      rows: [["ID инвестора", "Имя", "Доля, %", "Заметки"], ...data.investors.map((investor) => [
        investor.id, investor.name, Number(investor.share_percent), investor.notes ?? "",
      ])],
    },
    {
      name: "График",
      rows: [["ID платежа", "ID рассрочки", "Клиент", "№", "Дата", "Исходная сумма", "Оплачено", "Остаток", "Статус", "Дата оплаты", "Чек", "Списано"], ...schedules.map((row) => [
        row.id, row.loan_id, clientLabel.get(loans.find((loan) => loan.id === row.loan_id)?.client_id ?? "") ?? "",
        Number(row.sequence_number), formatDateShort(row.due_date), Number(row.amount) + Number(row.written_off_amount ?? 0),
        Number(row.paid_amount ?? (row.status === "paid" ? row.amount : 0)),
        Math.max(0, Number(row.amount) - Number(row.paid_amount ?? (row.status === "paid" ? row.amount : 0))),
        row.status === "paid" ? Number(row.written_off_amount) > 0 ? "Закрыт списанием" : "Оплачен" : row.status === "overdue" ? "Просрочен" : "Ожидает",
        row.paid_at ? formatDateShort(row.paid_at.slice(0, 10)) : "", row.receipt_path ?? "", Number(row.written_off_amount ?? 0),
      ])],
    },
    {
      name: "Списания",
      rows: [["ID рассрочки", "Дата", "Сумма", "Причина", "Режим", "Прибыль владельца", "Прибыль инвестора", "Капитал владельца", "Капитал инвестора", "Администратор"], ...loans.flatMap((loan) => (loan.writeoff_history ?? []).map((entry) => [
        loan.id, entry.occurred_at, entry.amount, entry.reason, entry.mode, entry.owner_profit_loss, entry.investor_profit_loss, entry.owner_capital_loss, entry.investor_capital_loss, entry.actor_id,
      ]))],
    },
    {
      name: "Оплаты",
      rows: [["ID оплаты", "ID рассрочки", "Клиент", "ID платежа", "Дата", "Сумма", "Способ", "Заметки", "Чек"], ...payments.map((row) => [
        row.id, row.loan_id, clientLabel.get(loans.find((loan) => loan.id === row.loan_id)?.client_id ?? "") ?? "",
        row.schedule_id ?? "",
        formatDateShort(row.paid_at.slice(0, 10)), Number(row.amount), row.method ?? "", row.notes ?? "", row.receipt_path ?? "",
      ])],
    },
  ];
}

export function createFullLoanExport(data: LoanExportData) {
  return createXlsxFile("rassrochki_full.xlsx", buildPaymentSheets(data, data.loans));
}

export function createDebtorsExport(
  data: LoanExportData,
  loans: Loan[],
  overdueDays: number,
  overdueOnly = false,
  currentDate: Date | string = new Date()
) {
  const clientById = new Map(data.clients.map((client) => [client.id, client]));
  const guarantorsByLoan = new Map<string, LoanGuarantor[]>();
  for (const guarantor of data.guarantors) {
    guarantorsByLoan.set(guarantor.loan_id, [...(guarantorsByLoan.get(guarantor.loan_id) ?? []), guarantor]);
  }
  const debtors = loans.map((loan) => {
    const schedules = data.schedules.filter((row) => row.loan_id === loan.id);
    return { loan, schedules, summary: classifyDebtSchedules(schedules, overdueDays, currentDate) };
  }).filter(({ summary }) => summary.remainingAmount > 0 && (!overdueOnly || summary.overdueAmount > 0));
  const debtorIds = new Set(debtors.map(({ loan }) => loan.id));
  const rows = [[
    "Клиент", "Телефон", "Адрес", "Поручители", "Телефоны поручителей", "Адреса поручителей",
    "Рассрочка", "Общий остаток", "Просрочено", "К оплате в ближайшие 7 дней", "Ближайшая дата",
    "Заметки клиента", "Заметки по рассрочке", "Заметки поручителей",
  ], ...debtors.map(({ loan, summary }) => {
    const client = clientById.get(loan.client_id);
    const guarantors = guarantorsByLoan.get(loan.id) ?? [];
    return [
      client?.full_name ?? "", client?.phone ?? "", client?.address ?? "",
      guarantors.map((row) => row.full_name).join("; "),
      guarantors.map((row) => row.phone ?? "").join("; "),
      guarantors.map((row) => row.address ?? "").join("; "), loan.title ?? loan.id,
      summary.remainingAmount, summary.overdueAmount, summary.upcomingAmount,
      summary.nextDueDate ? formatDateShort(summary.nextDueDate) : "",
      client?.notes ?? "", loan.notes ?? "", guarantors.map((row) => row.notes ?? "").filter(Boolean).join("; "),
    ];
  })];
  const paymentSheets = buildPaymentSheets(data, data.loans.filter((loan) => debtorIds.has(loan.id))).slice(1);
  return createXlsxFile(overdueOnly ? "prosrochennye_dolzhniki.xlsx" : "dolzhniki.xlsx", [
    { name: overdueOnly ? "Просрочившие" : "Должники", rows },
    ...paymentSheets,
  ]);
}
