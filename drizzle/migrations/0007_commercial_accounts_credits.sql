-- Accounts, roles, AI credit wallets, payments, moderation and admin audit.
-- Credit and payment tables have NO client grants: only server functions (service_role) touch them.

CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users read their own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '' CHECK (char_length(display_name) <= 20),
  avatar text NOT NULL DEFAULT '🎲' CHECK (char_length(avatar) <= 16),
  terms_accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Bootstrap list for the first administrators: server-only, filled by the project owner.
CREATE TABLE public.admin_invites (
  email text PRIMARY KEY CHECK (email = lower(email)),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.admin_invites TO service_role;
ALTER TABLE public.admin_invites ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.admin_invites IS 'Emails that receive the admin role once their account email is confirmed. No client grants.';

CREATE OR REPLACE FUNCTION public.handle_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, left(coalesce(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'name', split_part(coalesce(NEW.email, ''), '@', 1), ''), 20))
  ON CONFLICT (id) DO NOTHING;
  IF NEW.email_confirmed_at IS NOT NULL AND EXISTS (SELECT 1 FROM public.admin_invites WHERE email = lower(NEW.email)) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user();
CREATE TRIGGER on_auth_user_confirmed AFTER UPDATE OF email_confirmed_at ON auth.users FOR EACH ROW
  WHEN (NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL) EXECUTE FUNCTION public.handle_auth_user();

-- AI credit wallets: either a signed-in account (user_id) or a server-issued guest token (stored hashed).
CREATE TABLE public.credit_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  guest_token_hash text UNIQUE,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  free_granted integer NOT NULL DEFAULT 0 CHECK (free_granted >= 0),
  purchased_total integer NOT NULL DEFAULT 0 CHECK (purchased_total >= 0),
  consumed_total integer NOT NULL DEFAULT 0 CHECK (consumed_total >= 0),
  merged_into uuid REFERENCES public.credit_wallets(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.credit_wallets TO service_role;
ALTER TABLE public.credit_wallets ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.credit_wallets IS 'AI request balance per account or guest. Changed only through the credit_* functions; no client grants.';

CREATE TABLE public.credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES public.credit_wallets(id),
  delta integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('free_grant', 'purchase', 'ai_use', 'ai_refund', 'admin_adjust', 'reversal', 'transfer_in', 'transfer_out')),
  reference text,
  note text,
  actor_user_id uuid,
  balance_after integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.credit_ledger TO service_role;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
CREATE INDEX credit_ledger_wallet ON public.credit_ledger (wallet_id, created_at DESC);
CREATE UNIQUE INDEX credit_ledger_once ON public.credit_ledger (kind, reference)
  WHERE reference IS NOT NULL AND kind IN ('free_grant', 'purchase', 'reversal', 'transfer_in', 'transfer_out');
COMMENT ON TABLE public.credit_ledger IS 'Append-only audit of every credit movement; balance_after must match the wallet after each movement.';

CREATE TABLE public.ai_usage (
  wallet_id uuid NOT NULL REFERENCES public.credit_wallets(id),
  usage_key text NOT NULL,
  room_id uuid,
  label text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('charged', 'refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet_id, usage_key)
);
GRANT ALL ON public.ai_usage TO service_role;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- Which wallet pays for a room's AI: the room creator's. Server-only (party_rooms is realtime-readable).
CREATE TABLE public.party_room_billing (
  room_id uuid PRIMARY KEY REFERENCES public.party_rooms(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES public.credit_wallets(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.party_room_billing TO service_role;
ALTER TABLE public.party_room_billing ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES public.credit_wallets(id),
  platform text NOT NULL CHECK (platform IN ('google_play')),
  product_id text NOT NULL,
  credits integer NOT NULL CHECK (credits > 0),
  price_label text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'pending', 'confirmed', 'canceled', 'declined', 'refunded', 'error')),
  purchase_token_hash text UNIQUE,
  purchase_token text,
  order_id text UNIQUE,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);
GRANT ALL ON public.payment_transactions TO service_role;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX payment_transactions_wallet ON public.payment_transactions (wallet_id, created_at DESC);
COMMENT ON TABLE public.payment_transactions IS 'Store purchases. Only server verification against the store marks a row confirmed; no client grants.';

CREATE TABLE public.admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  target text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.admin_audit TO service_role;
ALTER TABLE public.admin_audit ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid,
  room_code text NOT NULL DEFAULT '',
  reporter_player_id uuid,
  target_player_id uuid,
  target_nickname text NOT NULL DEFAULT '',
  message_id uuid,
  excerpt text NOT NULL DEFAULT '' CHECK (char_length(excerpt) <= 400),
  reason text NOT NULL CHECK (reason IN ('ofensa', 'assedio', 'spam', 'conteudo_improprio', 'outro')),
  detail text NOT NULL DEFAULT '' CHECK (char_length(detail) <= 500),
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'resolvida', 'descartada')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.content_reports TO service_role;
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

