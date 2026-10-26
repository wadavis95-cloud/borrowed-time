# V3 — a faster, cleaner, more polished escape

User authorization: begin everything discussed after V2. Preserve V2 at `v2.0.0-preview.1`; implement on `codex/v3-polished-escape`.

## Scope

- A minimal player HUD: remaining time, ability prices/availability, movement controls, and hazard feedback. Remove distance, sectors, hits, spending totals, and run-time statistics from gameplay and results. Keep internal measurements for rules and debugging. Simple results and immediate rematches.
- Keep the 60-second starting clock. Initial tuning: 1,350m internal course, speed rising from 22m/s to 32m/s over 50 seconds of simulated running. Unobstructed, unboosted completion remains approximately 50 seconds. Checkpoints at450/900 retain +5s, presented as a time pickup, never a distance number. Faster debris descent with a readable warning. Tune spacing for reaction time.
- Free hop clears small rubble. Paid long jump clears tall barriers as well as rubble and gaps when timed correctly. Shared visual jump height must match local and opponent motion; maximum paid height around3m, with a meaningful clearance window above the barrier. Falling impacts remain dangerous overhead.
- Four distinct characters: existing Courier and Engineer plus Station Guard (tall angular older woman, silver braid, navy uniform) and Rooftop Runner (shorter compact young adult, cropped hair, short green jacket). Automatic random assignment without duplicates in a room, stable through rematch. No character-selection screen; equal game rules.
- Upgrade character modeling, materials, animation, tunnel variety, lighting, dust/impact/boost feedback, and camera feel. Establish a reusable asset pipeline and real locally served GLB character files. Original generated assets are acceptable, but do not describe them as artist-sculpted or Blender-authored unless that actually happens. Document creation and limitations honestly.
- Demonstrate a full race with four actual network clients, using explicitly labeled demo runners for simulated participants. Preserve human private-room play.
- Add optional, initially muted footstep and impact/ability sound feedback. Synthesize short sounds locally after the sound-button gesture, with no external audio service or assets.

## Architecture and choices

Keep JavaScript, Three.js0.180.0, Node and ws. Moving engines is unnecessary for this milestone. Build graphics assets separately from game rules, serve exact public routes, and keep original asset sources reproducible. Blender is not currently installed; an automated asset-authoring/export script can supply GLB files that remain editable in a modeling tool later. No new online asset service, purchase, or account is required.

Keep `createRenderer(canvas)` returning `{draw(state,time,dt,opponents),reset(),dispose()}`. Character creation retains `{group,update(state,dt),dispose()}`; feet at y0, faces -Z, renderer controls world position/jump. Add an async `preloadAvatars()` promise if assets are fetched; app waits before enabling play and shows retry on asset failure. Any required asset/helper paths must be explicitly mapped by the server.

Shared IDs: `courier`, `engineer`, `guard`, `runner`; metadata in `src/avatars.js`. `getJumpHeight(state)` exported by `src/game.js` computes visual height from public jump duration/remaining time. Appearance never changes movement/collision logic. Debris phase contract and room raceElapsed remain as in V2. Gameplay rules agent owns acceleration integration and exact collision timing.

Root owns app/UI/server asset routes, package files, demo harness and docs. Rules agent owns game/hazards/avatar metadata/rooms/network and related tests. Asset agent owns graphics/avatars and authored GLB/source files. Scene agent owns renderer/tunnel and environment helpers/assets. No concurrent edits to the same files.

## Acceptance

Verify acceleration across large/small updates, pausing, boost/stun transitions, finish/checkpoint boundaries and debris schedule consistency. Test paid barrier clearance and insufficient clearance; free hop cannot clear barriers. Test four unique avatars/rematch, snapshot privacy, exact served assets and failed loads. Browser-check four characters, actual paid barrier jump, visible falling impact, complete race/rematch, clean HUD, desktop/narrow layout, console errors and a full four-client simulation. Save actual screenshots. Document physical-phone/performance and final art limitations; no public deployment claim.
