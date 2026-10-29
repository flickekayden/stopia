# UI component rules

- Push-to-talk recording, playback queues and device mute are owned by the reusable voice hook mounted only in round results, so microphones and audio are released when leaving results.
- SettingsRuntime owns global settings sync, theme application and useDockLayout (action-bar clearance; short viewports keep bars in flow); the developer editor is lazy-loaded only for unlocked devices.
- Room chat uses plain-text bubbles (no AI Markdown engines), appends realtime messages and caps history at 100 to bound work.
- Results and final rankings are lazy-loaded; unchanged answer cards stay memoized so countdown ticks do not repaint them.
- ChatDrawer owns one chat subscription and portals its compact launcher into the header slot of the screen on view (pinned room top bar, or the round HUD during answers) so message state survives phase transitions and nothing floats over content.
- Round answers use only the native keyboard with in-flow finish/STOP actions; the sticky round HUD compacts on focus, keyboard or scroll (with hysteresis) so typing never makes the header jump.
- Countdown ticks live in small leaf components (round header, deadline watcher) and Stop answer rows are memoized, so clocks never repaint whole round screens.
