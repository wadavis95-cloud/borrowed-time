# V8.2 · Clock, start and finish polish (local)

User approved polishing spending-time feedback, countdown and finish while preserving gameplay/prices, backing up, and testing locally before deployment. No push or deployment.

- [x] Backup V8.1 full history; read-only presentation controller with meaningful tests for confirmed purchases, aggregation, countdown/GO, pause/replay reset and authoritative outcomes.
- [x] Clock debit chip, purchased-button confirmation and cost segment; display actual time immediately, never animate fictitious balances. Only confirmed timeSpent increments trigger purchase feedback; failed actions and normal draining do not.
- [x] Existing server countdown with three race lights, optional audio ticks, unobstructive GO on actual start. Solo starts immediately; no countdown or input delay added. Muted by default, reduced-motion support.
- [x] Distinct winner/escaped/DNF finish badge, restrained result entrance and clear replay/voting action. No meters, hit counts, expenditure totals or additional player stats.
- [x] All existing checks plus controller/audio tests, real local solo/demo/room checks and responsive screenshots. Document V8.2 and commit locally; public V8 stays unchanged.

Implementation: src/race-presentation.js is a pure observer of scalar gameplay fields and room snapshots; main.js coordinates DOM, CSS/Element animations and optional sound. Existing authoritative physics, purchases, rooms, networking and map data remain untouched. UI effects bounded and cancelled/reset cleanly. Backup baseline 199ec63 (V8.1).

Execution record: verified backup bundle, implemented observer/UI modules, completed independent review and fixed countdown tones being cancelled by ready-state updates (regression reproduced before fix). Browser checks confirmed combined −9s purchase, unchanged HUD height, natural demo winner and solo time-out, replay reset, map return, and portrait/landscape result controls. Unit 138 pass/11 network skips; real-network suite 37 pass; local 62-asset release checker passes. No deployment.
