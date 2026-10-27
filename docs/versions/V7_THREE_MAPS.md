# V7 · Three maps, voting and automatic role names

Local preview, October 27, 2026. **Not deployed or pushed.** The public Render game remains V6.

## Play locally

Run `npm start`, then open http://localhost:4173/. Pick a thumbnail and Play solo, or create a room. Friends join the same running server using the room code. Watch demo opens four real local socket clients on the selected map.

Multiplayer players vote using the same cards. Creating a room casts the host’s initial map choice; joiners can vote for any map. One changeable vote per connected player. Most votes wins; a tie is randomly resolved by the server once when the host starts. If no one votes on a rematch, the previous map remains. The host can start with two or more players without requiring every player to vote. Voting closes at countdown. Leaving a lobby removes that vote. Rematches reopen voting with a fresh course seed.

## Maps and casts

| Map | Setting and hazards | Randomly assigned roles |
|---|---|---|
| Tunnel Escape | Existing bright tunnel, collapsing roof, rubble, walls, floor gaps | Courier, Engineer, Station Guard, Rooftop Runner |
| The Last Voyage | Large warship deck, railings, rigging, curved/torn sails, cannons and opposing ships; cargo stacks, barrels, broken deck and side-entering cannonballs; sea rises gradually | Captain, Navigator, Shipwright, Deckhand |
| Volcanic Jungle | Palms, broadleaf trees, ferns, basalt and a trail; small roots/logs, large trunks, lava gaps, falling hot rock; erupting volcano stays ahead under the existing camera | Trail Scout, Botanist, Jungle Ranger, Volcanologist |

Four distinct original characters per map, with themed headwear, equipment, palettes and proportions. They use the existing skeleton and running/jumping/landing system. Names are assigned from the character role by the server, including demos. Map changes update both name and character. There is no name field or character selector, and clients cannot impersonate another role by sending a name.

## Shared rules

Three lanes; A/D or arrows move, W/up hops, Q buys Boost, E buys Long jump. Touch controls unchanged. Same behind-runner camera. Start 60 seconds; Boost costs 5, Long jump costs 4, hits cost 3; checkpoints restore 5. Starting speed 24m/s, cap 32. The current wider encounter spacing is retained.

Collision categories remain rubble (free hop), barrier (paid jump timed above clearance), gap (paid long jump), and a timed full-height impact followed by hoppable debris. Ship impacts are cannonballs and leave splintered wreckage; jungle impacts are volcanic rocks. Ground marks warn before impact. Decorative distant eruption particles are not additional invisible collision hazards.

Each map salts the random course seed so maps get different layouts. Every player in the same room uses the server’s winning map, seed, and impact schedule. A vote can change the map without changing the round ID; clients explicitly rebuild the course on that transition. The tunnel generator’s original salt is zero, preserving the baseline layout for a fixed seed.

## Code overview

- `src/maps.js`: shared names, thumbnails, four-character rosters, course salts and vote resolution.
- `src/game.js`: shared physics and collision rules; accepts mapId, assigns the correct cast, generates the map’s seeded course.
- `src/server/rooms.js`: validates votes, removes departing votes, locks the winning map, assigns unique roles, broadcasts names/map/votes.
- `src/network.js`: rebuilds a course when the map changes, then blends actual authoritative movement.
- `src/main.js`: thumbnail cards, solo choice, lobby vote actions/counts, automatic role labels, existing HUD and controls.
- `src/graphics/worlds.js`: independent, cullable/batched ship and jungle environments; environment disposal when changing maps.
- `src/graphics/map-obstacles.js`: map-specific log/barrel/cargo/lava/deck geometry for existing collision categories.
- `src/renderer.js`: chooses the environment, draws themed incoming hazards, keeps the camera, local effects and transparent rivals.
- `scripts/build-avatars.mjs`: reproducible source for all twelve original characters; `--new-only` rebuilds only the eight added casts and their manifest.
- `assets/maps/*.svg`: original illustrated map thumbnails; `assets/characters/*.glb`: animated models.

## Backup and recovery

Before edits, the tracked working tree was clean at **fa121b174e9468ab4d67b3e381ba431991516ba1**. Full Git history and tracked assets were exported to `backups/pre-three-maps-20261027.bundle`. `git bundle verify` confirmed a complete history. The local backup directory is excluded from Git, Docker build context, and HTTP serving.

To inspect the old game without replacing current work:

```sh
git clone backups/pre-three-maps-20261027.bundle /tmp/borrowed-time-v6-backup
git -C /tmp/borrowed-time-v6-backup checkout fa121b174e9468ab4d67b3e381ba431991516ba1
```

Existing Unity studies and earlier releases remain preserved. The archived `?graphics=unity` comparison is a tunnel study, not a V7 multi-map renderer. Use the default Three.js mode for this release.

## Verification

- Syntax checks pass.
- Unit suite: 123 passed, 10 network tests skipped in the default run.
- Network suite: 33 passed, including four real clients voting and buying abilities on each map.
- Local release checker passed: all 40 public assets, health, real socket countdown, movement, private Boost and Long jump, shared hazards, standings and cleanup.
- Free-route controller cleared 32 seeds per map without hits or ability purchases; existing 128-seed tunnel regression remains passing.
- A scenery-batching regression preserves wood/soil texture coordinates alongside untextured leaves.
- New character tests validate eight different meshes with finite skinned geometry and animation clips; original four models remain unchanged.
- Browser: both new four-player demos, real two-browser vote changing ship to jungle at countdown, role labels and zero console errors. Phone-width thumbnail layout checked at 390×844; physical-phone graphics/touch testing still requires a later deployment or trusted LAN session.

This is the first playable map-art pass, with shared mechanics and themed visuals. Naval/volcanic structural physics, distinct map-specific movement rules and bespoke soundtracks are not implemented. New character assets add approximately 7.4 MB to the initial preload; phone performance and loading time should be assessed before publishing.
