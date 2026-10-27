# Unity Game Integration Implementation Plan

> **For agentic workers:** Use the task ownership and interface contracts below. Implement in parallel where file ownership is independent; parent performs Unity builds and end-to-end integration.

**Goal:** Adopt the approved Unity visuals in the real four-player game with a reversible V4 backup.

**Architecture:** Keep JavaScript rules/UI/networking and replace the rendering layer with an asynchronously loaded Unity Web player. Send static course data once per reset and public/local motion frames through the documented JSON bridge. Unity draws actors, pooled scenery and hazards without deciding outcomes.

**Tech Stack:** Existing Node22/JavaScript/ws; Unity6000.6.7f1/URP17.6/C#/WebGL.

**Spec:** `docs/superpowers/specs/2026-10-27-unity-game-integration.md`

## Global constraints

- Preserve the current race rules, costs and backend authority.
- Never expose opponent ability/time/stun fields.
- Keep the pulled-back camera and the original visual study available.
- Only exported build assets may be served over HTTP.
- Original game source and Git bundle must remain recoverable.

## Review focus

- Restart/rematch clears old course, foot anchors and opponent records.
- Snapshot stalls freeze race time and never invent opponent progress.
- Midair long-jump upgrade uses the rules-owned arc.
- Unity input handling does not steal room-name/code typing or touch controls.
- Four-player loading/context loss does not leave a player racing blind.

### Task1: Unity actor receiver

Files: new `RaceProtocol.cs`, `RaceActor.cs`, `BorrowedTimeRaceRenderer.cs` under Unity Assets/Study/Runtime and mirrored authoring source.

- [ ] Implement the exact course/frame DTOs and receiver method names from the spec.
- [ ] Drive approved pose/wardrobe from externally supplied distance/lane/jump values. Add ghost materials, identity palettes, local-only effects and reset handling.
- [ ] Preserve public-field-only opponents and the original camera composition.
- [ ] Compile and inspect actors in practice and live demo.

### Task2: Game tunnel and hazards

Files: `RaceWorld.cs`, `RaceEnvironmentBaker.cs`; optional backward-compatible helpers in `TunnelArtPass.cs`.

- [ ] Bake reusable interior and terminal modules without decorative lane obstructions.
- [ ] Pool nearby modules and course-driven rubble, barriers, gaps, debris and checkpoints.
- [ ] Use frame.elapsed exclusively for debris warnings/falls/landed state; align final exit with course end.
- [ ] Inspect all hazard types and module transitions.

### Task3: Browser bridge and serving

Files: `src/unity-renderer.js`, `src/unity-protocol.js`, `src/main.js`, `src/server/app.js`, tests, package metadata and docs.

- [ ] Write focused protocol tests for exact jumps, opponent privacy/culling, pause and resets.
- [ ] Load Unity asynchronously into the existing canvas; keep HTML inputs, loading progress and context-loss handling.
- [ ] Preserve the Three renderer through an explicit `?graphics=classic` review option.
- [ ] Serve exact compressed Unity files with correct MIME/encoding and streaming behavior; test allowed and forbidden paths.
- [ ] Run check/unit/network tests.

### Task4: Game build and end-to-end review

Files: `RaceSceneBuilder.cs`, exported `assets/unity/v5/`, portable Unity source package/build documentation, release notes.

- [ ] Create a separate game scene without the study simulation; retain approved rendering settings and required shader variants.
- [ ] Build compressed Web assets and copy only the game export into the repository.
- [ ] Verify solo controls, abilities, hazard timing, pause/restart, four-player demo and room/rematch behavior in browser.
- [ ] Verify portrait framing; document real-device testing still needed where applicable.
- [ ] Record exact build/test evidence, source credits and rollback commands.