-- Atomic credit operations (row lock on the wallet; balance can never go negative).
CREATE OR REPLACE FUNCTION public.credit_apply(p_wallet uuid, p_delta integer, p_kind text, p_reference text, p_note text, p_actor uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.credit_wallets%ROWTYPE; next_balance integer;
BEGIN
  SELECT * INTO w FROM public.credit_wallets WHERE id = p_wallet FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  IF p_reference IS NOT NULL AND p_kind IN ('free_grant', 'purchase', 'reversal', 'transfer_in', 'transfer_out')
     AND EXISTS (SELECT 1 FROM public.credit_ledger WHERE kind = p_kind AND reference = p_reference) THEN
    RETURN -1; -- already applied
  END IF;
  next_balance := w.balance + p_delta;
  IF next_balance < 0 THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
  UPDATE public.credit_wallets SET
    balance = next_balance,
    free_granted = free_granted + CASE WHEN p_kind = 'free_grant' THEN p_delta ELSE 0 END,
    purchased_total = greatest(0, purchased_total + CASE WHEN p_kind IN ('purchase', 'transfer_in') THEN p_delta WHEN p_kind IN ('reversal', 'transfer_out') THEN p_delta ELSE 0 END),
    updated_at = now()
  WHERE id = p_wallet;
  INSERT INTO public.credit_ledger (wallet_id, delta, kind, reference, note, actor_user_id, balance_after)
  VALUES (p_wallet, p_delta, p_kind, p_reference, p_note, p_actor, next_balance);
  RETURN next_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_consume(p_wallet uuid, p_key text, p_room uuid, p_label text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.credit_wallets%ROWTYPE; existing text;
BEGIN
  SELECT * INTO w FROM public.credit_wallets WHERE id = p_wallet FOR UPDATE;
  IF NOT FOUND THEN RETURN 'no_wallet'; END IF;
  SELECT status INTO existing FROM public.ai_usage WHERE wallet_id = p_wallet AND usage_key = p_key;
  IF existing = 'charged' THEN RETURN 'duplicate'; END IF;
  IF w.balance < 1 THEN RETURN 'insufficient'; END IF;
  UPDATE public.credit_wallets SET balance = balance - 1, consumed_total = consumed_total + 1, updated_at = now() WHERE id = p_wallet;
  INSERT INTO public.ai_usage (wallet_id, usage_key, room_id, label, status) VALUES (p_wallet, p_key, p_room, left(coalesce(p_label, ''), 60), 'charged')
  ON CONFLICT (wallet_id, usage_key) DO UPDATE SET status = 'charged', updated_at = now();
  INSERT INTO public.credit_ledger (wallet_id, delta, kind, reference, note, balance_after)
  VALUES (p_wallet, -1, 'ai_use', p_key, left(coalesce(p_label, ''), 60), w.balance - 1);
  RETURN 'charged';
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_refund(p_wallet uuid, p_key text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.credit_wallets%ROWTYPE;
BEGIN
  SELECT * INTO w FROM public.credit_wallets WHERE id = p_wallet FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.ai_usage SET status = 'refunded', updated_at = now() WHERE wallet_id = p_wallet AND usage_key = p_key AND status = 'charged';
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.credit_wallets SET balance = balance + 1, consumed_total = greatest(0, consumed_total - 1), updated_at = now() WHERE id = p_wallet;
  INSERT INTO public.credit_ledger (wallet_id, delta, kind, reference, note, balance_after)
  VALUES (p_wallet, 1, 'ai_refund', p_key, 'IA não respondeu', w.balance + 1);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_apply(uuid, integer, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_consume(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_refund(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_apply(uuid, integer, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_consume(uuid, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_refund(uuid, text) TO service_role;
