ALTER TABLE public.party_rooms DROP CONSTRAINT IF EXISTS party_rooms_game_check;
ALTER TABLE public.party_rooms ADD CONSTRAINT party_rooms_game_check CHECK (game IN ('lobby','stop','tribunal','autor','infiltrado','debate','roleta'));
ALTER TABLE public.party_rooms ALTER COLUMN game SET DEFAULT 'lobby';