# V3.1 preview — character and motion refinement

**Version:** `3.1.0-preview.1` · **Verification date:** October 26, 2026

V3.1 is the visual update to V3. The stack remains JavaScript ES modules, Three.js 0.180.0, Node.js and `ws` 8.22.0. The game runs locally at `http://localhost:4173`; public deployment and testing on physical phones belong to V4. Development branch: `codex/v3.1-visual-motion`. Prior releases remain preserved in their Git tags.

## What changed

The Courier, Engineer, Station Guard and Rooftop Runner retain their identities and automatic assignment. Their models now have more deliberate shoulder and limb shapes, smaller shaped hands and boots, distinct faces and hair, garment panels and accessory detail. Skin, cloth, canvas, leather and metal respond differently to lighting.

Animation and camera changes smooth boost entry/release, lane movement, landings and finishing. Pause stops presentation motion, and restarting clears prior animation state. These are visual responses to the same V3 game state: they do not change the collision rules or ability costs. Local and opponent jump height still comes from the shared rules.

The tunnel has broader irregular stonework, separate dressed-stone arches, aged metal, polished rail tops, sparse railway plaques and valves, and more detailed sandstone and clockwork at the daylight exit. Its fixed-size sections remain culled as the player advances.

The [developer character study](http://localhost:4173/docs/character-preview.html) now supports boost, quarter-speed playback and freezing a pose. It is an inspection tool, not a player setup menu. Its compressed jump height keeps models in view; actual obstacle clearance is checked in the game.

## Unchanged gameplay

The V3 game rules, hazard schedule, avatar assignments, room authority, networking and demo inputs remain unchanged. The release comparison checks these files against `v3.0.0-preview.1`:

```text
src/game.js
src/hazards.js
src/avatars.js
src/server/rooms.js
src/network.js
src/demo.js
```

## Asset and environment measurements

The four GLBs remain original assets exported by `scripts/build-avatars.mjs`, with a 24-bone skin and idle, run, jump and stumble clips. They are generated with Node and Three.js, not Blender. Exact sizes and triangle counts are recorded in [the asset manifest](../../assets/characters/manifest.json) and [provenance notes](../../assets/characters/README.md).

Their combined size decreased from 4,919,712 to **3,833,464 bytes** (about 22% smaller). Combined geometry decreased from 165,628 to **123,408 triangles** (about 25% fewer). Each character uses 6–8 material draws. The baked run cycle retains its existing cadence but better matches planted-foot travel to the moving floor; this is authored contact, not terrain-aware inverse kinematics.

The tunnel-only resource comparison, before further camera frustum culling:

| Measure | V3 | V3.1 |
| --- | ---: | ---: |
| Maximum visible draws | 207 | 223 |
| Maximum visible sections | 11 | 11 |
| Unique geometries | 144 | 138 |
| Materials | 29 | 24 |
| Textures | 19 | 19 |
| Geometry vertices | 415,935 | 423,793 |
| Instances | 5,456 | 5,713 |

This is approximately 7.7% more tunnel draws and 1.9% more vertices. Counts describe scene complexity, not measured frame rate, GPU memory or phone performance. Character geometry is measured separately.

## Verification record

| Check | Observed result |
| --- | --- |
| `npm test` | 89 passed; six HTTP/socket tests intentionally skipped in this command. |
| `npm run test:network` | 24 passed, none skipped. This repeats 18 room tests and runs the six integration tests: **95 distinct tests passed across both commands**. |
| `npm run check` | All 13 application modules passed syntax checks. |
| `git diff --check` | No whitespace errors. |
| Frozen gameplay files | All six listed files are byte-identical to `v3.0.0-preview.1`. |
| Focused presentation tests | 13 real-asset and motion tests cover loading, clone/disposal safety, smooth boost release, 30/60/120Hz response, landing, reset poses, pause, reduced motion, exact actor jump height, bounded rivals and opponent privacy. |
| Asset reproducibility | Independent in-memory regeneration matched all four saved GLBs byte for byte; manifest sizes and geometry counts agree. |
| Scene checks | Actual generated texture pixels are deterministic; vertices, normals, UVs and instance matrices are finite. Side decorations stay outside the running lanes; culling, reduced-motion and reset checks passed. |
| Independent review | No material findings after reviewing final art, presentation, resource ownership, privacy and unchanged gameplay. |
| Character browser review | Inspected all four in front, back, side and three-quarter views, including run, boost and jump. Corrected rear hair coverage and running wrist orientation after the first review. Quarter-speed and frozen-pose controls operate. |
| Solo pause/restart | Paused during a boost and lane input. Clock stayed at 57.0 and actual scene pixels stayed identical across captures; only the UI toast faded. Resume advanced normally; restart reset the run and ability availability. |
| Paid barrier jump | Used the paid jump over the first seed-42 tall barrier. The model visibly cleared it and the clock showed only the two-second purchase cost and normal elapsed time. |
| Falling masonry | Captured the descending stone above its amber lane warning. Falling and persistent rubble presentation remained visible. |
| Full multiplayer browser run | Four simulated clients raced on the normal authoritative WebSocket server with four distinct characters and transparent opponents. The race completed; Watch again began a new countdown with the same identities; Exit demo restored solo controls. |
| Browser console | No warnings/errors in the checked game, demo and character-study sessions. |

Screenshots show the actual running build:

- [Four character models](../images/v3-1-characters.png)
- [Rear running poses](../images/v3-1-character-motion.png)
- [Multiplayer race and transparent opponents](../images/v3-1-multiplayer.png)
- [Paid barrier jump](../images/v3-1-barrier-jump.png)
- [Falling masonry and warning](../images/v3-1-falling-debris.png)
- [Completed four-player race](../images/v3-1-finish.png)

The V3 asset-failure, narrow-layout and optional-sound browser checks were not repeated in V3.1. Their existing automated coverage remains green. No new physical-device or public-hosting validation is claimed.

## Run and understand V3.1

```sh
npm install
npm start
```

Open `http://localhost:4173`. Choose **Practice** to play or **Watch four-player demo** to see a complete race through the normal WebSocket server.

The [beginner guide](../PROJECT_GUIDE.md) explains the code, architecture and graphics pipeline with diagrams. The [design record](V3_1_DESIGN.md) defines this version's scope. Use `npm run build:avatars` to reproduce the character assets.

## Limits and later versions

The characters are a refined stylized prototype. They still need artist-directed sculpting, richer authored textures and further animation polish before claiming parity with leading mobile games. Hair and clothing use bones, not physical cloth simulation. The collapse consists of staged scenery and timed hazards.

This release does not establish physical-phone, Safari, battery/thermal or broad GPU performance. It does not deploy the game publicly. V4 will address hosting and actual phone testing. Rooms still live in one Node process, without accounts, persistence, reconnects or production-scale capacity measurements. Human playtesting and later gameplay tuning remain useful.
