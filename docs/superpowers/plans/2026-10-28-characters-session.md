# V8.7 character choice, session wins and cover wording

User confirmed map-only cosmetic character choices, solo-inclusive cover text, and per-player session win counts. Local-only; no deployment or contest submission. Backup: backups/pre-v8.7-characters-session-20261028.bundle (4532694).

Implementation choices: optional Change picker with four actual model portraits and automatic default; duplicates allowed with existing player colors. Online choices stored per player/per map, validated server-side and locked outside lobby. Voting is unchanged; each player's preference for the winning map is honored. Stats and prices unchanged.

Win = first escaped racer, one point per round, assigned once after a complete physics step. Totals follow player ID, not costume. Online session = room membership/rematches; solo = current page/tab across replays/maps (CPU seats stay stable). Leaving/reloading starts fresh; no accounts or persistent global leaderboard. Show totals in lobby/results, keep live race HUD compact. Explicit newcover says SOLO + MULTIPLAYER, 1–4 PLAYERS; preserve older draft beside revised cover.

- [x] Tests: map validation/locking/duplicate choices, winning-map preference and rematches, once-only wins/no-DNF award, score identity across character changes, solo carry-over.
- [x] Shared score ledger + room/solo integration, optional portrait picker, results/lobby totals and clear session note.
- [x] Regenerate cover from actual gameplay, retain previous draft, update description/player-count wording.
- [x] Unit/network/release/browser checks incl phone picker/results, independent review, document/commit locally.

Execution: tests reproduced missing ledger/character protocol, then passed after implementation. Existing tests updated for the intentionally changed validated-create choice contract and public wins field (private ability fields remain excluded).157 unit pass/11 default socket skips;40 network pass;70-asset local checker pass. Independent review found no actionable defects. Browser: chosenrole carried into solo, two clients pickedCaptain in same room, naturalCPUwin counted once, phoneportrait337×479 fits390×844, phonefourresultrows/firstplacewin/replay fit. Cover regenerated with1–4/solo+multi, oldPNG preserved; video unchanged. PublicV8.4 remainsunchanged; no contest submission.
