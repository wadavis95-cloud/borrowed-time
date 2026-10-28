# Browser-only showcase demo

Approved: remove per-viewer server simulation and WebSockets, keep close racing / early purchases / current visuals, reuse rules and map rosters, measure before and after locally. No deployment.

1. Capture a live server-backed demo window using the protected dashboard counters and browser diagnostics.
2. Extract existing AI policy to a shared browser-safe module; keep imports compatible for callers. Extend the existing solo engine with an explicit showcase mode controlling all racers and using only public rival positions. Default solo behavior stays unchanged.
3. Replace the demo transport with a frame-driven local countdown/race adapter, snapshot-compatible HUD/results, session-only replay wins and deterministic seeded replays. No background interval or socket; hidden tabs stop advancing. Share rules, hazard scheduling, roster and renderer. Remove lobby-code wording from local-demo presentation.
4. First write failing lifecycle / all-map tests, then implement. Preserve policy regression tests. Check shared budgets, all four abilities/role assignments, rematch/exit, hidden-tab behavior, and regular online multiplayer.
5. Use the same local server and browser to compare room/socket occupancy, race JSON bytes, sampled server CPU and aggregate visible frame histograms. Record sampling/hardware and the limited nature of a single-Mac comparison. Assets/music and small monitoring requests still use HTTP.
