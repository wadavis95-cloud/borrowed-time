# V3.1 Visual and Motion Implementation Plan

> For agentic workers: implement the user's approved visual scope in disjoint files, then integrate, independently review and verify. No further design approval is needed for this authorized release.

**Goal:** Deliver a visibly refined four-character race with more cohesive graphics and smoother presentation, preserving V3 gameplay.

**Architecture:** Shared rules and Node/ws authority stay unchanged. Original GLB assets, avatar presentation and tunnel presentation are independent work areas; root integrates the release and browser verification.

**Tech Stack:** JavaScript ES modules, Three.js 0.180.0, Node 22+, ws 8.22.0, node:test.

**Spec:** `docs/versions/V3_1_DESIGN.md`.

## Global constraints

- Preserve every V3 gameplay constant, rule, hazard schedule, multiplayer protocol and assignment.
- Retain avatar IDs, 24-bone rig contract, four clip names and shared jump arc unless a coordinated purely visual change requires a documented addition.
- Preserve local asset loading/retry, clone-safe disposal, transparent rivals, bounded resource use and reduced motion.
- Original assets only; no purchases, external services or new dependencies needed.
- V3.1 is `3.1.0-preview.1`; V4 owns deployment and physical phone validation.

## Review focus

1. Art improvement must be visible in actual browser rendering, especially the rear running view.
2. Animation must not accumulate offsets or depend materially on frame rate; paused and reset states remain stable.
3. Visual lane/height motion must agree with authoritative obstacle timing and the shared jump arc.
4. Material/ghost changes must preserve visibility in dark areas and avoid transparency artifacts.
5. Asset clone/reset/disposal must not leak or damage other racers; new routes remain allowlisted.

## Task 1 — character assets

Owner: art agent. Files: `scripts/build-avatars.mjs`, `assets/characters/*`.

- [x] Refine anatomy, face/hair variation, costume layering and material separation across all four original models.
- [x] Retain documented rig and clip interfaces, coordinate animation contact changes with the motion owner.
- [x] Export GLBs, record measurements/provenance and run real-asset checks.
- [x] Review front/back and motion screenshots and correct visible seams or clipping.

## Task 2 — animation and camera presentation

Owner: motion agent. Files: `src/graphics/avatars.js`, `src/renderer.js`, focused presentation helper/tests.

- [x] Add meaningful regression coverage for frame-rate-independent presentation, pause/reset and transitions before fixing the affected behavior.
- [x] Refine blend/lean/landing/boost/camera behavior, maintain local/shared jump agreement and opponent privacy.
- [x] Preserve cached asset resources and cleanly dispose all per-instance presentation resources.
- [x] Run targeted tests and review actual motion in browser integration.

## Task 3 — tunnel materials and atmosphere

Owner: scene agent. Files: `src/graphics/tunnel.js`, optional self-contained presentation helpers.

- [x] Refine stone scale/relief, rail/metal contrast, architecture accents and progressive daylight within existing scene interfaces.
- [x] Keep three lanes and warning markers readable, preserve culling/instancing and bounded resources.
- [x] Validate finite geometry and review actual tunnel/exit screenshots.

## Task 4 — integration and release

Owner: root. Files: package files, app version labels, developer preview, exact static routes if necessary, guide/changelog/design/release docs.

- [x] Integrate V3.1 labels and browser review views; keep player setup and HUD minimal.
- [x] Browser-review characters, motion, jumping, fall warnings, four-player completion/rematch and console logs; capture evidence.
- [x] Independently review changes and resolve material findings; run all tests/checks and verify gameplay files unchanged.
- [x] Document actual results, stack and limits; save a local commit/tag and leave the playable preview open.
