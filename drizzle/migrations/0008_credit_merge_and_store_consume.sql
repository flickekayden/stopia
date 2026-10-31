ALTER TABLE public.payment_transactions ADD COLUMN store_consumed boolean NOT NULL DEFAULT false;
ALTER TABLE public.payment_transactions ADD COLUMN test_purchase boolean NOT NULL DEFAULT false;

-- Links a guest wallet to an account atomically. Purchased credits still unused move to the account;
-- unused free credits only follow when the account has no wallet yet (the guest wallet becomes the account's).
CREATE OR REPLACE FUNCTION public.credit_merge(p_guest uuid, p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.credit_wallets%ROWTYPE; u public.credit_wallets%ROWTYPE; moved integer;
BEGIN
  SELECT * INTO g FROM public.credit_wallets WHERE id = p_guest FOR UPDATE;
  IF NOT FOUND OR g.user_id IS NOT NULL OR g.merged_into IS NOT NULL THEN RETURN jsonb_build_object('status', 'skipped'); END IF;
  SELECT * INTO u FROM public.credit_wallets WHERE user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE public.credit_wallets SET user_id = p_user, guest_token_hash = NULL, updated_at = now() WHERE id = p_guest;
    -- Marks the account's one free grant as already received (the guest got it).
    INSERT INTO public.credit_ledger (wallet_id, delta, kind, reference, note, balance_after)
    VALUES (p_guest, 0, 'free_grant', 'free:user:' || p_user::text, 'Grátis já recebido como convidado', g.balance)
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('status', 'adopted', 'wallet', p_guest, 'moved', g.balance);
  END IF;
  moved := least(g.balance, g.purchased_total);
  IF moved > 0 THEN
    UPDATE public.credit_wallets SET balance = balance - moved, purchased_total = purchased_total - moved, updated_at = now() WHERE id = p_guest;
    INSERT INTO public.credit_ledger (wallet_id, delta, kind, reference, note, balance_after)
    VALUES (p_guest, -moved, 'transfer_out', 'merge:' || p_guest::text, 'Transferido para a conta', g.balance - moved);
    UPDATE public.credit_wallets SET balance = balance + moved, purchased_total = purchased_total + moved, updated_at = now() WHERE id = u.id;
    INSERT INTO public.credit_ledger (wallet_id, delta, kind, reference, note, balance_after)
    VALUES (u.id, moved, 'transfer_in', 'merge:' || p_guest::text, 'Recebido do convidado', u.balance + moved);
  END IF;
  UPDATE public.credit_wallets SET merged_into = u.id, guest_token_hash = NULL, updated_at = now() WHERE id = p_guest;
  RETURN jsonb_build_object('status', 'merged', 'wallet', u.id, 'moved', moved);
END;
$$;
REVOKE ALL ON FUNCTION public.credit_merge(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_merge(uuid, uuid) TO service_role;