# V6 race leaderboard

The local game now shows a live leaderboard for multiplayer and the simulated four-player demo. Solo practice has no leaderboard.

- Active racers are ordered by course progress. Provisional positions update with server snapshots, without displaying metres, private clock balances or purchases.
- Escaped racers appear first, ordered by the engine's exact finish time, matching the race winner. A runner's escaped result survives a subsequent disconnect.
- Remaining active runners follow escaped racers. Timed-out and unfinished disconnected runners appear afterward as DNF (did not finish), with no finishing-place number.
- Lobby and countdown show Ready without assigning race positions. Rematches reset all results.
- Final standings stay visible after the race. If the connection drops, the heading identifies the displayed positions as last known.

The server builds a public `standings` array with only player ID, position and status in `src/server/rooms.js`. `src/main.js` joins those entries with the existing public names/colors and updates the leaderboard DOM only when its displayed values change. CSS keeps it above the course with a compact two-column layout on narrow screens. Names use text nodes rather than HTML interpolation.

Verification: 98 standard tests passed, nine socket checks skipped there; all 28 network tests passed separately. Coverage includes progress changes, sub-frame finish ordering, mixed racing/escaped/DNF states, disconnect after escape, rematch reset and public-field boundaries. Browser demo and responsive layout checked separately.

This is a local update. The public Render deployment has not been changed.
