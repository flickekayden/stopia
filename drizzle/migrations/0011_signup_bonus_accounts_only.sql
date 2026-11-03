-- Free AI credits only for signed-in accounts, once per account and once per normalized e-mail identity.
-- Server-only: no client grants. Identity is a SHA-256 of the normalized e-mail (no plain e-mail stored),
-- kept after account deletion so deleting and recreating the same account does not grant again.

CREATE TABLE public.promo_grants (
  identity_hash text PRIMARY KEY,
  first_user_id uuid NOT NULL,
  wallet_id uuid REFERENCES public.credit_wallets(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.promo_grants TO service_role;
REVOKE ALL ON public.promo_grants FROM anon, authenticated;
ALTER TABLE public.promo_grants ENABLE ROW LEVEL SECURITY;
CREATE INDEX promo_grants_wallet_idx ON public.promo_grants (wallet_id);
COMMENT ON TABLE public.promo_grants IS 'Permanent record of the one-time signup bonus per normalized e-mail hash. Survives account deletion. No client grants.';

-- Normalized e-mail identity: lower-case, "+tag" removed; Gmail dots removed and googlemail = gmail.
CREATE OR REPLACE FUNCTION public.promo_identity_hash(p_email text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE e text; local_part text; domain_part text;
BEGIN
  e := lower(trim(coalesce(p_email, '')));
  IF position('@' IN e) = 0 THEN RETURN NULL; END IF;
  domain_part := split_part(e, '@', 2);
  local_part := split_part(split_part(e, '@', 1), '+', 1);
  IF domain_part IN ('gmail.com', 'googlemail.com') THEN
    domain_part := 'gmail.com';
    local_part := replace(local_part, '.', '');
  END IF;
  IF local_part = '' OR domain_part = '' THEN RETURN NULL; END IF;
  RETURN encode(sha256(convert_to('stopia-promo:' || local_part || '@' || domain_part, 'UTF8')), 'hex');
END;
$$;
REVOKE ALL ON FUNCTION public.promo_identity_hash(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promo_identity_hash(text) TO service_role;

-- Structural guard: at most one positive free grant per wallet, ever.
CREATE UNIQUE INDEX credit_ledger_free_grant_once_per_wallet ON public.credit_ledger (wallet_id)
  WHERE kind = 'free_grant' AND delta > 0;

-- The one-time signup bonus. The amount comes from server configuration, identity from auth.users.
-- Row lock on the account wallet serializes concurrent calls for the same account; the promo_grants
-- primary key and the ledger unique indexes make duplicates structurally impossible.
CREATE OR REPLACE FUNCTION public.credit_grant_signup(p_user uuid, p_amount integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u_email text; u_confirmed timestamptz; ident text; w public.credit_wallets%ROWTYPE; ref text; inserted integer;
BEGIN
  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 1000 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  SELECT email, email_confirmed_at INTO u_email, u_confirmed FROM auth.users WHERE id = p_user;
  IF NOT FOUND THEN RETURN 'no_user'; END IF;
  ident := public.promo_identity_hash(u_email);
  IF ident IS NULL THEN RETURN 'no_identity'; END IF;
  IF u_confirmed IS NULL THEN RETURN 'unconfirmed'; END IF;

  INSERT INTO public.credit_wallets (user_id) VALUES (p_user) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO w FROM public.credit_wallets WHERE user_id = p_user FOR UPDATE;
  ref := 'free:user:' || p_user::text;

  IF EXISTS (SELECT 1 FROM public.credit_ledger WHERE kind = 'free_grant' AND reference = ref) THEN
    IF w.free_granted > 0 THEN
      INSERT INTO public.promo_grants (identity_hash, first_user_id, wallet_id) VALUES (ident, p_user, w.id) ON CONFLICT DO NOTHING;
      RETURN 'already';
    END IF;
    RETURN 'identity_used';
  END IF;

  INSERT INTO public.promo_grants (identity_hash, first_user_id, wallet_id) VALUES (ident, p_user, w.id) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted = 0 THEN
    -- This e-mail identity already received the bonus on another (possibly deleted) account.
    INSERT INTO public.credit_ledger (wallet_id, delta, kind, reference, note, balance_after)
    VALUES (w.id, 0, 'free_grant', ref, 'Benefício já usado por este e-mail', w.balance)
    ON CONFLICT DO NOTHING;
    RETURN 'identity_used';
  END IF;

  UPDATE public.credit_wallets SET balance = balance + p_amount, free_granted = free_granted + p_amount, updated_at = now() WHERE id = w.id;
  INSERT INTO public.credit_ledger (wallet_id, delta, kind, reference, note, balance_after)
  VALUES (w.id, p_amount, 'free_grant', ref, 'Boas-vindas da conta', w.balance + p_amount);
  RETURN 'granted';
END;
$$;
REVOKE ALL ON FUNCTION public.credit_grant_signup(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_grant_signup(uuid, integer) TO service_role;

-- Guest-to-account linking: a guest that never got free credits no longer blocks the account's bonus;
-- a guest that did (legacy) counts as the account's bonus, for the account and its e-mail identity.
CREATE OR REPLACE FUNCTION public.credit_merge(p_guest uuid, p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.credit_wallets%ROWTYPE; u public.credit_wallets%ROWTYPE; moved integer; ident text;
BEGIN
  SELECT * INTO g FROM public.credit_wallets WHERE id = p_guest FOR UPDATE;
  IF NOT FOUND OR g.user_id IS NOT NULL OR g.merged_into IS NOT NULL THEN RETURN jsonb_build_object('status', 'skipped'); END IF;
  SELECT * INTO u FROM public.credit_wallets WHERE user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE public.credit_wallets SET user_id = p_user, guest_token_hash = NULL, updated_at = now() WHERE id = p_guest;
    IF g.free_granted > 0 THEN
      INSERT INTO public.credit_ledger (wallet_id, delta, kind, reference, note, balance_after)
      VALUES (p_guest, 0, 'free_grant', 'free:user:' || p_user::text, 'Grátis já recebido como convidado', g.balance)
      ON CONFLICT DO NOTHING;
      SELECT public.promo_identity_hash(email) INTO ident FROM auth.users WHERE id = p_user;
      IF ident IS NOT NULL THEN
        INSERT INTO public.promo_grants (identity_hash, first_user_id, wallet_id) VALUES (ident, p_user, p_guest) ON CONFLICT DO NOTHING;
      END IF;
    END IF;
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

-- Backfill: accounts that already received the bonus also lock their e-mail identity.
INSERT INTO public.promo_grants (identity_hash, first_user_id, wallet_id)
SELECT public.promo_identity_hash(u.email), u.id, w.id
FROM public.credit_wallets w JOIN auth.users u ON u.id = w.user_id
WHERE w.free_granted > 0 AND public.promo_identity_hash(u.email) IS NOT NULL
ON CONFLICT DO NOTHING;

COMMENT ON COLUMN public.credit_wallets.guest_token_hash IS 'Legacy guest wallets: kept with their balance, never charged for AI and never granted free credits; balance moves to an account via credit_merge.';