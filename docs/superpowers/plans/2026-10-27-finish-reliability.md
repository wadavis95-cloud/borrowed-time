# V8.4 remaining polish plan

Execute inline using executing-plans; independent whole-diff review at end.

User approved remaining list: transitions, finish payoff, UI consistency and reliability/performance. Preserve gameplay/prices, map identities and local-only workflow. Backup verified at backups/pre-v8.4-finish-polish-20261027.bundle (6775c67).

Implementation choices: 180ms card entrances, no input delay or camera changes; bounded map-specific rescue landmark and brief local escape halo, winner-only DOM celebration; no celebration on DNF. Reduced motion disables optional animation. Button focus/touch states consistent. Asset count drives honest loading progress. Failed initial joins return to the code field with server error; existing disconnected-race menu remains. Loading deadline gives reload recovery instead of permanent spinner. No reconnect protocol or rule changes.

- [x] Tests: finish effect lifecycle/reset/reduced motion, themed result copy, actual asset progress, loading deadline.
- [x] Presentation: six distinct rescue destinations and one-shot local escape effect; nonblocking card transitions and small winner celebration; consistent UI states.
- [x] Reliability: genuine loading progress/deadline and initial join recovery; verify existing disconnect/room-full/rematch tests and resource cleanup.
- [x] Syntax/unit/network/local release checks; real browser invalid join, two-player race/disconnect, demo finish/rematch, phone layouts. Document and commit locally, no push/deploy.

Execution record: initial tests reproduced missing finish/loading modules and missing asset progress. Implemented scoped presentation and progress reporting; independent review found the deadline began after dynamic imports. Added a failing stalled-module orchestration test, then moved imports and preload under one deadline with late-completion protection. Browser found stale active boost styling on completed runs, now removed from ended states. Final tests:147 unit pass/11 default network skips;37 real-network pass;67-asset local release check pass. All six maps render; bad room returns to focused code input; natural ship demo ends with four escaped and no active boost glow, replay returns to countdown3. Portrait/landscape controls stay within the arena. Backup and gameplay-file comparison verified; no push/deploy.
