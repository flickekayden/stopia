CREATE TABLE public.room_voice_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
 player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
 round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
 nickname text NOT NULL,
 storage_path text NOT NULL,
 duration_ms integer NOT NULL CHECK (duration_ms BETWEEN 1 AND 7000),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.room_voice_notes TO anon, authenticated;
GRANT ALL ON public.room_voice_notes TO service_role;
ALTER TABLE public.room_voice_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Voice event metadata is readable" ON public.room_voice_notes FOR SELECT TO anon, authenticated USING (true);
CREATE INDEX room_voice_notes_room_created ON public.room_voice_notes(room_id, created_at);
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_voice_notes;