# V5 running-style follow-up

2026-10-27 · Local game preview · Public deployment unchanged.

The runner uses a smoother, more expressive arm swing and stride from the existing pulled-back rear camera. Ratchet & Clank informed the movement direction; INSIDE remains an atmosphere reference. This is original animation authored for the existing character, not imported animation from either game.

## What changed

- Continuous fore/aft arm arcs, relaxed bent elbows and a little wrist lag.
- A rounded stride with more heel recovery and knee bend.
- A slight forward torso lean. Lane changes add no sideways lean, body yaw or lateral torso offset.
- Lane changes translate the runner while the gait continues uninterrupted.
- Animation cadence eases with speed and is capped at 2.6 full left/right cycles per second. The boost still moves the player at exactly the game-rules speed.
- Existing jump poses and landing compression remain, with a short blend back into the stride.

The changes are in `GroundedRunnerPose.cs` and `RaceActor.cs` under `unity/Assets/Study/Runtime/`. The camera, character mesh, environment, controls, purchases, collision rules and networking are unchanged. All four game runners use the updated performance.

The running feet follow an authored local loop rather than locking to the ground at all speeds. Some ground-relative foot sliding is an intentional tradeoff, particularly during boosts. The separate historical study retains its previous contact-driven motion and source.

## Verification

- Unity 6000.6.7f1 compilation: zero errors and warnings. Compressed Web export succeeded.
- Temporary Editor probe at 30/60/120 FPS: root-position error zero; supplied jump-height error below 0.00000006 units; lane-induced upper-body orientation and gait differences zero; frozen skeleton unchanged; finite transforms and cycle continuity passed.
- Measured peak animation cadence: 2.599999 cycles per second or less.
- `npm run check` passed. `npm test`: 93 passed, 9 local-socket checks skipped. `npm run test:network`: 27 passed.
- Browser: loaded the new build, inspected left/right movement, long jump/landing and boost, then completed the four-player demo and started a rematch. No browser runtime errors; the pre-existing optional FSR shader warning remains.
- Runtime file checksums and the two motion source checksums are recorded in `assets/unity/v5/build-manifest.json`.

The geometric checks establish continuity and the lack of lane banking. Whether the running style feels right remains a visual judgment in the demo.

## Backup

`/Users/wes/.codex/visualizations/2026/10/26/01a175c3-b3a4-7953-92b0-d13d11ad4017/backups/pre-fluid-running-20261027-081417/`

The verified archive `game-source-and-build.tar.gz` contains the pre-update source and playable Unity Web build, including uncommitted work. `game-history.bundle` preserves Git history. The directory's `RESTORE.md` explains how to extract into a separate folder and run it on another port without overwriting newer work.

The existing cached Unity authoring project was used to compile the matching game scene. Its two original motion files were separately backed up and restored byte-for-byte after export. The repository contains the new editable motion source and its matching Web build.
