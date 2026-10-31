CREATE TABLE public.party_rate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash text NOT NULL,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.party_rate_events TO service_role;
ALTER TABLE public.party_rate_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX party_rate_events_lookup ON public.party_rate_events (key_hash, kind, created_at DESC);
COMMENT ON TABLE public.party_rate_events IS 'Server-only counters that slow room creation floods and room-code guessing; no client grants.';