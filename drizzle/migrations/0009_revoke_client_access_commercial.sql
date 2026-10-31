-- Defense in depth: commercial tables are server-only even if a policy is added by mistake later.
REVOKE ALL ON public.credit_wallets, public.credit_ledger, public.ai_usage, public.party_room_billing,
  public.payment_transactions, public.admin_audit, public.content_reports, public.admin_invites FROM anon, authenticated;
REVOKE ALL ON public.user_roles FROM anon, authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
REVOKE ALL ON FUNCTION public.credit_merge(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_auth_user() FROM PUBLIC, anon, authenticated;