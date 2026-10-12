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
