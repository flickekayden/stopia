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

- Built-in category presets live in a browser-safe constants module alongside a deduplicating merge helper; shared saved lists remain database-backed so built-ins require no migration or page-load seeding.
- Lobby categories are authoritative room settings, never automatically restored from device storage, so new rooms retain their defaults and reconnections preserve shared choices.
- Round selection uses a shuffled least-recently-used category pool capped at eight, so unused categories are exhausted before repeats.
- Voice reactions use private Storage uploads through session-hash-validated server functions and room-scoped realtime metadata; signed playback links are issued only to current-round players because the workspace blocks public buckets.
- Push-to-talk recording, playback queues and device mute are owned by the reusable voice hook mounted only in round results, so microphones and audio are released when leaving results.
- Results reuse round ends_at as a server-issued viewing deadline and shared pacing constants; startNextRound validates the host session, expected round and readiness/override before advancing or ending to keep multiplayer transitions authoritative without changing the schema.
- Global settings synchronization and theme application live in SettingsRuntime; the developer editor is lazy-loaded only for unlocked devices to keep its UI dependencies out of initial loading.
- Room snapshots read only the latest round; player updates and answer changes apply room-scoped realtime rows directly, with coalesced snapshot refreshes and a trailing refresh for in-flight events to avoid request storms without losing transitions.
- Room chat uses lightweight plain-text bubbles and design-system input controls rather than AI Markdown/attachment engines; append realtime messages and cap history at the newest 100 entries to bound work and memory.
- Results and final rankings are lazy-loaded game phases; unchanged answer cards retain memoized renders so countdown ticks do not repaint every answer.
- Independent server reads and score writes run in parallel with at most six outbound requests per batch to respect the deployed runtime budget.
- All routes share a smartphone-width shell, and portal sheets/fixed controls use the same width and safe-area offsets so desktop preserves mobile ergonomics.
- The installation worker is network-only for navigations and never caches game/session data so multiplayer state remains authoritative.
- Device haptics and installation prompts run only in effects or user handlers with capability checks so SSR and unsupported browsers stay safe.
- UI hierarchy uses unframed game-section bands, shared segmented Button variants and global semantic surface/focus tokens; keep presentation changes separate from multiplayer state and developer overrides.
- Visual refresh uses game-screen-scoped typography and layout classes with shared control variants so developer overrides and multiplayer logic remain independent of presentation.
- Built-in keyboard keys use the keyboard-key exception to the global minimum-width rule so standard QWERTY rows fit the smartphone shell without horizontal overflow.
- SettingsRuntime mounts useDockLayout to measure the active action bar and share scroll/chat clearance; short viewports keep bars in document flow so content remains reachable without changing game state.
- Round starts use a future server-issued started_at and matching ends_at; shared timing helpers gate inputs and STOP without a schema change or device-local countdown origin.
- ChatDrawer owns one chat subscription and portals its compact launcher into the active round header so message state survives phase transitions without floating over inputs.
- Device keyboard overrides hydrate from storage in effects and fall back to global developer settings until explicitly chosen, preserving SSR and device preference boundaries.
- Final rankings use a browser-safe competition-rank helper so equal totals share a place without changing stored scoring rules.
- Answer saves are serialized per round and late hydration preserves locally edited fields so slow acknowledgements cannot overwrite newer input.
- Non-AI game actions verify the existing hashed player session in addition to host membership; direct table policies remain a separately audited security boundary.
