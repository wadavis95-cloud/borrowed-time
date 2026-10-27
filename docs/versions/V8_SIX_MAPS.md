# V8 · Six escapes

October 27, 2026. Release prepared for the existing Render service; public verification is recorded below after deployment.

## What changed

V7's Tunnel Escape, The Last Voyage and Volcanic Jungle are joined by:

| Map | Environment | Ground / timed hazards | Assigned roles |
|---|---|---|---|
| Frozen Summit | Snowy mountain trail, snow-capped firs, icy outcrops, mountain peaks and an avalanche plume | Ice chunks, ice barriers, blue crevasses and falling ice | Mountaineer, Rescue Medic, Expedition Guide, Snow Ranger |
| Orbital Escape | External station walkway, illuminated lane seams, structural frames, station modules and solar arrays; a large planet, stars and drifting fragments | Cables, cargo containers, broken platforms and falling station fragments | Pilot, Flight Engineer, Scientist, Station Officer |
| Sandstorm Canyon | Layered sandstone walls and mesas, cacti, desert trail, dust wall and windblown particles | Sandstone rubble, tall boulders, broken crossings and falling sandstone | Explorer, Archaeologist, Caravan Scout, Desert Mechanic |

Twenty-four original animated characters across six maps. New casts use different equipment, silhouettes and proportions while retaining the existing running, jumping, lane changes and landing system. Names are assigned by role; no name field or character-selection step.

All six illustrated thumbnail cards participate in solo choice and multiplayer votes. The existing voting rules are unchanged: one changeable vote per connected player, plurality wins, server randomly breaks ties once at countdown, previous map retained if a rematch receives no votes. Everyone shares the winning map, random course seed and authoritative impact clock.

Camera, 60-second budget, three lanes, 24–32m/s pace, encounter spacing, Boost 5s and Long jump 4s are unchanged. Space gravity is visual only. Scenery particles are decorative; only marked gameplay hazards collide. Every map retains a free-hop route.

## Loading and implementation

Character GLBs are served with negotiated gzip when supported. All 24 files total 22,707,296 raw bytes and 9,931,570 compressed bytes, a 56% reduction. Raw GLB fallback remains available; `gzip;q=0` is respected, HEAD sends no body and Vary identifies encoding-dependent responses. All characters still preload before play: actual-device loading time and frame rate require phone playtesting.

- `src/graphics/expansion-worlds.js` owns the three new settings and their bounded ambient effects.
- `src/graphics/world-utils.js` shares geometry batching and resource disposal with existing worlds, preserving texture UVs.
- `src/maps.js` defines all six maps, casts, palettes and course salts.
- `src/graphics/map-obstacles.js` draws each new map's collision categories.
- `src/server/app.js` explicitly allows new modules/thumbnails and negotiates character compression without exposing arbitrary files.
- `scripts/build-avatars.mjs --expansion-only` reproduces the twelve new GLBs and gzip siblings. `npm run build:avatars` rebuilds all 24; existing V7 GLBs are unchanged in this release.

No engine rewrite, external artwork or new dependencies. The optional legacy Unity tunnel study does not implement these six maps; use the default Three.js game.

## Backup

V7 checkpoint: `cad74f265b9c459ab1af9bb9e9a844ce79ee69f6`, branch `codex/v7-three-maps`. A verified complete-history bundle was created before edits at `backups/pre-six-maps-20261027.bundle`. V6's public runtime remains recoverable as `63f820e268b2a9675ef366ccbe1378a5706a5162`. Existing tags and earlier bundles remain intact.

## Verification

- Syntax and whitespace checks.
- 123 unit tests pass; 11 network tests skipped by the default runner. All six maps clear 32 seeds without hits or purchases; the existing 128-seed tunnel regression also passes.
- 37 real HTTP/WebSocket integration checks pass, including four connected players on every map, voting/map consistency, unique roles, shared hazards and private ability purchases.
- Every compressed character asset decompresses byte-for-byte to its GLB source; all 24 rigs have validated finite geometry and animation data.
- Local release checker passes with all 57 public assets, countdown, movement, private ability spending, standings and cleanup.
- Browser rendering checked for all three new maps, an Orbital four-player demo completed with four escaped results, and all six thumbnails fit at 390×844 without horizontal overflow. Keyboard viewport testing does not emulate touch hardware.
- Independent review found no actionable correctness issues; expansion-world construction/update/disposal and all gzip files were checked separately.

## Public deployment

Pending final publication and verification.
