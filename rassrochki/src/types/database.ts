export type SubscriptionStatus = "trial" | "active" | "expired" | "disabled";

export type Profile = {
  id: string;
  organization_id: string;
  full_name: string | null;
  role: "admin";
  is_platform_admin: boolean;
  created_at: string;
};

export type Organization = {
  id: string;
  name: string;
  created_at: string;
  is_active: boolean;
  subscription_status: SubscriptionStatus;
  trial_ends_at: string | null;
  paid_until: string | null;
  access_note: string | null;
  platform_revenue: number;
};

export type PlatformOrganization = {
  id: string;
  name: string;
  created_at: string;
  is_active: boolean;
  subscription_status: string;
  trial_ends_at: string | null;
  paid_until: string | null;
  access_note: string | null;
  platform_revenue: number;
  has_access: boolean;
  last_sign_in_at: string | null;
  loans_count: number;
  active_loans_count: number;
};

export type OrganizationSettings = {
  organization_id: string;
  default_term_months: number;
  default_markup_percent: number;
  income_share_manager: number;
  income_share_investor: number;
  overdue_days: number;
  currency: string;
  contract_template: string;
  updated_at: string;
};

export type Investor = {
  id: string;
  organization_id: string;
  name: string;
  share_percent: number;
  notes: string | null;
  created_at: string;
};

export type Client = {
  id: string;
  organization_id: string;
  full_name: string;
  phone: string | null;
  notes: string | null;
  is_blacklisted: boolean;
  blacklist_note: string | null;
  created_at: string;
};

export type Loan = {
  id: string;
  organization_id: string;
  client_id: string;
  investor_id: string | null;
  title: string | null;
  /** Цена товара без наценки */
  cost_amount: number | null;
  /** Наценка % сверху */
  markup_percent: number;
  /** Сумма к возврату клиентом (= cost + наценка), до вычета взноса */
  principal: number;
  /** Первоначальный взнос; график считается от (principal - down_payment), если не schedule_on_full_amount */
  down_payment: number;
  /** true — график на всю сумму к возврату; взнос отдельно */
  schedule_on_full_amount: boolean;
  term_months: number;
  start_date: string;
  monthly_payment: number;
  /** Доля владельца в прибыли */
  income_share_manager: number;
  /** Доля инвестора в прибыли */
  income_share_investor: number;
  /** Сколько вложил инвестор в эту сделку */
  investor_amount: number | null;
  status: "active" | "closed";
  notes: string | null;
  created_at: string;
};

export type PaymentSchedule = {
  id: string;
  loan_id: string;
  organization_id: string;
  sequence_number: number;
  due_date: string;
  amount: number;
  status: "pending" | "paid" | "overdue";
  paid_at: string | null;
  paid_amount: number | null;
  receipt_path: string | null;
};

export type Payment = {
  id: string;
  loan_id: string;
  organization_id: string;
  schedule_id: string | null;
  amount: number;
  paid_at: string;
  method: string | null;
  notes: string | null;
  receipt_path: string | null;
  idempotency_key?: string | null;
};

export type LoanGuarantor = {
  id: string;
  loan_id: string;
  organization_id: string;
  full_name: string;
  phone: string | null;
  notes: string | null;
  created_at: string;
};

export type LoanWithRelations = Loan & {
  clients: Pick<Client, "full_name" | "phone"> | null;
  investors: Pick<Investor, "name"> | null;
  loan_guarantors?: LoanGuarantor[];
};

export type ScheduleWithLoan = PaymentSchedule & {
  loans: LoanWithRelations | null;
};
