import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/integrations/supabase/types";

/**
 * Public, server-rendered room preview for link cards (WhatsApp, Telegram…): only the code, chosen
 * game, status and player count — never nicknames, answers or anything private.
 */
export const getRoomPreview = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4}$/) }).parse(input))
  .handler(async ({ data }) => {
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) return null;
    const client = createClient<Database>(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    });
    const { data: room } = await client.from("party_rooms").select("id, code, game, status").eq("code", data.code).maybeSingle();
    if (!room) return null;
    const { count } = await client.from("party_players").select("id", { count: "exact", head: true }).eq("room_id", room.id);
    return { code: room.code, game: room.game, status: room.status, players: count ?? 0 };
  });
