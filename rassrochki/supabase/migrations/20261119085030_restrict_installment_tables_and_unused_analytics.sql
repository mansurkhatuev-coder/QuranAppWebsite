-- Restrict the installment database only; the Quran analytics project is separate.
REVOKE ALL PRIVILEGES ON TABLE public.cash_transactions, public.clients, public.investors, public.loan_guarantors, public.loans, public.offline_operation_log, public.organization_settings, public.organizations, public.payment_schedules, public.payments, public.profiles FROM PUBLIC, anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.cash_transactions, public.clients, public.investors, public.loan_guarantors, public.loans, public.offline_operation_log, public.organization_settings, public.organizations, public.payment_schedules, public.payments, public.profiles FROM authenticated;

-- The unused analytics copy is not available to public application roles.
REVOKE ALL PRIVILEGES ON TABLE public.analytics_daily, public.analytics_events, public.analytics_installations FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.client_belongs_to_org(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_belongs_to_org(uuid,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.investor_belongs_to_org(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.investor_belongs_to_org(uuid,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.loan_belongs_to_org(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.loan_belongs_to_org(uuid,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.schedule_belongs_to_org(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_belongs_to_org(uuid,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.organization_has_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.organization_has_access(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.current_organization_has_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_organization_has_access() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.user_organization_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_organization_id() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.replace_loan_guarantors(uuid,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_loan_guarantors(uuid,uuid,jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.analytics_events_upsert_installation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_organization_subscription_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_offline_row_version() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.analytics_all_time_install_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.analytics_dashboard(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_analytics_daily(date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_analytics_daily_range(date,date) FROM PUBLIC, anon, authenticated;
