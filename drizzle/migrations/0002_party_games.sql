CREATE TABLE public.party_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  game text NOT NULL CHECK (game IN ('tribunal','autor','infiltrado','debate','roleta')),
  status text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby','playing','ended')),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  round_number integer NOT NULL DEFAULT 0,
  phase text NOT NULL DEFAULT 'lobby',
  phase_started_at timestamptz,
  phase_ends_at timestamptz,
  public_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.party_rooms TO anon, authenticated;
GRANT ALL ON public.party_rooms TO service_role;
ALTER TABLE public.party_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Party rooms public state is readable" ON public.party_rooms FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.party_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.party_rooms(id) ON DELETE CASCADE,
  nickname text NOT NULL,
  is_host boolean NOT NULL DEFAULT false,
  score integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX party_players_room_idx ON public.party_players(room_id);
GRANT SELECT ON public.party_players TO anon, authenticated;
GRANT ALL ON public.party_players TO service_role;
ALTER TABLE public.party_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Party players are readable" ON public.party_players FOR SELECT TO anon, authenticated USING (true);

-- Private tables: no anon/authenticated grants and no policies; only validated server functions read them.
CREATE TABLE public.party_sessions (
  player_id uuid PRIMARY KEY REFERENCES public.party_players(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.party_rooms(id) ON DELETE CASCADE,
  session_hash text NOT NULL
);
CREATE INDEX party_sessions_room_idx ON public.party_sessions(room_id, session_hash);
GRANT ALL ON public.party_sessions TO service_role;
ALTER TABLE public.party_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.party_private (
  room_id uuid NOT NULL REFERENCES public.party_rooms(id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (room_id, round_number)
);
GRANT ALL ON public.party_private TO service_role;
ALTER TABLE public.party_private ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.party_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.party_rooms(id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  phase text NOT NULL,
  player_id uuid NOT NULL REFERENCES public.party_players(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, round_number, phase, player_id)
);
GRANT ALL ON public.party_submissions TO service_role;
ALTER TABLE public.party_submissions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['party_rooms','party_players']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;