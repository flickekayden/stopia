-- Legacy Stop rooms are retired: their tables become server-only (no client reads or writes).
DROP POLICY IF EXISTS "answers open" ON public.answers;
DROP POLICY IF EXISTS "players open" ON public.players;
DROP POLICY IF EXISTS "rooms open" ON public.rooms;
DROP POLICY IF EXISTS "rounds open" ON public.rounds;
DROP POLICY IF EXISTS "Chat messages are readable for realtime room feeds" ON public.chat_messages;
DROP POLICY IF EXISTS "Voice event metadata is readable" ON public.room_voice_notes;

REVOKE ALL ON public.answers, public.players, public.rooms, public.rounds, public.chat_messages, public.room_voice_notes FROM anon, authenticated;
GRANT ALL ON public.answers, public.players, public.rooms, public.rounds, public.chat_messages, public.room_voice_notes TO service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['answers', 'players', 'rooms', 'rounds', 'chat_messages', 'room_voice_notes'] LOOP
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

COMMENT ON TABLE public.rooms IS 'DEPRECATED: legacy Stop rooms, retired; server-only';
COMMENT ON TABLE public.players IS 'DEPRECATED: legacy Stop players, retired; server-only';
COMMENT ON TABLE public.rounds IS 'DEPRECATED: legacy Stop rounds, retired; server-only';
COMMENT ON TABLE public.answers IS 'DEPRECATED: legacy Stop answers, retired; server-only';
COMMENT ON TABLE public.chat_messages IS 'DEPRECATED: legacy Stop chat, retired; server-only';
COMMENT ON TABLE public.room_voice_notes IS 'DEPRECATED: legacy Stop voice notes, retired; server-only';

-- Shared category lists: anyone may read; writes only through validated server functions.
DROP POLICY IF EXISTS "Anyone can create category presets" ON public.category_presets;
REVOKE INSERT, UPDATE, DELETE ON public.category_presets FROM anon, authenticated;
GRANT SELECT ON public.category_presets TO anon, authenticated;
GRANT ALL ON public.category_presets TO service_role;

-- Group-room tables: clients only read (realtime); every write goes through session-verified server functions.
REVOKE INSERT, UPDATE, DELETE ON public.party_rooms, public.party_players, public.party_chat FROM anon, authenticated;
GRANT SELECT ON public.party_rooms, public.party_players, public.party_chat TO anon, authenticated;
GRANT ALL ON public.party_rooms, public.party_players, public.party_chat TO service_role;

-- Server-only tables: no client privileges at all (defence in depth on top of RLS without policies).
REVOKE ALL ON public.app_settings, public.party_private, public.party_sessions, public.party_submissions, public.party_rate_events FROM anon, authenticated;
GRANT ALL ON public.app_settings, public.party_private, public.party_sessions, public.party_submissions, public.party_rate_events TO service_role;

-- Visitors who are not signed in never need to probe roles.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Indexes for foreign keys and admin lists (faster deletes of rooms/players and report queues).
CREATE INDEX IF NOT EXISTS party_submissions_player_idx ON public.party_submissions (player_id);
CREATE INDEX IF NOT EXISTS party_chat_player_idx ON public.party_chat (player_id);
CREATE INDEX IF NOT EXISTS party_room_billing_wallet_idx ON public.party_room_billing (wallet_id);
CREATE INDEX IF NOT EXISTS ai_usage_room_idx ON public.ai_usage (room_id);
CREATE INDEX IF NOT EXISTS content_reports_status_idx ON public.content_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON public.admin_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS party_rooms_created_idx ON public.party_rooms (created_at DESC);