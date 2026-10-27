# Unity visual integration

The user approved the refined Unity runner, movement sequence and pulled-back tunnel composition for integration into the actual game, with a preserved backup. This change adopts those visuals while retaining the working race, time economy and multiplayer system.

## Architecture

Use Unity Web as the renderer behind the existing `draw(state, animationTime, dt, opponents)`, `reset()`, and `dispose()` interface. JavaScript keeps the solo rules, HUD, touch/keyboard input, audio, WebSocket transport and server snapshot interpolation. The Node server remains authoritative online. The Unity study's automatic demo, 48m loop, input, jump rules and landing speed reduction are excluded from the game scene.

A full C# game/server port would duplicate working rules and increase regression risk. Recreating the approved visuals in Three.js would lose the actual Unity rendering/pose work. The renderer bridge is the implementation choice for this integration.

## Preserved behavior and presentation

- Four-player rooms, random avatar IDs, transparent distance-correct opponents, solo practice, demo, pause, rematch and abilities continue to work.
- Use exact rules-owned jump height and shared race time; no Unity collision or ability decisions.
- Preserve the preferred rear camera offset `(0,2.2,-7.4)`, FOV41 in landscape, with portrait framing adjusted only enough to show the outer lanes.
- Map game distance to Unity at0.21 units/metre, height at0.43, and lanes at1.15 units. The first normal running pace then matches the approved4.6-unit/s study. These are presentation conversions, not changed game speeds or prices.
- Use the refined runner rig with four automatic clothing palettes for the existing identities. This first integration has one shared body/wardrobe design; the four earlier bespoke Three.js models remain in the preserved renderer.
- Reuse the approved tunnel as pooled interior modules plus a single final exit. Bake without decorative lane obstacles; create actual hazards/checkpoints from the game course.
- Local boost effects are local only. Opponents receive only the existing public movement fields and disappear outside−18..255 game metres.

## Bridge

GameObject `BorrowedTimeRaceRenderer` exposes `LoadCourse(string)`, `RenderFrame(string)`, `ResetPresentation()`.

Course JSON: `{version:1,epoch,courseLength,obstacles:[{id,type,lane,z,length}],debris:[{id,lane,z,warnAt,fallAt,impactAt}],checkpoints:[{z}]}`.

Frame JSON: `{version:1,epoch,sequence,phase,elapsed,dt,reducedMotion,player:{id,avatarId,color,phase,distance,lane,speed,jumpHeight,jumpProgress,jumpDuration,boosting,hitFlash,stunned},opponents:[{id,avatarId,color,phase,distance,lane,speed,jumpHeight,jumpProgress,jumpDuration}]}`.

`jumpProgress=-1` means grounded. `elapsed` is `raceElapsed ?? elapsed`. Unity must reject stale epochs/sequences, never advance the race clock itself, and clear pose/world history on reset. Unity keyboard capture is disabled; HTML inputs remain usable.

## Backup and deployment boundary

The complete pre-integration source and Git history are at `/Users/wes/.codex/visualizations/2026/10/26/01a175c3-b3a4-7953-92b0-d13d11ad4017/backups/pre-game-unity-integration-20261027-013919/`. V4 remains on `codex/v4-public-playtest` at6176c4a. Work is on `codex/v5-unity-integration`. The separate preview build is preserved. Serve only exported Unity build files, never the source Unity project. Ship compression and binary MIME handling. Public deployment is recorded separately from local verification.

## Verification and limits

Run existing rules/network/asset tests plus focused bridge payload/reset/privacy tests and static Unity binary serving checks. Compile/build the game scene; inspect practice, paid abilities, actual hazards, four-player demo, reconnect/rematch and portrait layout. Document browser measurements honestly; desktop viewport simulation is not physical phone testing. Preserve credits for the Snow base and surface assets. No new time-shield, difficulty or progression rules are part of this visual integration.
