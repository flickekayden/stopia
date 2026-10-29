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

- Subdirectories have their own `AGENTS.md` (e.g. `src/components/`); read it before changing files there.
- Built-in category presets live in a browser-safe constants module alongside a deduplicating merge helper; shared saved lists remain database-backed so built-ins require no migration or page-load seeding.
- Lobby categories are authoritative room settings, never automatically restored from device storage, so new rooms retain their defaults and reconnections preserve shared choices.
- Round selection uses a shuffled least-recently-used category pool capped at eight, so unused categories are exhausted before repeats.
- Voice reactions use private Storage uploads through session-hash-validated server functions and room-scoped realtime metadata; signed playback links are issued only to current-round players because the workspace blocks public buckets.
- Results reuse round ends_at as a server-issued viewing deadline and shared pacing constants; startNextRound validates the host session, expected round and readiness/override before advancing or ending to keep multiplayer transitions authoritative without changing the schema.
- Room snapshots read only the latest round; player updates and answer changes apply room-scoped realtime rows directly, with coalesced snapshot refreshes and a trailing refresh for in-flight events to avoid request storms without losing transitions.
- Independent server reads and score writes run in parallel with at most six outbound requests per batch to respect the deployed runtime budget.
- All routes share a smartphone-width shell, and portal sheets/fixed controls use the same width and safe-area offsets so desktop preserves mobile ergonomics.
- The installation worker is network-only for navigations and never caches game/session data so multiplayer state remains authoritative.
- Device haptics and installation prompts run only in effects or user handlers with capability checks so SSR and unsupported browsers stay safe.
- Presentation uses game-screen-scoped classes, unframed game-section bands, shared Button variants and semantic tokens, kept separate from multiplayer state; player colour schemes are device-local `html[data-theme]` token sets (list in `src/lib/themes.ts`, boot script avoids flashes) and admin colour overrides only tint the default scheme.
- Round starts use a future server-issued started_at and matching ends_at; shared timing helpers gate inputs and STOP without a schema change or device-local countdown origin.
- Fixed top-right controls (sound, developer gear) are reserved through the `--top-actions-space` variable (`top-actions-clear`); the page clips sideways overflow so hidden labels inside horizontal scrollers never make phones zoom out.
- Developer room management for group rooms goes through dev-token/session-verified server functions in `party.server.ts`; deletes rely on table cascades so secrets and submissions go with the room.
- Final rankings use a browser-safe competition-rank helper so equal totals share a place without changing stored scoring rules.
- Answer saves are serialized per round and late hydration preserves locally edited fields so slow acknowledgements cannot overwrite newer input.
- Non-AI game actions verify the existing hashed player session in addition to host membership; direct table policies remain a separately audited security boundary.
- Party mini-games use separate party_* tables, `party.server.ts` and `/festa/$code`, never Stop's modules; secrets (infiltrado word/role, anonymous authors, pre-reveal votes) stay in party_private/party_submissions without client grants, never in realtime-readable public_state.
- Party transitions are version-guarded, recompute submissions from the table and keep scores inside public_state, so concurrent advances resolve once; party AI prompts stay isolated in `party-ai.server.ts` with built-in fallbacks; with the AI judge (Tribunal/Debate/Roleta, `effectiveJudgeFor`) the AI only chooses among neutrally labelled entries via a version-claimed `evaluating` phase, points come from the deterministic engine, and failures fall back to a group vote (a Tribunal duel draws instead) so rounds never stall; podium AI awards are written to public_state after "final", so the ranking never waits on them.
- The home route `/` creates or joins one group room (`party_rooms` with game `lobby`); the host picks the game inside `/festa/$code`, and "Trocar de jogo" resets the same room to `lobby` so the group never re-enters a code. `/stop` and `/jogos` redirect to `/`, so no separate Stop rooms can be created or joined by code.
- Group-room Stop is a native party game (game "stop": write → evaluating → reveal) in `/festa/$code`, no second room; answers stay in party_submissions until the version-guarded judge runs once. Legacy `rooms` tables and `/sala/$code` remain only for already-open links; `stopCode` is legacy.
- Stop's AI judge lives only in `stop-judge.server.ts`, shared by both Stops so they judge identically; scoring mode and intensity are host room rules (`PartySettings`), not developer settings.
- The developer panel is context-scoped: colors on hub/lobby, Stop technical tools on Stop, per-party-game timings/tone/events in app_settings `party` via `readPartyAdmin`.
- No `attachSupabaseAuth` in `src/start.ts`: players are verified by hashed room sessions and no server function needs a Supabase bearer, so the browser database client stays out of the home page bundle; re-add it only with a real sign-in feature.
- `usePartyRoom` applies realtime rows directly (room updates version-guarded), re-syncs with one embedded room+players query on subscribe, tab return or reconnect, and polls only while realtime is silent and the tab is visible.
- Group-room chat lives in `party_chat` (anon SELECT for realtime, inserts only through session-verified `sendPartyChat`, which allows only quick reactions while Stop answers are open); crowd reactions are ephemeral realtime broadcasts, never stored, so result screens add no database writes.
- The room's cumulative "Rei da Noite" tally reuses `party_players.score`, incremented only by the caller whose version-guarded update ended the match, so replays and concurrent advances never double count.
