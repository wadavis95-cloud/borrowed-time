# V3 Polished Escape Implementation Plan

> **For agentic workers:** Execute focused parallel tasks with disjoint ownership, then integrate and independently review. The user has explicitly authorized implementation after the design discussion.

**Goal:** Deliver V3's cleaner, accelerating four-character race and improved graphics, with a full multiplayer demo.

**Architecture:** Preserve authoritative Node/ws rooms and shared JS rules. Separate reusable GLB art assets from graphics code. Three.js presents the richer scene; the app coordinates asset readiness, controls and minimal HUD.

**Tech Stack:** ES modules, Three.js0.180.0, Node22+, ws8.22.0, node:test.

**Spec:** `docs/versions/V3_DESIGN.md`.

## Global constraints

- 60-second initial timer, three lanes, four-player private rooms, no character selection.
- Use `courier`, `engineer`, `guard`, `runner` IDs consistently.
- Preserve HTTP allowlist and private opponent statistics.
- No unrelated framework migration, public deployment or asset purchases.
- Existing V2 tag remains recoverable; preview version `3.0.0-preview.1`.

## Review focus

1. Acceleration and speed effects cannot cause timestep-dependent collisions or skipped finish/checkpoints.
2. Assets must load before play; failure is visible/recoverable and clone disposal cannot break other players.
3. All four avatars must be recognizable, unique per room, stable across rematches, and equally playable.
4. Barrier clearance must agree with the rendered arc; overhead falling hazards remain dangerous.
5. Four characters/effects must remain readable with a compact HUD at narrow widths.

## Task 1 — rules and identities

Files: `src/game.js`, `src/hazards.js`, `src/avatars.js`, `src/server/rooms.js`, `src/network.js`, corresponding tests.

- [x] Write failing acceleration/integration, paid-barrier-jump, four-unique-identity and synchronized-hazard tests; observe expected failures.
- [x] Implement 22→32m/s ramp, 1,350m course and retuned encounters/debris; preserve timestep equivalence.
- [x] Export `getJumpHeight(state)`; implement timed paid barrier clearance and preserve free-hop limits.
- [x] Expand random assignment to four IDs, stable rematches, unchanged private snapshots.
- [x] Run focused tests and full unit suite; report interface details.

## Task 2 — character asset pipeline

Files: `src/graphics/avatars.js`, focused asset helpers, `assets/characters/*`, `scripts/build-avatars.*`, asset-specific tests if meaningful.

- [x] Author four visually distinct smooth models/materials and animated rigs; export real GLB files with reproducible sources.
- [x] Implement asset preload/clone/animation/dispose keeping createAvatar interface and ghost styling. Notify root of exact public import/asset paths.
- [x] Validate exported files, finite geometry/animation, all IDs, shared-resource disposal and asset-load failure behavior.
- [x] Review actual browser screenshots; refine silhouettes/scale/motion.

## Task 3 — environment and presentation

Files: `src/renderer.js`, `src/graphics/tunnel.js`, focused graphics helpers/environment assets.

- [x] Improve textured materials, broken architecture/section variation, lighting/atmosphere, restrained motion/boost effects and readability.
- [x] Use `getJumpHeight` for identical local/remote arcs and wait for asset availability through the app contract.
- [x] Match 1,350m course/progression and shared hazard clock; keep bounded resource use and reduced motion.
- [x] Verify browser rendering, jumping barriers, four ghosts, resize and cleanup.

## Task 4 — integration, demo and release

Files: `index.html`, `styles.css`, `src/main.js`, `src/server/app.js`, package files, demo script, docs, HTTP tests.

- [x] Remove player-facing distance/sectors/stats, simplify results and emphasize remaining time/abilities.
- [x] Integrate asset readiness and exact asset/vendor routes, with meaningful HTTP checks.
- [x] Create reproducible four-network-client demo with visible, labeled simulated runners; run it for the user.
- [x] Run all tests/syntax checks and independent review; fix material findings.
- [x] Verify desktop/narrow browser gameplay and save evidence; update guide/changelog/V3 release notes with measured results and limits.
- [x] Commit a local V3 checkpoint and leave the playable preview open.

## Completion evidence

Implemented and browser-verified on October 26, 2026. See `docs/versions/V3_RELEASE.md` for the 85 distinct passing tests, actual screenshots, independent review fix, and explicit limits. Added optional muted Web Audio feedback in `src/audio.js`; no new dependency was required.
