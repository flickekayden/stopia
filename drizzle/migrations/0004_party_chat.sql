CREATE TABLE public.party_chat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.party_rooms(id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.party_players(id) ON DELETE SET NULL,
  nickname text NOT NULL,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX party_chat_room_created_idx ON public.party_chat(room_id, created_at DESC);
GRANT SELECT ON public.party_chat TO anon, authenticated;
GRANT ALL ON public.party_chat TO service_role;
ALTER TABLE public.party_chat ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Party chat is readable for room feeds" ON public.party_chat FOR SELECT TO anon, authenticated USING (true);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'party_chat') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.party_chat;
  END IF;
END $$;