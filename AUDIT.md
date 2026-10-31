# Stopia — audit and validation, 14 October 2026

## Implemented

- Entry: character count and field-associated validation; existing create/code flows preserved.
- Lobby: initially collapsed advanced settings, live rule summary, host label, bounded category inputs, save feedback, and category draft retained on failed save.
- Round: serialized answer writes, local-edit-aware hydration, actionable save failure, retry, and no permanent button lock after marking answers finished. Timer has an accessible textual urgency label.
- Results: one category and one next-category action preserved; answer state shown in text; explanation errors can be retried without inventing a review or score change.
- Ranking: equal totals share competition ranks; tied winners are explicitly announced and no arbitrary champion is shown. Shared summary contains actual scores and omits the invitation code.
- Connection and chat: recoverable room connection errors, chat-history loading/failure feedback, text preserved on failed send, duplicate-send guard.
- Accessibility: browser zoom restriction removed; semantic tokens and reduced-motion behavior preserved.
- Server actions: start, STOP, restart and player removal now validate the existing session hash, not only a supplied player ID. Timer STOP validates the server deadline. No registration requirement added.

## Preserved

The existing AI evaluation, final analysis, explanation services, prompts, models, credentials, scoring rules, provider contracts and call strategy were not modified. Changes in `game.functions.ts` are restricted to non-AI game action validation. No schema or policy changes were applied. PWA, category presets, realtime room/chat, voice reactions, developer controls and smartphone framing remain.

## Executed tests

- `bun test tests/game.test.ts`: 6 passing tests, 15 assertions covering defaults, rotation cap, unused-before-repeated categories, deduplication, excluded letters, tied ranking and shared pacing.
- Two complete four-round matches with two independent browser contexts: create, join by code, settings, answer input, STOP, original AI results, category advancement, final ranking, clipboard sharing and replay to lobby. No browser page errors.
- Chat message with a quoted answer delivered and read on the second participant's screen.
- Reload during a live round restored submitted answers; marking finished left STOP usable.
- Narrow results and ranking checked at 320×568; ranking also checked at 640×360, 768×1024, 1280×800 and 2560×1080 without horizontal overflow.
- Browser offline simulation retained edited input; online retry succeeded. Session-forged start and STOP requests were rejected.
- A real round limited to A produced five valid answers worth 50 points, read back from both the result cards and stored player score.
- Results with 125% root text size had no horizontal overflow; screenshots reviewed.
- Observed home load: 0.42–0.70 seconds in warmed browser runs. Round evaluation: approximately 15–19 seconds. AI timing was observed, not optimized.
- Latest automatic compilation/type validation: OK.

## Remaining limitations and security findings

- Existing open read/write policies on rooms, players, rounds and answers allow direct data operations outside validated server actions. The new session checks protect those server action paths but do not make the whole data layer secure. Closing these policies requires coordinated migration of direct browser writes and session-scoped realtime reads; that security architecture change was not silently performed.
- Existing evaluation score updates are not transactional and the developer force-evaluation path may race. Existing AI/scoring implementation was intentionally not changed. Concurrent forced evaluations and partial score-write failures remain unverified.
- Player identity restoration through an expired nickname reservation and open chat/voice metadata reads retain the existing privacy limitations.
- No public/private-room setting, capacity limit, or true score-changing contestation exists. None was invented. “Entender pontuação” requests the existing explanation and does not contest or change scores.
- Real Android/iOS keyboards, microphone hardware, installed PWA, simultaneous forced reviews, full-room behavior and injected AI-provider failures were not retested. Voice/PWA implementation remains untouched.
- Native share cancellation is handled, but native mobile share was not exercised; clipboard fallback was exercised.

These limitations require separate coordinated security work or real-device testing; the audit is not a certification of complete multiplayer security.
## Audit pass — integrity, presence and abuse limits (2026-10-31)

Fixed and verified:
- Room creation checks every insert (room, host, session) and removes a half-created room; code collisions retry on the database UNIQUE constraint.
- Joining checks the session insert and removes the seat on failure; repeating a join from the same device reuses the seat.
- Wrong-code joins (20 per 10 min) and room creation (15 per hour) are limited per network address.
- Start / restart / back-to-lobby update the room first (version-guarded) and only then clear old round data; a repeated start no longer wipes a round that already began.
- Stop "STOP!" only locks the round after the answers are confirmed saved.
- Roleta "Pular desafio": answers are tagged per challenge, retries are idempotent, and the answer box resets for everyone (verified with two phones).
- Presence heartbeat: lobby shows "Ausente" for players silent over 3 minutes; they stop counting toward minimums and "everyone done" but keep their scores and seat.

Known limitation (not changed): party_rooms, party_players and party_chat stay readable by anyone holding the public key (USING (true)) because live updates depend on it and players have no sign-in. They contain only public state, nicknames, scores and chat; secrets live in party_private / party_submissions / party_sessions, which have no client access. Scoping reads per room would need real sign-in or a broadcast-only realtime redesign.
- Error toasts on home, room, and chat hide technical details (validation dumps, network, database) and say what to do next.
- "Encerrar etapa agora" asks the host to confirm when someone has not sent yet, showing how many already did.
- Verified this pass in the preview: Tribunal (2 phones) and Debate (2 phones) through the AI verdict; Quem Escreveu, Infiltrado and Roleta (3 phones) from writing into voting; Stop (2 phones) through the AI judge to the results.
- Results polish: one shared round scoreboard with shared tie places, "a N do líder" and a short staggered entrance; final ranking shows the gap to 1st and podium scores; lobby confirms "Tudo pronto" with the connected count. Verified on Stop and Debate rounds.

## Security and database audit (2026-10-31, afternoon)

Fixed:
- **High — old Stop room tables were open to anyone** (read, change and delete rooms, players, rounds, answers; read chat and voice notes). The old rooms were already closed to new games; their screen now redirects home, their server actions were removed, and the tables have no browser access at all.
- **High — unauthenticated AI and data actions on old rooms** (`finalAnalysis` spent AI with no check, legacy chat accepted any player id, `finalizeStopRound`, `listRooms`/`deleteRoom` leftovers, cached evaluations returned before the admin check). All removed with the old room actions.
- **Medium — anyone could add shared category lists directly**. Saving now goes through a validated server action (name ≤ 40, ≤ 100 categories, duplicates refused) limited to 10 saves per hour per network.
- **Medium — oversized game input**. Game payloads are capped at 40 fields / 8,000 characters, Stop answers at 30 categories × 400 characters, developer timings at 0–3600 s.
- **Low — wide table privileges**. Group-room tables are read-only for browsers; server-only tables (settings, private game data, sessions, submissions, rate counters) have no browser privileges; signed-out visitors can no longer call the role check.
- **Database** — indexes added for player/wallet/room foreign keys, the report queue, the audit log and the room list.
- Developer access tokens are renewed or switched off automatically (see the developer-mode rule).

Verified: direct requests with the public key are refused for old tables, private game tables, settings, category-list inserts, group-room updates and the role check; a two-phone Stop round ran through AI judging; saving a category list and refusing a duplicate name worked; 104 automated tests pass.

Accepted, unchanged: group-room state, player nicknames/scores and room chat stay readable by anyone with the app's technical address, because live updates work without login. No secrets are in those tables (roles, words, authors, votes and unrevealed answers stay server-only). Closing it fully needs signed-in players or server-relayed live updates. The unused `DEVELOPER_PASSWORD` secret can be deleted.
