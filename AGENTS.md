<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Subdirectories have their own `AGENTS.md` (`src/components/`, `src/lib/`); read it before changing files there.
- Lobby categories are authoritative room settings, never automatically restored from device storage, so new rooms retain their defaults and reconnections preserve shared choices.
- Voice reactions (legacy rooms) use private Storage via session-validated server functions; signed links go only to current-round players because public buckets are blocked.
- Room snapshots read only the latest round; player updates and answer changes apply room-scoped realtime rows directly, with coalesced snapshot refreshes and a trailing refresh for in-flight events to avoid request storms without losing transitions.
- All routes share a smartphone-width shell, and portal sheets/fixed controls use the same width and safe-area offsets so desktop preserves mobile ergonomics.
- The installation worker is network-only for navigations and never caches game/session data so multiplayer state remains authoritative.
- Device haptics and installation prompts run only in effects or user handlers with capability checks so SSR and unsupported browsers stay safe.
- Presentation uses game-screen-scoped classes, unframed game-section bands, shared Button variants and semantic tokens, kept separate from multiplayer state; player colour schemes are device-local `html[data-theme]` token sets (list in `src/lib/themes.ts`, boot script avoids flashes); admin colour overrides are retired and cleared, never applied.
- Round starts use a future server-issued started_at and matching ends_at; shared timing helpers gate inputs and STOP without a schema change or device-local countdown origin.
- Fixed top-right controls (sound, developer gear) are reserved through the `--top-actions-space` variable (`top-actions-clear`); the page clips sideways overflow so hidden labels inside horizontal scrollers never make phones zoom out.
- Developer room tools (room list/delete, training bots, skip step, kick, reset) and commercial admin tools go through server functions that re-check the admin role (`user_roles`) behind an account-bound signed token; there is no shared password. Developer mode opens with five taps on the home title for a signed-in admin account.
- Live voice is a WebRTC mesh signalled over a room realtime broadcast/presence channel (no media server, STUN only); `voice-rules.ts` decides when every microphone is auto-silenced.
- Answer saves are serialized per round and late hydration preserves locally edited fields so slow acknowledgements cannot overwrite newer input.
- Non-AI game actions verify the existing hashed player session in addition to host membership; direct table policies remain a separately audited security boundary.
- Party mini-games use separate party_* tables, `party.server.ts` and `/festa/$code`, never Stop's modules; secrets (infiltrado word/role, anonymous authors, pre-reveal votes) stay in party_private/party_submissions without client grants, never in realtime-readable public_state.
- The home route `/` creates or joins one group room (`party_rooms` with game `lobby`); the host picks the game inside `/festa/$code`, and "Trocar de jogo" resets the same room to `lobby` so the group never re-enters a code. `/stop` and `/jogos` redirect to `/`, so no separate Stop rooms can be created or joined by code.
- Group-room Stop is a native party game (game "stop": write → evaluating → reveal) in `/festa/$code`, no second room; answers stay in party_submissions until the version-guarded judge runs once. Legacy `rooms` tables and `/sala/$code` remain only for already-open links; `stopCode` is legacy.
- The developer panel is context-scoped: room tools, AI health and room list on hub/lobby, Stop technical tools on Stop, per-party-game timings/tone/events in app_settings `party` via `readPartyAdmin`.
- No `attachSupabaseAuth` in `src/start.ts`: accounts are optional, so credit/account server functions receive the caller's access token or server-issued guest token in their input and verify it server-side, and the browser auth client is loaded lazily to keep the home bundle light.
- `usePartyRoom` applies realtime rows directly (room updates version-guarded), re-syncs with one embedded room+players query on subscribe, tab return or reconnect, and polls only while realtime is silent and the tab is visible.
- Group-room chat is `party_chat` (anon SELECT for realtime; inserts only via session-verified `sendPartyChat`, quick reactions only while Stop answers are open); crowd reactions are unstored realtime broadcasts.
- Optional accounts and AI credits: one credit is one AI request in a group room, paid only by the room creator's wallet (`party_room_billing`); balances change only through locked `credit_*` database functions with an append-only ledger, and Android purchases are granted only after server verification with Google Play (see `src/lib/AGENTS.md`).
