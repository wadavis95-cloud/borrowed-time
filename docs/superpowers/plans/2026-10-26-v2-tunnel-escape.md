# V2 Tunnel Escape Implementation Plan

> **For agentic workers:** Use focused parallel tasks with disjoint file ownership; integrate and independently review the complete result. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver a playable 3D tunnel race with two automatically assigned avatars and synchronized falling debris.

**Architecture:** Preserve the authoritative JavaScript simulation and Node/ws rooms. Three.js renders a modular tunnel and articulated avatars from the existing state interface. Seeded debris schedules share race time across clients.

**Tech Stack:** JavaScript ES modules, Three.js 0.180.0, Node.js 22+, ws 8.22.0, node:test.

**Spec:** `docs/versions/V2_DESIGN.md`.

## Global constraints

- Four players per room remain supported; only two avatar designs, repeats allowed.
- No avatar-selection menu, required name entry, extra abilities, or public deployment.
- Keep V1's time costs, three lanes, and 900m course.
- Use local explicit static-file mappings for Three.js; preserve the HTTP allowlist.
- Concept art guides the style; ship and document actual browser graphics honestly.

## Review focus

1. Large frames, pause/resume and spending time cannot skip or retime debris impacts.
2. An impact plus leftover rubble cannot double-charge the same player.
3. Four-player joins and rematches preserve assigned avatar IDs and player colors.
4. Dim scenes, bright exits and translucent overlapping runners remain readable.
5. Unsupported graphics, mobile input, hidden tabs and stale rounds remain recoverable.

## Task 1: simulation, avatars and networking

Files: `src/game.js`, `src/hazards.js`, `src/avatars.js`, `src/server/rooms.js`, `src/network.js`, relevant game/network/server tests.

- [x] Add meaningful failing tests for timed impacts, warning safety, jumping rubble, no double hit, pause and large-dt equivalence; prove expected failures.
- [x] Implement the exact hazard and avatar contracts in the design, then pass game tests.
- [x] Add failing room tests for automatic assignment, repeats allowed in four-player rooms, ignored client avatar selection and stable rematches.
- [x] Implement room metadata and interpolation of the shared race timeline; preserve private opponent fields.
- [x] Run focused tests and report failures caused by concurrent integration separately.

## Task 2: articulated avatars

Files: `src/graphics/avatars.js` only.

- [x] Implement `createAvatar(avatarId, {ghost, color}) -> {group, update(state, dt), dispose()}` using original Three.js geometry.
- [x] Distinguish Courier ponytail/slimmer build/satchel and Engineer broad build/copper hair/goggles/workwear from the rear view.
- [x] Animate running, jumping, leaning and stumble from state; preserve equal gameplay dimensions and cosmetic-only appearance.
- [x] Verify module syntax, node-side construction and disposal; visually review through the integrated renderer.

## Task 3: 3D tunnel renderer

Files: `src/renderer.js`, `src/graphics/tunnel.js` and focused graphics helpers if required.

- [x] Build a modular tunnel, exit/city vista, rail details, lamps, shadow-to-daylight progression and bounded decoration pools.
- [x] Maintain `draw(state, animationTime, dt, opponents)` and `reset()`; position actors and obstacles in the same world coordinate system.
- [x] Render all four hazard phases from the shared schedule/time, with landing warnings and readable impact effects.
- [x] Integrate the avatars, stable ghost colors, reduced motion, resize and disposal/context error handling.
- [x] Verify shader/runtime behavior and camera framing in the browser after integration.

## Task 4: app integration, verification and version record

Files: `src/main.js`, `index.html`, `styles.css`, `src/server/app.js`, package files, docs and `tests/assets.test.js`.

- [x] Pin Three.js and serve its module/core files locally; add a failing HTTP test for exact public assets and rejected private paths, then implement.
- [x] Keep the lobby fast with automatic names and avatar labels; update the guide and version to the V2 preview.
- [x] Run `npm test`, real network tests and syntax checks. Review the integrated diff independently and resolve material findings.
- [x] Browser-test solo controls, hazards, two-client racing, rematches, dark/bright scenes and mobile viewport. Save evidence screenshots.
- [x] Record implementation decisions, real verification outcomes and limits in V2 release notes; open the playable preview for the user.

## Progress / decisions

- User authorized beginning V2 after approving concept direction and avatars; no further feature expansion.
- User explicitly retained four-player rooms even with two avatar designs.
- Three.js and original procedural models are implementation choices to deliver a first playable version with the existing learning stack.

- Completed local V2 preview. Verification and explicit untested device/context-loss scenarios are recorded in `docs/versions/V2_RELEASE.md`.
