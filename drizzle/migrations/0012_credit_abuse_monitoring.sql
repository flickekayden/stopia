-- Low-cost abuse monitoring for the one-time signup bonus. One row per (kind, account, UTC day) with an
-- attempt counter, so repeated denials never grow the table per request. Stores only the account id:
-- no e-mail, identity hash, network address or token. Server-only (no client grants); rows older than
-- 90 days are pruned whenever a new row is created. The bonus logic itself is unchanged.
CREATE TABLE public.credit_abuse_events (
  kind text NOT NULL CHECK (kind IN ('identity_used', 'rate_limited', 'grant_error')),
  user_id uuid NOT NULL,
  day date NOT NULL DEFAULT ((now() AT TIME ZONE 'utc')::date),
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts >= 1),
  detail text NOT NULL DEFAULT '' CHECK (char_length(detail) <= 40),
  first_at timestamptz NOT NULL DEFAULT now(),
  last_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, user_id, day)
);
GRANT ALL ON public.credit_abuse_events TO service_role;
REVOKE ALL ON public.credit_abuse_events FROM PUBLIC, anon, authenticated;
ALTER TABLE public.credit_abuse_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX credit_abuse_events_day_idx ON public.credit_abuse_events (day DESC, last_at DESC);
COMMENT ON TABLE public.credit_abuse_events IS 'Signup-bonus abuse signals per account and UTC day (attempt counter). No e-mail or identity hash. Server-only; pruned after 90 days.';

CREATE OR REPLACE FUNCTION public.credit_abuse_note(p_kind text, p_user uuid, p_detail text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE today date := (now() AT TIME ZONE 'utc')::date; n integer; fresh boolean;
BEGIN
  INSERT INTO public.credit_abuse_events (kind, user_id, day, detail)
  VALUES (p_kind, p_user, today, left(coalesce(p_detail, ''), 40))
  ON CONFLICT (kind, user_id, day) DO UPDATE
    SET attempts = least(public.credit_abuse_events.attempts + 1, 1000000), last_at = now(),
        detail = CASE WHEN EXCLUDED.detail = '' THEN public.credit_abuse_events.detail ELSE EXCLUDED.detail END
  RETURNING attempts, (xmax = 0) INTO n, fresh;
  IF fresh THEN
    DELETE FROM public.credit_abuse_events WHERE day < today - 90;
  END IF;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.credit_abuse_note(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_abuse_note(text, uuid, text) TO service_role;