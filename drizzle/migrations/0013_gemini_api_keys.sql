CREATE TABLE public.ai_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  api_key text NOT NULL,
  tier text NOT NULL DEFAULT 'free' CHECK (tier IN ('free','paid')),
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'ok',
  last_error text,
  last_error_at timestamptz,
  cooldown_until timestamptz,
  last_used_at timestamptz,
  uses integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.ai_api_keys FROM anon, authenticated;
GRANT ALL ON public.ai_api_keys TO service_role;
ALTER TABLE public.ai_api_keys ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.ai_api_keys IS 'Gemini API keys rotated by the server (free first). Server-only, no client grants.';