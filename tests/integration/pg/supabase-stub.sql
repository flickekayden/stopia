-- Minimal stand-in for the hosted platform pieces the credit migrations rely on, so the real migration
-- files run unchanged on a throwaway local PostgreSQL. Mirrors the risky platform defaults on purpose
-- (new public functions and tables are granted to anon/authenticated) so the tests prove the
-- migrations' explicit REVOKEs, not a friendlier local setup.

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

-- Pre-existing app tables referenced by the credit migrations (only the columns they need).
CREATE TABLE public.party_rooms (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text);
CREATE TABLE public.app_settings (key text PRIMARY KEY, value jsonb);
ALTER TABLE public.party_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Other pre-existing tables touched by the security-hardening migration (0010), reduced to the columns it uses.
ALTER TABLE public.party_rooms ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE public.rooms (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.players (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.rounds (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.answers (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.chat_messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.room_voice_notes (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.category_presets (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.party_players (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.party_chat (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), player_id uuid);
CREATE TABLE public.party_private (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.party_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.party_submissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), player_id uuid);
