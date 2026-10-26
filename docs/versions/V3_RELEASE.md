# V3 preview — a faster, cleaner escape

**Version:** `3.0.0-preview.1` · **Verified:** October 26, 2026

V3 is playable locally on `http://localhost:4173`. It keeps the JavaScript / Three.js / Node / WebSocket architecture and adds the agreed faster race, four distinct characters, cleaner HUD, stronger jump, and a complete multiplayer watch demo. Development branch: `codex/v3-polished-escape`. V1 and V2 remain available at `v1.0.0` and `v2.0.0-preview.1`.

## What players get

- Four automatically assigned characters with different builds, hairstyles and clothing: Courier, Engineer, Station Guard and Rooftop Runner. No selection screen, duplicate characters in a room, or gameplay advantages from appearance. Assignments survive a rematch.
- Smoother skinned models, running/jumping/stumbling animation, richer tunnel surfaces, damaged roof sections, pipes, lamps, shadows, dust, boost trails and a progressively brighter exit with a clock tower.
- A 60-second starting clock, a longer course and acceleration. Internal tuning is 1,350m with base speed rising from 22 to 32m/s over 50 running seconds. Boost costs 3 seconds, paid jump costs 2, and time gates restore 5.
- A paid jump that visibly clears tall barriers when timed correctly, in addition to rubble and gaps. Free hops still clear small rubble. Falling stone remains dangerous above you and slows you when it hits.
- A HUD centered on the clock, ability buttons and immediate feedback. Distance, sectors and detailed run statistics are absent from gameplay and results.
- **Watch four-player demo**: four labeled simulated runners connect to the normal multiplayer server and send ordinary inputs. Watch again starts a fresh race; Exit demo closes all four connections and restores player controls.
- Optional local sound for footsteps, jumps, landings, boosts, hits and escape. It starts muted; the header toggle enables it through a browser user gesture.

## Asset and system changes

`scripts/build-avatars.mjs` creates four original GLB files. Each has a 24-bone skin and idle, run, jump and stumble clips. The four files total approximately 4.92MB, with 7–8 material draws per character. They are procedural Node/Three.js assets, not Blender-authored or artist-sculpted models. See [asset provenance and measurements](../../assets/characters/README.md).

The frontend waits for all assets before enabling play. Failed downloads show a clear reload message. Independent character skeletons and materials share cached geometry safely. Server routes expose only the required public game files, GLBs and Three.js loader helpers.

The backend remains authoritative. Acceleration is integrated across purchases, stuns, collisions, checkpoints and finishing without changing outcomes with the update size. Local and opponent jump motion share the same height function used for barrier clearance. Opponent balances and purchases remain private.

## Verification record

| Check | Observed result |
| --- | --- |
| `npm test` | 79 passed; six HTTP/socket tests intentionally skipped in this command. |
| `npm run test:network` | 24 passed, none skipped. This repeats 18 room tests and runs the six integration tests: **85 distinct tests passed across both commands**. |
| `npm run check` | All 13 application modules passed syntax checks. |
| `git diff --check` | No whitespace errors. |
| Rules | Acceleration and cap, boost/stun boundaries, collision timing, pause, checkpoint/finish boundaries, paid barrier clearance and insufficient clearance, debris timing, four unique identities and rematches covered. |
| GLB assets | Actual exported files load with expected rigs/clips; finite geometry, failure recovery and shared-resource disposal checked. Animation regression covers 30/60/120fps and boost release. |
| Independent review | Fixed accumulated additive animation offsets that made boost lean depend on frame rate. No other material findings remained in reviewed rules, networking, demo, renderer and app integration. |
| Actual four-player browser race | Four real WebSocket clients joined automatically with four different avatars. Transparent opponents rendered, the full race finished, Watch again started a new countdown with stable identities, and Exit demo returned to playable solo controls. |
| Paid jump in browser | Used the paid jump over the first seed-42 tall barrier; model visibly cleared it with no hit penalty. |
| Falling stone in browser | Observed the amber landing marker and descending masonry, followed by persistent rubble. Saved an actual fall-frame screenshot. |
| Asset failure | A temporary local proxy returned 404 for one character. Play remained disabled, the recovery message appeared, and Reload game recovered after the asset became available. |
| Narrow layout | 390×844 desktop browser viewport: no horizontal overflow; lane, hop and boost buttons operated with course and timer visible. |
| Optional sound | API smoke check and browser toggle on/off passed without console errors. Hidden/reset paths are implemented; audible mix quality was not assessed. |
| Browser console | No warnings/errors in the checked normal-play, demo, mobile and sound-toggle sessions. The deliberate asset-failure test produced its expected load error. |

Screenshots are captures of the running build, not concept art:

- [Four character models](../images/v3-characters.png)
- [Multiplayer race](../images/v3-multiplayer.png)
- [Paid barrier jump](../images/v3-barrier-jump.png)
- [Falling masonry](../images/v3-falling-debris.png)
- [Phone-sized controls](../images/v3-mobile.png)

## Run and understand V3

```sh
npm install
npm start
```

Open `http://localhost:4173`. Stop an older server first so the new asset routes load. The normal preview binds to this computer; see the [README](../../README.md) for trusted-LAN play with friends.

The [beginner guide](../PROJECT_GUIDE.md) explains the stack, files, state flow and graphics pipeline with diagrams. The [design record](V3_DESIGN.md) captures the scope. Open the [character study](http://localhost:4173/docs/character-preview.html) for a developer view of the real assets; it does not select characters for gameplay.

## Limits and follow-up work

This is a more developed stylized prototype, not top App Store production-art parity. Further character sculpting, detailed materials and animation polish can build on the GLB pipeline. Hair and clothing use bone motion rather than cloth simulation; the collapse is staged scenery and timed hazards rather than structural physics.

Physical phones, Safari/device coverage, battery/thermal behavior and measured graphics performance have not been validated. Desktop resizing is not a phone hardware test. Forced WebGL context loss, unsupported WebGL and OS reduced-motion switching were not exercised in this browser pass. The optional sound needs listening and device testing. LAN access on another physical device and the Docker recipe were not rerun.

Rooms remain in one Node process with no accounts, persistence, reconnects, matchmaking, public deployment or measured production capacity. Gaps retain the front-edge jump check. Difficulty is an initial tuning pass and still needs human playtesting at the higher speed.
